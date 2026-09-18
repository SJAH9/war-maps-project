"""Build the dated, source-attributed Gas Map snapshot from downloaded source files.

This is an editorial build step, not a browser-side scraper. See docs/GAS_MAP.md
for the upstream URLs, update procedure, and measurement boundaries.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
URLS = {
    "aaa": "https://gasprices.aaa.com/state-gas-price-averages/",
    "eia": "https://www.eia.gov/petroleum/gasdiesel/",
    "eu": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
    "japan": "https://opengov.jp/en/prices/gasoline/",
    "japan_original": "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/index.html",
    "accc": "https://www.accc.gov.au/system/files/weekly-fuel-price-monitoring-report-18-september-2026.pdf",
    "nz": "https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/price-for-fuel-response-support",
    "india": "https://ppac.gov.in/all-imp-news?page=1",
    "taiwan": "https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx",
    "taiwan_fx": "https://www.cbc.gov.tw/tw/lp-645-1-1-40.html",
    "fx": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    "geonames": "https://download.geonames.org/export/dump/AU.zip",
    "us_geometry": "https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json",
    "japan_geometry": "https://github.com/dataofjapan/land/blob/master/japan.geojson",
}
CITY_COORDS = {
    "Boston": (-71.059, 42.360), "Chicago": (-87.630, 41.878),
    "Cleveland": (-81.694, 41.499), "Denver": (-104.990, 39.739),
    "Houston": (-95.370, 29.760), "Los Angeles": (-118.244, 34.052),
    "Miami": (-80.192, 25.762), "New York City": (-74.006, 40.713),
    "San Francisco": (-122.419, 37.775), "Seattle": (-122.332, 47.606),
}
AU_CAPITALS = {
    "Sydney": (151.209, -33.869), "Melbourne": (144.963, -37.814),
    "Brisbane": (153.026, -27.470), "Adelaide": (138.600, -34.929),
    "Perth": (115.861, -31.952), "Canberra": (149.130, -35.281),
    "Hobart": (147.327, -42.882), "Darwin": (130.842, -12.463),
}
AU_STATES = {
    "New South Wales": "02", "Northern Territory": "03", "Queensland": "04",
    "South Australia": "05", "Tasmania": "06", "Victoria": "07",
    "Western Australia": "08", "Australian Capital Territory": "01",
}


def cells(row: str) -> list[str]:
    return [html.unescape(re.sub(r"<[^>]+>", "", cell)).strip()
            for cell in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.I | re.S)]


def polygon_center(geometry: dict) -> tuple[float, float]:
    """Place a marker in the largest polygon, not between distant islands."""
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    rings = [polygon[0] for polygon in polygons if polygon and polygon[0]]
    if not rings:
        raise ValueError("Geometry has no outer ring")
    def area(ring):
        return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])))
    ring = max(rings, key=area)
    return (round(sum(p[0] for p in ring) / len(ring), 4),
            round(sum(p[1] for p in ring) / len(ring), 4))


def observation(name, region, scope, lon, lat, date, source, currency, unit,
                gasoline=None, diesel=None, detail="", island=False):
    return dict(name=name, region=region, scope=scope, lon=lon, lat=lat,
                date=date, source=source, currency=currency, unit=unit,
                gasoline=gasoline, diesel=diesel, detail=detail, island=island)


def us_rows(source_dir: Path) -> list[dict]:
    document = (source_dir / "war-maps-aaa.html").read_text()
    date_match = re.search(r"Price as of\s*(\d{1,2}/\d{1,2}/\d{2})", document)
    if not date_match:
        raise ValueError("AAA snapshot date missing")
    date = datetime.strptime(date_match.group(1), "%m/%d/%y").date().isoformat()
    features = json.loads((source_dir / "war-maps-us-states.json").read_text())["features"]
    centers = {f["properties"]["name"]: polygon_center(f["geometry"]) for f in features}
    result = []
    for row in re.findall(r"<tr\b[^>]*>.*?</tr>", document, re.S | re.I):
        fields = cells(row)
        if len(fields) < 5 or fields[0] not in centers:
            continue
        lon, lat = centers[fields[0]]
        result.append(observation(fields[0], "United States", "state", lon, lat, date,
            "aaa", "USD", "US gallon", float(fields[1].strip("$")),
            float(fields[4].strip("$")), "AAA state retail average",
            island=fields[0] in {"Alaska", "Hawaii"}))
    if len(result) < 50:
        raise ValueError(f"Expected 50 states plus DC, found {len(result)}")

    eia = (source_dir / "war-maps-eia.html").read_text()
    for row in re.findall(r"<tr\b[^>]*>.*?</tr>", eia, re.S | re.I):
        fields = cells(row)
        if len(fields) < 4 or fields[0] not in CITY_COORDS:
            continue
        lon, lat = CITY_COORDS[fields[0]]
        result.append(observation(fields[0], "United States", "city", lon, lat,
            "2026-09-14", "eia", "USD", "US gallon", float(fields[3]),
            detail="EIA weekly regular gasoline city survey"))
    if len([row for row in result if row["scope"] == "city"]) != 10:
        raise ValueError("Expected 10 EIA city observations")
    return result


def eu_rows(source_dir: Path, world: dict) -> list[dict]:
    sheet = openpyxl.load_workbook(source_dir / "war-maps-eu-prices.xlsx", data_only=True).active
    rows = list(sheet.values)
    date = rows[1][0].date().isoformat()
    names = {f["properties"]["ADMIN"]: f["properties"] for f in world["features"]}
    result = []
    for row in rows[2:]:
        name = row[0]
        if (not isinstance(name, str) or name.startswith("CE/EC/EG")
                or not isinstance(row[1], (int, float))):
            continue
        if name == "Malta":
            lon, lat = (14.375, 35.938)
        else:
            props = names.get(name)
            if not props:
                raise ValueError(f"No map label for EU country {name}")
            lon, lat = float(props["LABEL_X"]), float(props["LABEL_Y"])
        result.append(observation(name, "Europe", "country", lon, lat, date,
            "eu", "EUR", "litre", round(row[1] / 1000, 4),
            round(row[2] / 1000, 4) if isinstance(row[2], (int, float)) else None,
            "EU Oil Bulletin; Eurosuper 95 and automotive diesel, taxes included",
            island=name in {"Cyprus", "Malta", "Ireland"}))
    if len(result) != 27:
        raise ValueError(f"Expected 27 EU Member States, found {len(result)}")
    return result


def japan_rows(source_dir: Path) -> list[dict]:
    document = (source_dir / "war-maps-japan-prices.html").read_text()
    date_match = re.search(r"Survey date:\s*(\d{4}-\d{2}-\d{2})", document)
    if not date_match:
        raise ValueError("Japan survey date missing")
    features = json.loads((source_dir / "war-maps-japan-prefectures.geojson").read_text())["features"]
    centers = {}
    for feature in features:
        name = re.sub(r" (Ken|Fu|To)$", "", feature["properties"]["nam"])
        if name == "Hokkai Do":
            name = "Hokkaido"
        centers[name] = polygon_center(feature["geometry"])
    result = []
    for row in re.findall(r"<tr\b[^>]*data-pref-name=\"[^\"]+\"[^>]*>.*?</tr>", document, re.S | re.I):
        match = re.search(r'data-pref-name="([^"(]+)', row)
        if not match:
            continue
        name = match.group(1).strip()
        fields = cells(row)
        if name not in centers or len(fields) < 6:
            raise ValueError(f"Japan prefecture could not be joined: {name}")
        lon, lat = centers[name]
        result.append(observation(name, "Asia", "prefecture", lon, lat,
            date_match.group(1), "japan", "JPY", "litre", float(fields[3]),
            float(fields[5]), "ANRE weekly prefecture regular petrol and diesel",
            island=name in {"Hokkaido", "Okinawa", "Nagasaki", "Kagoshima"}))
    if len(result) != 47:
        raise ValueError(f"Expected 47 Japan prefectures, found {len(result)}")
    return result


def au_geonames(source_dir: Path) -> dict[tuple[str, str], tuple[float, float]]:
    with zipfile.ZipFile(source_dir / "war-maps-geonames-au.zip") as archive:
        lines = archive.read("AU.txt").decode("utf-8").splitlines()
    places = defaultdict(list)
    for line in lines:
        fields = line.split("\t")
        if fields[6] != "P":
            continue
        places[(fields[10], fields[1].casefold())].append(
            (int(fields[14] or 0), float(fields[5]), float(fields[4])))
    return {key: (max(rows)[1], max(rows)[2]) for key, rows in places.items()}


def au_table(document: str, number: int) -> list[tuple[str, str, float]]:
    start = document.index(f"Table {number} – Daily average retail")
    end = document.index(f"Table {number + 1} – Daily average retail", start) if number == 6 else document.find("Source: ACCC calculations", start)
    block = document[start:end]
    state = ""
    result = []
    for line in block.splitlines():
        plain = line.strip()
        if plain in AU_STATES:
            state = plain
            continue
        match = re.match(r"^(.+?)\s{2,}(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\b", line)
        if not match:
            continue
        name = match.group(1).strip().rstrip("*")
        if name == "5 largest cities":
            continue
        result.append((state, name, round(float(match.group(5)) / 100, 3)))
    return result


def australia_rows(source_dir: Path) -> tuple[list[dict], list[str]]:
    document = (source_dir / "war-maps-accc.txt").read_text()
    petrol = au_table(document, 6)
    diesel = {(state, name): price for state, name, price in au_table(document, 7)}
    places = au_geonames(source_dir)
    result, unmatched = [], []
    for state, name, price in petrol:
        if name in AU_CAPITALS and not state:
            lon, lat = AU_CAPITALS[name]
            scope = "capital city"
        else:
            point = places.get((AU_STATES.get(state, ""), name.casefold()))
            if not point:
                unmatched.append(f"{name}, {state}")
                continue
            lon, lat = point
            scope = "regional location"
        result.append(observation(name if not state else f"{name}, {state}",
            "Oceania", scope, lon, lat, "2026-09-16", "accc", "AUD",
            "litre", price, diesel.get((state, name)),
            "ACCC daily average regular unleaded petrol; local survey area",
            island=state == "Tasmania" or name == "Hobart"))
    if len(petrol) < 190:
        raise ValueError(f"Expected ACCC capital and 190+ regional rows, found {len(petrol)}")
    return result, unmatched


def exchange_rates(path: Path) -> tuple[str, dict[str, float]]:
    root = ElementTree.parse(path).getroot()
    dated = next(node for node in root.iter() if "time" in node.attrib)
    rates = {node.attrib["currency"]: float(node.attrib["rate"])
             for node in dated if "currency" in node.attrib}
    rates["EUR"] = 1.0
    return dated.attrib["time"], rates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True,
                        help="Directory containing the downloaded war-maps-* source files")
    parser.add_argument("--output", type=Path, default=ROOT / "web/gas-price-data.js")
    args = parser.parse_args()
    source_dir = args.source_dir
    world = json.loads((ROOT / "data/raw/ne_110m_admin_0_countries.geojson").read_text())
    observations = us_rows(source_dir) + eu_rows(source_dir, world) + japan_rows(source_dir)
    australia, unmatched = australia_rows(source_dir)
    observations.extend(australia)
    # National board price is a published weekly observation, placed at Wellington as
    # a locator only. It is not an estimate of Wellington's local pump price.
    observations.append(observation("New Zealand (national)", "Oceania", "country",
        174.776, -41.289, "2026-09-13", "nz", "NZD", "litre", 3.06,
        detail="MBIE 91 regular petrol national board price; capital marker is a locator",
        island=True))
    # PPAC gives a current IOCL-outlet observation for Delhi; it is not an India average.
    observations.append(observation("Delhi (IOCL outlet)", "Asia", "outlet",
        77.210, 28.614, "2026-09-17", "india", "INR", "litre", 102.12,
        95.20, "PPAC Delhi IOCL outlet retail selling price"))
    # CPC posts a uniform reference retail-price schedule, not an island-wide
    # survey of individual forecourts. Taipei is only a geographic locator.
    observations.append(observation("Taiwan (CPC schedule)", "Asia", "published schedule",
        121.565, 25.034, "2026-09-14", "taiwan", "TWD", "litre", 31.2,
        29.9, "CPC 92 unleaded and premium diesel published retail schedule; Taipei marker is a locator",
        island=True))
    fx_date, fx_rates = exchange_rates(source_dir / "war-maps-ecb.xml")
    # Taiwan central-bank TWD per USD closing rate, 18 September 2026.
    # Convert to TWD per EUR so the browser has one transparent equation.
    fx_rates["TWD"] = round(31.808 * fx_rates["USD"], 6)
    payload = {"snapshot": "2026-09-18", "fx_date": fx_date,
               "usd_per_eur": fx_rates["USD"], "currency_per_eur": fx_rates,
               "sources": URLS, "unlocated_australia": unmatched,
               "observations": sorted(observations, key=lambda row: (row["region"], row["name"]))}
    args.output.write_text("window.GAS_PRICE_DATA=" + json.dumps(payload, ensure_ascii=False,
        separators=(",", ":")) + ";\n", encoding="utf-8")
    counts = defaultdict(int)
    for row in observations:
        counts[row["region"]] += 1
    print(f"{args.output}: {len(observations)} located observations; {dict(counts)}")
    print(f"Unlocated ACCC places ({len(unmatched)}): {', '.join(unmatched)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
