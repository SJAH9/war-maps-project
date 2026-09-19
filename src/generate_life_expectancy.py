#!/usr/bin/env python3
"""Build a compact country-year life-expectancy asset from the archived OWID series."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from src.build_atlas import ROOT


DEFAULT_INPUT = ROOT / "data/raw/owid-life-expectancy-2026-09-19.csv"
DEFAULT_OUTPUT = ROOT / "web/life-expectancy-data.js"


def generate(source: Path, output: Path) -> Path:
    grouped: dict[tuple[str, str], list[list[float]]] = defaultdict(list)
    with source.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            code = (row.get("Code") or "").strip()
            if not code or len(code) != 3:
                continue
            name = (row.get("Entity") or "").strip()
            try:
                year = int(row["Year"])
                value = round(float(row["Life expectancy"]), 4)
            except (KeyError, TypeError, ValueError):
                continue
            grouped[(name, code)].append([year, value])
    locations = [
        {"name": name, "iso3": code, "life_expectancy": sorted(values)}
        for (name, code), values in sorted(grouped.items())
    ]
    years = [row[0] for location in locations for row in location["life_expectancy"]]
    payload = {
        "coverage": {
            "start_year": min(years),
            "end_year": max(years),
            "locations": len(locations),
            "rule": "Country observations only; source-native missing years remain missing.",
        },
        "metric": {
            "label": "Period life expectancy at birth",
            "unit": "years",
            "definition": "Expected years lived under the age-specific mortality rates observed in that year.",
        },
        "source": {
            "title": "Life expectancy – long-run data",
            "citation": "Riley (2005); Zijdeman et al. (2015); HMD (2025); UN WPP (2024), with major processing by Our World in Data",
            "url": "https://ourworldindata.org/grapher/life-expectancy",
            "peer_reviewed": {
                "title": "Estimates of Regional and Global Life Expectancy, 1800–2001",
                "journal": "Population and Development Review 31(3), 537–543",
                "doi": "https://doi.org/10.1111/j.1728-4457.2005.00083.x",
            },
            "post_1950": "United Nations World Population Prospects 2024",
            "retrieved": "2026-09-19",
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        },
        "locations": locations,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.LIFE_EXPECTANCY_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    path = generate(args.input, args.output)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
