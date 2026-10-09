"""Refresh public source files with validation, hashes and an explicit audit.

Unavailable sources never replace the last usable record. Frozen geometry,
curated rosters and access-controlled IHME exports are not silently rewritten.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "WarMapsSourceRefresh/1.0"}), timeout=60) as response:
        return response.read()


def validate_csv(content, required):
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    if not set(required).issubset(reader.fieldnames or []):
        raise ValueError("Source CSV schema changed")
    if not next(reader, None):
        raise ValueError("Empty CSV")


def validate_wb(content):
    data = json.loads(content)
    if not isinstance(data, list) or len(data) != 2 or not data[1]:
        raise ValueError("Invalid World Bank response")
    if int(data[0]["pages"]) != 1:
        raise ValueError("Incomplete paginated World Bank response")


def main():
    today = date.today().isoformat()
    manifest_path = ROOT / "data/SOURCES.json"
    manifest = json.loads(manifest_path.read_text())
    sources = {s["id"]: s for s in manifest["sources"]}
    jobs = [
        ("ucdp-prio-acd-26.1", sources["ucdp-prio-acd-26.1"]["url"], "UcdpPrioConflict_v26_1.csv", ["conflict_id", "year"]),
        ("ucdp-ged-26.1", sources["ucdp-ged-26.1"]["url"], "ged261-csv.zip", None),
    ]
    for month, filename in [("06", "GEDEvent_v26_01_26_06.csv"), ("07", "GEDEvent_v26_0_7.csv"), ("08", "GEDEvent_v26_0_8.csv")]:
        sid = "ucdp-candidate-ged-2026-" + month
        jobs.append((sid, sources[sid]["url"], filename, ["id", "date_start", "date_end"]))
    for sid, indicator, end in [("world-bank-wdi-total-population", "SP.POP.TOTL", 2025), ("world-bank-wdi-crude-birth-rate", "SP.DYN.CBRT.IN", 2024)]:
        jobs.append((sid, f"https://api.worldbank.org/v2/country/all/indicator/{indicator}?date=1960:{end}&format=json&per_page=20000", f"world-bank-{indicator}-1960-{end}.json", "wb"))
    jobs.append(("owid-long-run-life-expectancy-2026-09-19", "https://ourworldindata.org/grapher/life-expectancy.csv", "owid-life-expectancy-2026-09-19.csv", ["Entity", "Code", "Year", "Life expectancy"]))
    audit = {"checked": today, "results": []}
    for sid, url, filename, schema in jobs:
        row = {"source_id": sid, "url": url, "path": "data/raw/" + filename}
        try:
            content = fetch(url)
            if filename == "UcdpPrioConflict_v26_1.csv":
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    members = [n for n in archive.namelist() if n.lower().endswith(".csv")]
                    if len(members) != 1:
                        raise ValueError("Unexpected UCDP archive")
                    content = archive.read(members[0])
            if filename.endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    if archive.testzip() is not None:
                        raise ValueError("Corrupt archive")
                    members = [n for n in archive.namelist() if n.lower().endswith(".csv")]
                    if len(members) != 1:
                        raise ValueError("Unexpected GED archive")
                    validate_csv(archive.read(members[0]), ["id", "deaths_civilians"])
            elif schema == "wb":
                validate_wb(content)
            else:
                validate_csv(content, schema)
            path = ROOT / row["path"]
            old = path.read_bytes() if path.exists() else b""
            row.update(status="unchanged" if content == old else "updated", previous_sha256=hashlib.sha256(old).hexdigest(), sha256=hashlib.sha256(content).hexdigest())
            if content != old:
                path.write_bytes(content)
                sources[sid]["retrieved"] = today
            sources[sid].update(verified=today, sha256=row["sha256"], refresh_status="Official download " + row["status"] + "; see dated refresh audit")
        except Exception as error:
            row.update(status="unavailable", error=str(error))
        audit["results"].append(row)
        print(sid, row["status"], row.get("error", ""), flush=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    (ROOT / f"data/refresh-{today}.json").write_text(json.dumps(audit, indent=2) + "\n")


if __name__ == "__main__":
    main()
