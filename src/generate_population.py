#!/usr/bin/env python3
"""Build a compact World Bank/UN total-population series for Life and Death."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from src.build_atlas import ROOT
from src.generate_crude_birth_rate import country_codes, load_rows


INDICATOR = "SP.POP.TOTL"


def generate(indicator_json: Path, country_json: Path, output: Path) -> Path:
    valid_codes = country_codes(country_json)
    rows = load_rows(indicator_json)
    series: dict[tuple[str, str], list[list[int]]] = defaultdict(list)
    for row in rows:
        code = row.get("countryiso3code", "")
        value = row.get("value")
        if code not in valid_codes or value is None:
            continue
        series[(code, row["country"]["value"])].append([int(row["date"]), round(float(value))])
    locations = [
        {"iso3": code, "name": name, "population": sorted(values)}
        for (code, name), values in sorted(series.items(), key=lambda item: item[0][1])
    ]
    years = [row[0] for item in locations for row in item["population"]]
    global_population = sorted([
        [int(row["date"]), round(float(row["value"]))]
        for row in rows if row.get("countryiso3code") == "WLD" and row.get("value") is not None
    ])
    payload = {
        "coverage": {"start_year": min(years), "end_year": max(years), "locations": len(locations)},
        "metric": {
            "id": INDICATOR,
            "label": "Population, total",
            "unit": "people",
            "measure": "De facto population at mid-year",
        },
        "source": {
            "title": "World Development Indicators: Population, total",
            "publisher": "World Bank",
            "underlying_sources": [
                "United Nations Population Division, World Population Prospects",
                "national statistical offices",
                "Eurostat Demographic Statistics",
                "United Nations Statistics Division",
            ],
            "indicator": INDICATOR,
            "url": "https://data.worldbank.org/indicator/SP.POP.TOTL",
            "license": "CC BY 4.0",
            "retrieved": "2026-09-03",
        },
        "global": global_population,
        "locations": locations,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.POPULATION_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--indicator", type=Path, default=ROOT / "data/raw/world-bank-SP.POP.TOTL-1960-2025.json")
    parser.add_argument("--countries", type=Path, default=ROOT / "data/raw/world-bank-country-metadata.json")
    parser.add_argument("--output", type=Path, default=ROOT / "web/population-data.js")
    args = parser.parse_args()
    print(generate(args.indicator, args.countries, args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
