#!/usr/bin/env python3
"""Build compact IHME mortality and fertility series for Life and Death."""

from __future__ import annotations

import argparse
import csv
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from src.build_atlas import ROOT


AGES = {
    "10-14 years", "15-19 years", "20-24 years", "25-29 years",
    "30-34 years", "35-39 years", "40-44 years", "45-49 years",
}


def read_export(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        member = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
        with archive.open(member) as raw:
            return list(csv.DictReader(line.decode("utf-8-sig") for line in raw))


def mortality_series(rows: list[dict[str, str]]) -> dict[str, list[list[float]]]:
    expected = {
        "measure_name": {"Deaths"}, "sex_name": {"Both"},
        "age_name": {"Age-standardized"}, "cause_name": {"All causes"},
        "metric_name": {"Rate"},
    }
    for field, values in expected.items():
        if {row[field] for row in rows} != values:
            raise ValueError(f"Unexpected mortality {field} values")
    output: dict[str, list[list[float]]] = defaultdict(list)
    for row in rows:
        output[row["location_name"]].append([
            int(row["year"]), round(float(row["val"]), 3),
            round(float(row["lower"]), 3), round(float(row["upper"]), 3),
        ])
    return output


def fertility_series(rows: list[dict[str, str]]) -> dict[str, list[list[float]]]:
    if (
        {row["measure_name"] for row in rows} != {"Age-specific fertility rate"}
        or {row["sex_name"] for row in rows} != {"Female"}
        or {row["metric_name"] for row in rows} != {"Rate"}
        or {row["age_name"] for row in rows} != AGES
    ):
        raise ValueError("Unexpected fertility export dimensions")
    grouped: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[(row["location_name"], int(row["year"]))].append(row)
    output: dict[str, list[list[float]]] = defaultdict(list)
    for (location, year), group in grouped.items():
        if len(group) != len(AGES) or {row["age_name"] for row in group} != AGES:
            continue
        output[location].append([
            year,
            round(5 * sum(float(row["val"]) for row in group), 4),
            round(5 * sum(float(row["lower"]) for row in group), 4),
            round(5 * sum(float(row["upper"]) for row in group), 4),
        ])
    return output


def generate(mortality_zip: Path, fertility_zip: Path, output: Path) -> Path:
    mortality = mortality_series(read_export(mortality_zip))
    fertility = fertility_series(read_export(fertility_zip))
    locations = sorted(set(mortality) | set(fertility))
    payload = {
        "coverage": {"start_year": 1980, "end_year": 2023, "locations": len(locations)},
        "metrics": {
            "mortality": {
                "label": "All-cause mortality", "unit": "deaths per 100,000",
                "measure": "Age-standardized all-cause death rate",
            },
            "fertility": {
                "label": "Total fertility rate", "unit": "births per woman",
                "measure": "5 × sum of female age-specific fertility rates, ages 10-49",
            },
        },
        "source": {
            "title": "Global Burden of Disease Study 2023 (GBD 2023) Results",
            "publisher": "Institute for Health Metrics and Evaluation (IHME)",
            "year": 2024,
            "url": "https://vizhub.healthdata.org/gbd-results/",
        },
        "locations": [
            {"name": name, "mortality": mortality.get(name, []), "fertility": fertility.get(name, [])}
            for name in locations
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.LIFE_DEATH_METRICS=" + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mortality", type=Path, required=True)
    parser.add_argument("--fertility", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "web/life-death-data.js")
    args = parser.parse_args()
    print(generate(args.mortality, args.fertility, args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
