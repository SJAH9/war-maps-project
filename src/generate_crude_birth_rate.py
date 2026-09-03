#!/usr/bin/env python3
"""Build a compact World Bank/UN crude birth-rate series for Life and Death."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from src.build_atlas import ROOT


INDICATOR = "SP.DYN.CBRT.IN"


def load_rows(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or len(payload) != 2 or not isinstance(payload[1], list):
        raise ValueError("Unexpected World Bank indicator response")
    return payload[1]


def country_codes(path: Path) -> set[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or len(payload) != 2:
        raise ValueError("Unexpected World Bank country response")
    return {
        item["id"] for item in payload[1]
        if item.get("region", {}).get("id") not in (None, "", "NA")
        and item.get("region", {}).get("value") != "Aggregates"
        and len(item.get("id", "")) == 3
    }


def generate(indicator_json: Path, country_json: Path, output: Path) -> Path:
    valid_codes = country_codes(country_json)
    series: dict[tuple[str, str], list[list[float]]] = defaultdict(list)
    for row in load_rows(indicator_json):
        code = row.get("countryiso3code", "")
        value = row.get("value")
        if code not in valid_codes or value is None:
            continue
        series[(code, row["country"]["value"])].append([int(row["date"]), round(float(value), 4)])
    locations = [
        {"iso3": code, "name": name, "birth_rate": sorted(values)}
        for (code, name), values in sorted(series.items(), key=lambda item: item[0][1])
    ]
    years = [row[0] for item in locations for row in item["birth_rate"]]
    payload = {
        "coverage": {"start_year": min(years), "end_year": max(years), "locations": len(locations)},
        "metric": {
            "id": INDICATOR,
            "label": "Crude birth rate",
            "unit": "live births per 1,000 population per year",
            "measure": "Annual live births divided by mid-year population, multiplied by 1,000",
        },
        "source": {
            "title": "World Development Indicators: Birth rate, crude (per 1,000 people)",
            "publisher": "World Bank",
            "underlying_sources": [
                "United Nations Population Division, World Population Prospects",
                "national statistical offices",
                "Eurostat Demographic Statistics",
                "United Nations Statistics Division",
            ],
            "indicator": INDICATOR,
            "url": "https://data.worldbank.org/indicator/SP.DYN.CBRT.IN",
            "license": "CC BY 4.0",
            "retrieved": "2026-09-03",
        },
        "locations": locations,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.CRUDE_BIRTH_RATE_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--indicator", type=Path, default=ROOT / "data/raw/world-bank-SP.DYN.CBRT.IN-1960-2024.json")
    parser.add_argument("--countries", type=Path, default=ROOT / "data/raw/world-bank-country-metadata.json")
    parser.add_argument("--output", type=Path, default=ROOT / "web/crude-birth-rate-data.js")
    args = parser.parse_args()
    print(generate(args.indicator, args.countries, args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
