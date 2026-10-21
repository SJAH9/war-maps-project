"""Refresh located fuel observations from dated source captures, preserving geography.

Input captures and reviewed source-notes.json are deliberately required: no
undated hard-coded price may silently become today's observation. See GAS_MAP.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree

import openpyxl
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
FUELS = ("gasoline", "diesel")


def read_payload(path):
    return json.JSONDecoder().raw_decode(path.read_text().split("=", 1)[1])[0]


def table_rows(document):
    soup = BeautifulSoup(document, "html.parser")
    return [[c.get_text(" ", strip=True) for c in r.select("td")]
            for r in soup.select("tr")]


def euro_table(path):
    rows = list(openpyxl.load_workbook(path, data_only=True).active.values)
    if rows[0][0] != "in EUR" or rows[1][1:3] != ("1000 l", "1000 l"):
        raise ValueError("EU currency or units changed")
    dated = rows[1][0].date().isoformat()
    prices = {r[0]: {f: float(r[i]) / 1000 for i, f in enumerate(FUELS, 1)
                     if isinstance(r[i], (int, float))}
              for r in rows[2:] if isinstance(r[0], str)
              and isinstance(r[1], (int, float)) and not r[0].startswith("CE/EC/EG")}
    if len(prices) != 27:
        raise ValueError("Expected 27 EU member states")
    return dated, prices


def tax_breakdown(gross, net, method, source, dated):
    if not 0 <= net <= gross:
        raise ValueError(f"Invalid pre-tax price: {net} / {gross}")
    return dict(amount=round(gross-net, 6), pre_tax=round(net, 6),
                method=method, source=source, date=dated, coverage="full")


def australian_tables(text):
    result = {}
    states = {"New South Wales", "Northern Territory", "Queensland", "South Australia",
              "Tasmania", "Victoria", "Western Australia", "Australian Capital Territory"}
    for number, fuel in [(6, "gasoline"), (7, "diesel")]:
        start = text.index(f"Table {number} – Daily average retail")
        end = text.index("Table 7 – Daily average retail", start) if number == 6 else len(text)
        state = ""
        for line in text[start:end].splitlines():
            line = line.strip()
            if line in states:
                state = line
                continue
            match = re.match(r"^(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\b", line)
            if not match:
                continue
            name = match.group(1).rstrip("*")
            if name == "5 largest cities":
                continue
            key = f"{name}, {state}" if state else name
            result.setdefault(key, {})[fuel] = float(match.group(5))/100
    return result


def refresh(source_dir, payload, as_of):
    notes = json.loads((source_dir/"source-notes.json").read_text())
    observations = payload["observations"]
    updates = {}

    def apply(source, prices, dated, details=None):
        if dated > as_of:
            raise ValueError(f"Future price date for {source}: {dated}")
        rows = [r for r in observations if r["source"] == source]
        for row in rows:
            if row["name"] not in prices:
                raise ValueError(f"Missing current observation: {source} / {row['name']}")
            if dated < row["date"]:
                raise ValueError(f"Refusing older price: {row['name']}")
            row.update(prices[row["name"]], date=dated, tax_included=True)
            row["tax_components"] = {f: None for f in FUELS if row.get(f) is not None}
            if details:
                row["detail"] = details
        updates[source] = dict(observation_date=dated, observations=len(rows), checked_on=as_of)
        return rows

    aaa = (source_dir/"aaa.html").read_text()
    dated = datetime.strptime(re.search(r"Price as of\s*(\d{1,2}/\d{1,2}/\d{2})", aaa).group(1), "%m/%d/%y").date().isoformat()
    prices = {r[0]: dict(gasoline=float(r[1].strip("$")), diesel=float(r[4].strip("$")))
              for r in table_rows(aaa) if len(r) >= 5 and r[1].startswith("$")}
    apply("aaa", prices, dated)

    eia = (source_dir/"eia.html").read_text()
    dates = [datetime.strptime(d, "%m/%d/%y").date().isoformat()
             for d in re.findall(r"\b\d{2}/\d{2}/\d{2}\b", eia)]
    prices = {r[0]: dict(gasoline=float(r[3])) for r in table_rows(eia)
              if len(r) >= 4 and r[0] in {r["name"] for r in observations if r["source"] == "eia"}}
    apply("eia", prices, max(dates))

    dated, gross = euro_table(source_dir/"eu-with.xlsx")
    net_date, net = euro_table(source_dir/"eu-without.xlsx")
    if dated != net_date:
        raise ValueError("EU inclusive/exclusive observations must have identical dates")
    for row in apply("eu", gross, dated):
        for fuel, price in gross[row["name"]].items():
            row["tax_components"][fuel] = tax_breakdown(price, net[row["name"]][fuel],
                "published difference: tax-inclusive minus tax-exclusive EU observation",
                "eu_before_tax", dated)

    japan = (source_dir/"japan.html").read_text()
    soup = BeautifulSoup(japan, "html.parser")
    dated = re.search(r"Survey date:\s*(\d{4}-\d{2}-\d{2})", soup.get_text(" ", strip=True)).group(1)
    prices = {}
    for row in soup.select("tr[data-pref-name]"):
        name = row["data-pref-name"].split("(")[0].strip()
        fields = [c.get_text(" ", strip=True) for c in row.select("td")]
        prices[name] = dict(gasoline=float(fields[3]), diesel=float(fields[5]))
    apply("japan", prices, dated)

    au = australian_tables((source_dir/"accc-web-extract.txt").read_text())
    au_notes = notes["accc"]
    au_heading_date = datetime.strptime(au_notes["observation_date"], "%Y-%m-%d").strftime("%d %b").lstrip("0")
    if not au_notes["excise_verified_from_current_report"] or au_heading_date not in (source_dir/"accc-web-extract.txt").read_text():
        raise ValueError("Review the current ACCC report's date and excise before changing this capture")
    for row in apply("accc", au, au_notes["observation_date"]):
        for fuel in FUELS:
            price = row.get(fuel)
            if price is not None:
                taxes = au_notes["excise_per_litre"] + price/11
                row["tax_components"][fuel] = tax_breakdown(price, price-taxes,
                    "calculated: report-confirmed excise + GST (retail price / 11)",
                    "accc_tax", row["date"])

    india = BeautifulSoup((source_dir/"india.html").read_bytes(), "html.parser").get_text(" ", strip=True)
    prices = {}; dated = []
    for fuel, label in [("gasoline", "Petrol"), ("diesel", "Diesel")]:
        match = re.search(r"RSP of " + label + r" in Delhi as per IOCL outlet as on (\d{1,2}-[A-Za-z]+-\d{4}),\s*Rs\.\s*([\d.]+)/ltr", india)
        if not match:
            raise ValueError(f"Missing PPAC {label} headline")
        dated.append(datetime.strptime(match.group(1), "%d-%B-%Y").date().isoformat());prices[fuel] = float(match.group(2))
    if len(set(dated)) != 1:
        raise ValueError("PPAC fuels have different source dates")
    apply("india", {"Delhi (IOCL outlet)": prices}, dated[0])

    schedules = []
    for fields in table_rows((source_dir/"taiwan.html").read_bytes()):
        if len(fields) >= 5 and re.fullmatch(r"\d{4}/\d{1,2}/\d{1,2}", fields[0]) and fields[1] and fields[4]:
            date = datetime.strptime(fields[0], "%Y/%m/%d").date().isoformat()
            schedules.append((date, dict(gasoline=float(fields[1]), diesel=float(fields[4]))))
    dated, prices = max(schedules, key=lambda r:r[0])
    apply("taiwan", {"Taiwan (CPC schedule)": prices}, dated)

    # A blocked upstream is not a current observation. Preserve the newest
    # explicitly verified official publication and expose the limitation.
    nz = notes["nz"]
    rows = apply("nz", {"New Zealand (national)": {"gasoline": nz["gasoline"]}}, nz["observation_date"])
    for row in rows:
        row["refresh_status"] = "last_verified"
        row["refresh_note"] = nz["note"]
    updates["nz"]["status"] = "last_verified"
    updates["nz"]["note"] = nz["note"]

    root = ElementTree.fromstring((source_dir/"fx.html").read_bytes())
    node = next(n for n in root.iter() if "time" in n.attrib)
    rates = {n.attrib["currency"]:float(n.attrib["rate"]) for n in node if "currency" in n.attrib}
    rates["EUR"] = 1
    cbc = []
    for fields in table_rows((source_dir/"cbc.html").read_bytes()):
        if len(fields) >= 2 and re.fullmatch(r"\d{4}/\d{2}/\d{2}", fields[0]):
            cbc.append((fields[0].replace("/", "-"), float(fields[1])))
    cbc_date, twd_per_usd = max(cbc)
    if node.attrib["time"] > as_of or cbc_date > as_of:
        raise ValueError("FX observation is future-dated")
    rates["TWD"] = round(twd_per_usd*rates["USD"], 8)
    payload.update(snapshot=as_of, fx_date=node.attrib["time"], taiwan_fx_date=cbc_date,
                   usd_per_eur=rates["USD"], currency_per_eur=rates,
                   source_updates=updates, schema=2)
    payload["sources"].update(notes["sources"])
    for row in observations:
        for fuel in FUELS:
            if row.get(fuel) is not None and (row[fuel] <= 0 or row["currency"] not in rates):
                raise ValueError(f"Invalid price or FX for {row['name']}")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--output", type=Path, default=ROOT/"web/gas-price-data.js")
    args = parser.parse_args()
    datetime.strptime(args.as_of, "%Y-%m-%d")
    data = refresh(args.source_dir, read_payload(args.output), args.as_of)
    args.output.write_text("window.GAS_PRICE_DATA="+json.dumps(data, ensure_ascii=False, separators=(",", ":"))+";\n")
    audit = dict(snapshot=data["snapshot"], source_updates=data["source_updates"],
                 captures={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in args.source_dir.iterdir() if f.is_file() and f.suffix in {".html", ".xlsx", ".txt", ".json"}})
    (ROOT/"docs/fuel-price-refresh.json").write_text(json.dumps(audit, indent=2)+"\n")
    print(json.dumps(data["source_updates"], indent=2))


if __name__ == "__main__":
    main()
