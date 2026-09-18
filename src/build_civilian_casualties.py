#!/usr/bin/env python3
"""Aggregate UCDP GED civilian deaths by country for the casualties map."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from src.build_atlas import GEOMETRY, LOCATION_ALIASES, ROOT

GED_ZIP_CANDIDATES = (
    ROOT / "data/raw/ged251-csv.zip",
    Path("/tmp/ucdp-ged/ged251-csv.zip"),
)
CANDIDATE_SOURCES = (
    (ROOT / "data/raw/GEDEvent_v26_01_26_06.csv", "ucdp-candidate-ged-2026-06"),
    (ROOT / "data/raw/GEDEvent_v26_0_7.csv", "ucdp-candidate-ged-2026-07"),
)
OUTPUT = ROOT / "web/civilian-casualty-data.js"

ADMIN_ALIASES = {
    **LOCATION_ALIASES,
    "Ivory Coast": "Ivory Coast",
    "Cote d'Ivoire": "Ivory Coast",
    "United States": "United States of America",
    "Tanzania": "United Republic of Tanzania",
    "Macedonia": "North Macedonia",
    "Macedonia, FYR": "North Macedonia",
    "Czech Republic": "Czechia",
    "Swaziland": "eSwatini",
    "East Timor": "Timor-Leste",
    "Timor Leste": "Timor-Leste",
    "Congo": "Republic of the Congo",
    "Republic of Congo": "Republic of the Congo",
    "The Gambia": "Gambia",
    "Gambia": "Gambia",
    "Cape Verde": "Cape Verde",
    "Bahamas": "The Bahamas",
    "Venezuela": "Venezuela",
    "Bolivia": "Bolivia",
    "Laos": "Laos",
    "Syria": "Syria",
    "Iran": "Iran",
    "Moldova": "Moldova",
    "South Korea": "South Korea",
    "North Korea": "North Korea",
    "Vietnam": "Vietnam",
    "Russia": "Russia",
    "Palestine": "Palestine",
    "Kosovo": "Kosovo",
    "Madagascar (Malagasy)": "Madagascar",
    "Kingdom of eSwatini (Swaziland)": "eSwatini",
}


def as_int(value) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def load_admin_lookup() -> dict[str, dict]:
    geometry = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    lookup = {}
    for feature in geometry.get("features") or []:
        props = feature.get("properties") or {}
        admin = props.get("ADMIN")
        if not admin:
            continue
        lon, lat = props.get("LABEL_X"), props.get("LABEL_Y")
        record = {
            "admin": admin,
            "name": props.get("NAME") or admin,
            "lon": float(lon) if lon is not None else None,
            "lat": float(lat) if lat is not None else None,
            "region": props.get("CONTINENT") or props.get("REGION_UN") or "Other",
        }
        lookup[admin] = record
        lookup[props.get("NAME") or admin] = record
    return lookup


def resolve_country(name: str, lookup: dict[str, dict]) -> dict | None:
    if not name:
        return None
    if name in lookup:
        return lookup[name]
    mapped = ADMIN_ALIASES.get(name, name)
    if mapped in lookup:
        return lookup[mapped]
    return None


def read_ged_rows(path: Path):
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            member = next(item for item in archive.namelist() if item.lower().endswith(".csv"))
            with archive.open(member) as handle:
                yield from csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", newline=""))
        return
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def accumulate(rows, lookup, totals, source_label):
    unmatched = defaultdict(int)
    for row in rows:
        country = (row.get("country") or "").strip()
        civilians = as_int(row.get("deaths_civilians"))
        year = as_int(row.get("year"))
        resolved = resolve_country(country, lookup)
        if resolved is None:
            unmatched[country] += 1
            continue
        key = resolved["admin"]
        rec = totals[key]
        rec["admin"] = resolved["admin"]
        rec["name"] = resolved["name"]
        rec["lon"] = resolved["lon"]
        rec["lat"] = resolved["lat"]
        rec["region"] = resolved["region"]
        rec["civilians"] += civilians
        rec["events"] += 1
        if civilians:
            rec["events_with_civilians"] += 1
        if year:
            rec["year_start"] = min(rec["year_start"], year) if rec["year_start"] else year
            rec["year_end"] = max(rec["year_end"], year)
            rec["years"][year] += civilians
        rec["sources"].add(source_label)
        if source_label.startswith("ucdp-candidate"):
            rec["candidate_civilians"] += civilians
    return unmatched


def empty_record():
    return {
        "admin": "",
        "name": "",
        "lon": None,
        "lat": None,
        "region": "Other",
        "civilians": 0,
        "events": 0,
        "events_with_civilians": 0,
        "year_start": 0,
        "year_end": 0,
        "years": defaultdict(int),
        "sources": set(),
        "candidate_civilians": 0,
    }


def find_ged_zip() -> Path:
    for path in GED_ZIP_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "UCDP GED 25.1 zip not found. Place ged251-csv.zip in data/raw or /tmp/ucdp-ged."
    )


def build() -> dict:
    lookup = load_admin_lookup()
    totals = defaultdict(empty_record)
    unmatched = defaultdict(int)
    ged_zip = find_ged_zip()
    unmatched_hist = accumulate(read_ged_rows(ged_zip), lookup, totals, "ucdp-ged-25.1")
    for key, count in unmatched_hist.items():
        unmatched[key] += count
    for path, label in CANDIDATE_SOURCES:
        if not path.exists():
            continue
        extra = accumulate(read_ged_rows(path), lookup, totals, label)
        for key, count in extra.items():
            unmatched[key] += count
    countries = []
    for rec in totals.values():
        if rec["civilians"] <= 0 or rec["lon"] is None:
            continue
        years = sorted(
            ([year, deaths] for year, deaths in rec["years"].items() if deaths),
            key=lambda item: -item[1],
        )[:8]
        countries.append({
            "name": rec["name"],
            "admin": rec["admin"],
            "lon": rec["lon"],
            "lat": rec["lat"],
            "region": rec["region"],
            "civilians": rec["civilians"],
            "events": rec["events"],
            "events_with_civilians": rec["events_with_civilians"],
            "year_start": rec["year_start"],
            "year_end": rec["year_end"],
            "candidate_civilians": rec["candidate_civilians"],
            "years": years,
        })
    countries.sort(key=lambda item: (-item["civilians"], item["name"]))
    return {
        "snapshot": "2026-09-18",
        "metric": "deaths_civilians",
        "unit": "reported civilian deaths",
        "coverage": {
            "ged_version": "25.1",
            "ged_years": [1989, 2024],
            "candidate_through": "2026-07-31",
            "note": "UCDP GED 25.1 covers 1989-2024. Candidate events add 2026 through July. 2025 is not in these releases.",
        },
        "world_total": sum(item["civilians"] for item in countries),
        "country_count": len(countries),
        "unmatched": dict(sorted(unmatched.items(), key=lambda item: -item[1])[:20]),
        "sources": {
            "ged": "https://ucdp.uu.se/downloads/",
            "citation": "Sundberg, Ralph, and Erik Melander, 2013, Introducing the UCDP Georeferenced Event Dataset, Journal of Peace Research 50(4).",
        },
        "countries": countries,
        "external": [
            {
                "id": "gaza-ocha-moh",
                "place": "Gaza Strip",
                "admin": "Palestine",
                "lon": 34.28,
                "lat": 31.42,
                "in_ucdp": False,
                "civilians": 73470,
                "metric": "reported fatalities",
                "as_of": "2026-09-02",
                "period": "7 October 2023 – 2 September 2026",
                "source_short": "OCHA / MoH",
                "source": "UN OCHA Reported Impact Snapshot, citing Gaza Ministry of Health",
                "url": "https://reliefweb.int/report/occupied-palestinian-territory/reported-impact-snapshot-gaza-strip-2-september-2026",
                "note": "Not part of UCDP GED. UN-attributed, not UN-verified. MoH reports all recorded fatalities; it does not publish a complete civilian/combatant split. Identified names as of 31 December 2025: 71,444 (21,283 children, 10,983 women, 5,100 elderly, 34,078 men).",
            },
            {
                "id": "gaza-aoav",
                "place": "Gaza Strip",
                "admin": "Palestine",
                "lon": 34.52,
                "lat": 31.42,
                "in_ucdp": False,
                "civilians": 33949,
                "metric": "reported civilians killed by explosive weapons",
                "as_of": "2026-09-17",
                "period": "7 October 2023 – 17 September 2026",
                "source_short": "AOAV",
                "source": "Action on Armed Violence explosive-violence monitor (English-language media)",
                "url": "https://aoav.org.uk/2026/opt-casualty-monitor/",
                "note": "Not part of UCDP GED. Independent incident count of civilians reported killed by explosive weapons in Gaza. AOAV states English-language media capture about one third of actual civilian deaths from specific explosive incidents, so this is a lower bound, not a census.",
            },
        ],
    }


def write(payload: dict) -> Path:
    OUTPUT.write_text(
        "window.CIVILIAN_CASUALTY_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return OUTPUT


def main() -> int:
    payload = build()
    path = write(payload)
    print(path)
    print("countries", payload["country_count"], "world_total", payload["world_total"])
    if payload["unmatched"]:
        print("unmatched", payload["unmatched"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
