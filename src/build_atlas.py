#!/usr/bin/env python3
"""Build the canonical War Maps dataset from enclosed source records."""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HISTORICAL = ROOT / "data/raw/UcdpPrioConflict_v26_1.csv"
CURRENT = ROOT / "data/raw/GEDEvent_v26_01_26_06.csv"
VDEM = ROOT / "data/raw/V-Dem-CY-Core-v15.csv"
CLAIMS = ROOT / "data/curated/claims.json"
PROJECTIONS = ROOT / "data/curated/projections.json"
SOURCES = ROOT / "data/SOURCES.json"
OUTPUT = ROOT / "data/processed/war_maps.json"

TYPE_NAMES = {
    1: "extrasystemic",
    2: "interstate",
    3: "internal",
    4: "internationalized internal",
}
INCOMPATIBILITY_NAMES = {1: "territory", 2: "government"}
REGION_NAMES = {1: "Europe", 2: "Middle East", 3: "Asia", 4: "Africa", 5: "Americas"}

LOCATION_ALIASES = {
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",
    "Cambodia (Kampuchea)": "Cambodia",
    "DR Congo (Zaire)": "Democratic Republic of the Congo",
    "Ivory Coast": "Cote d'Ivoire",
    "Myanmar (Burma)": "Myanmar",
    "Russia (Soviet Union)": "Russia",
    "Serbia (Yugoslavia)": "Serbia",
    "South Vietnam": "Vietnam",
    "Yemen (North Yemen)": "Yemen",
    "Yemen (South Yemen)": "Yemen",
    "Zimbabwe (Rhodesia)": "Zimbabwe",
}

VDEM_ALIASES = {
    **LOCATION_ALIASES,
    "Myanmar": "Burma/Myanmar",
    "South Vietnam": "Republic of Vietnam",
}
VDEM_FIELDS = (
    "v2cltrnslw", "v2juhcind", "v2juncind", "v2clkill", "v2xcl_acjst",
    "v2cltort", "v2x_clphy", "v2clrspct", "v2x_freexp",
)


def departure(statement: str, departure_id: str, *, measurements: list[str] | None = None,
              join_keys: list[str] | None = None) -> dict:
    """A repeatable, addressable departure carried by an enclosure function."""
    return {
        "id": departure_id,
        "statement": statement,
        "measurements": measurements or [],
        "join_keys": join_keys or [],
    }


def frontier(address: str, questions: list[str] | None = None) -> dict:
    """An enclosure function whose next outer and inner depths remain unopened."""
    return {
        "function": "E",
        "address": address,
        "status": "frontier",
        "questions": questions or [],
    }


def leaf_enclosure(address: str, statement: str, *, join_keys: list[str] | None = None) -> dict:
    """Represent a finite observation without turning its boundary into a truth flag."""
    return {
        "function": "E",
        "address": address,
        "status": "open",
        "outer": frontier(f"{address}.outer"),
        "departure": departure(statement, f"{address}.departure", join_keys=join_keys),
        "inner": frontier(f"{address}.inner"),
        "frontier_questions": [],
    }


def canonical_enclosure(raw: dict, address: str, *, measurements: list[str] | None = None,
                        join_keys: list[str] | None = None) -> dict:
    """Expand the compact authoring form into E = [E_outer | D | E_inner]."""
    inner = raw.get("inner", [])
    inner_statement = "; ".join(inner) if isinstance(inner, list) else str(inner)
    return {
        "function": "E",
        "address": address,
        "status": "open",
        "outer": leaf_enclosure(f"{address}.outer", str(raw.get("outer", "unopened outer condition")), join_keys=join_keys),
        "departure": departure(
            str(raw.get("active", "unopened departure")),
            f"{address}.departure",
            measurements=measurements,
            join_keys=join_keys,
        ),
        "inner": leaf_enclosure(f"{address}.inner", inner_statement or "unopened enclosed condition", join_keys=join_keys),
        "frontier_questions": raw.get("frontier_questions", []),
    }


def projection_enclosure(record: dict) -> dict:
    projection_id = record["projection_id"]
    return canonical_enclosure({
        "outer": "; ".join(record["outer_conditions"]),
        "active": record["active_relation"],
        "inner": record["enclosed_consequences"],
        "frontier_questions": record["frontier_questions"],
    }, f"projection.{projection_id}", measurements=record.get("observable_traces", []),
       join_keys=["conflict_id", "projection_id", "branch_point"])


def as_int(value: str | None, default: int = 0) -> int:
    try:
        return int(float(value or default))
    except (TypeError, ValueError):
        return default


def as_float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "", "NA", "NaN") else None
    except (TypeError, ValueError):
        return None


def split_csv_names(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def plot_locations(value: str) -> list[str]:
    return [LOCATION_ALIASES.get(name, name) for name in split_csv_names(value)]


def government_names(value: str | None) -> list[str]:
    names = []
    for item in split_csv_names(value):
        if item.startswith("Government of "):
            names.append(item.removeprefix("Government of "))
    return names


def conflict_title(latest: dict[str, str]) -> str:
    territory = latest.get("territory_name", "").strip()
    location = latest.get("location", "").strip()
    if territory:
        return f"{territory}: {latest['side_a']} - {latest['side_b']}"
    return f"{location}: {latest['side_a']} - {latest['side_b']}"


def historical_records() -> tuple[list[dict], list[dict], list[dict]]:
    required = {
        "conflict_id", "location", "side_a", "side_b", "incompatibility",
        "year", "intensity_level", "type_of_conflict", "start_date", "region",
    }
    with HISTORICAL.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise RuntimeError(f"Historical source missing fields: {sorted(missing)}")
        rows = list(reader)

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["conflict_id"]].append(row)

    conflicts = []
    years = []
    state_conflicts: dict[str, set[str]] = defaultdict(set)
    state_territorial: dict[str, set[str]] = defaultdict(set)
    state_interstate: dict[str, set[str]] = defaultdict(set)
    state_active: dict[str, set[str]] = defaultdict(set)
    dataset_year = max(as_int(row["year"]) for row in rows)

    for conflict_id, conflict_rows in grouped.items():
        conflict_rows.sort(key=lambda row: as_int(row["year"]))
        latest = conflict_rows[-1]
        years_active = sorted({as_int(row["year"]) for row in conflict_rows})
        locations = sorted({name for row in conflict_rows for name in split_csv_names(row["location"])})
        mapped_locations = sorted({name for row in conflict_rows for name in plot_locations(row["location"])})
        parties_a = sorted({row["side_a"].strip() for row in conflict_rows if row["side_a"].strip()})
        parties_b = sorted({row["side_b"].strip() for row in conflict_rows if row["side_b"].strip()})
        secondaries = sorted({name for row in conflict_rows for field in ("side_a_2nd", "side_b_2nd") for name in split_csv_names(row.get(field))})
        type_code = as_int(latest["type_of_conflict"])
        incompatibility_code = as_int(latest["incompatibility"])
        active = dataset_year in years_active and as_int(latest.get("ep_end")) == 0
        record_id = f"ucdp-{conflict_id}"
        conflicts.append({
            "id": record_id,
            "source_conflict_id": as_int(conflict_id),
            "title": conflict_title(latest),
            "locations": locations,
            "plot_locations": mapped_locations,
            "region": REGION_NAMES.get(as_int(latest["region"]), "Other"),
            "start_date": min(row["start_date"] for row in conflict_rows if row["start_date"]),
            "first_active_year": min(years_active),
            "last_active_year": max(years_active),
            "years_active": years_active,
            "active_at_source_boundary": active,
            "type": TYPE_NAMES.get(type_code, "unclassified"),
            "type_code": type_code,
            "incompatibility": INCOMPATIBILITY_NAMES.get(incompatibility_code, "unclassified"),
            "territory_name": latest.get("territory_name", ""),
            "peak_intensity": max(as_int(row["intensity_level"]) for row in conflict_rows),
            "latest_intensity": as_int(latest["intensity_level"]),
            "parties_a": parties_a,
            "parties_b": parties_b,
            "secondary_parties": secondaries,
            "source_id": "ucdp-prio-acd-26.1",
            "enclosure": {
                "outer": "UCDP state-based armed-conflict definition and annual coding",
                "active": f"conflict {conflict_id} across {len(years_active)} coded conflict-years",
                "inner": ["annual party records", "incompatibility", "type", "intensity"],
                "frontier_questions": ["Which events compose each year?", "What claims describe objectives and outcomes?", "What changed after the source boundary?"]
            },
        })
        for row in conflict_rows:
            year_record = {
                "conflict_id": record_id,
                "year": as_int(row["year"]),
                "side_a": row["side_a"],
                "side_b": row["side_b"],
                "side_a_secondary": split_csv_names(row.get("side_a_2nd")),
                "side_b_secondary": split_csv_names(row.get("side_b_2nd")),
                "intensity": as_int(row["intensity_level"]),
                "episode_end": bool(as_int(row.get("ep_end"))),
                "locations": split_csv_names(row["location"]),
            }
            years.append(year_record)
            states = set()
            for field in ("side_a", "side_b", "side_a_2nd", "side_b_2nd"):
                states.update(government_names(row.get(field)))
            for state in states:
                state_conflicts[state].add(record_id)
                if incompatibility_code == 1:
                    state_territorial[state].add(record_id)
                if type_code == 2:
                    state_interstate[state].add(record_id)
                if active:
                    state_active[state].add(record_id)

    states = []
    for state, ids in state_conflicts.items():
        states.append({
            "state": state,
            "conflict_ids": sorted(ids),
            "conflict_count": len(ids),
            "territorial_conflict_count": len(state_territorial[state]),
            "interstate_conflict_count": len(state_interstate[state]),
            "active_at_source_boundary_count": len(state_active[state]),
            "boundary": "Participation is the outer state address. Prompted projection opens initiation, motive, territorial change, economic consequence, and durable benefit inward.",
        })
    conflicts.sort(key=lambda item: (item["first_active_year"], item["title"]))
    years.sort(key=lambda item: (item["year"], item["conflict_id"]))
    states.sort(key=lambda item: (-item["conflict_count"], item["state"]))
    return conflicts, years, states


def vdem_state_conditions() -> list[dict]:
    """Retain V-Dem observations as conditions, without converting them to a war score."""
    records = []
    with VDEM.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"country_name", "country_text_id", "year", *VDEM_FIELDS}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise RuntimeError(f"V-Dem source missing fields: {sorted(missing)}")
        for row in reader:
            year = as_int(row["year"])
            if year < 1946:
                continue
            records.append({
                "country": row["country_name"],
                "country_id": row["country_text_id"],
                "year": year,
                "conditions": {field: as_float(row[field]) for field in VDEM_FIELDS},
                "source_id": "vdem-core-v15-rtldi",
                "enclosure": {
                    "outer": "V-Dem country-year measurement and coding model",
                    "active": f"observed state conditions for {row['country_name']} in {year}",
                    "inner": list(VDEM_FIELDS),
                    "frontier_questions": ["Which condition projected into the conflict decision?", "Which decision maker carried the departure?", "Which enclosed consequence became durable?"]
                },
            })
    return records


def current_events() -> tuple[list[dict], dict | None]:
    if not CURRENT.exists():
        return [], None
    events = []
    focal_rows = []
    with CURRENT.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            conflict_id = row.get("conflict_new_id", "").strip()
            record = {
                "id": row.get("id", ""),
                "conflict_id": f"ucdp-candidate-{conflict_id}" if conflict_id else None,
                "conflict_name": row.get("conflict_name", ""),
                "date_start": row.get("date_start", "")[:10],
                "date_end": row.get("date_end", "")[:10],
                "country": row.get("country", ""),
                "place": row.get("where_coordinates", ""),
                "description": row.get("where_description", ""),
                "latitude": float(row["latitude"]) if row.get("latitude") else None,
                "longitude": float(row["longitude"]) if row.get("longitude") else None,
                "side_a": row.get("side_a", ""),
                "side_b": row.get("side_b", ""),
                "code_status": row.get("code_status", ""),
                "event_clarity": as_int(row.get("event_clarity")),
                "source_count": as_int(row.get("number_of_sources")),
                "source_office": row.get("source_office", ""),
                "source_date": row.get("source_date", ""),
                "fatalities": {
                    "low": as_int(row.get("low")),
                    "best": as_int(row.get("best")),
                    "high": as_int(row.get("high")),
                    "side_a": as_int(row.get("deaths_a")),
                    "side_b": as_int(row.get("deaths_b")),
                    "civilians": as_int(row.get("deaths_civilians")),
                    "unknown": as_int(row.get("deaths_unknown")),
                },
                "source_id": "ucdp-candidate-ged-2026-06",
            }
            events.append(record)
            if conflict_id == "16905":
                focal_rows.append(record)

    focal = None
    if focal_rows:
        countries = sorted({row["country"] for row in focal_rows if row["country"]})
        focal = {
            "id": "ucdp-candidate-16905",
            "source_conflict_id": 16905,
            "historical_link": "ucdp-14609",
            "title": "Iran - Israel and United States, 2026 candidate-event layer",
            "locations": countries,
            "plot_locations": [LOCATION_ALIASES.get(name, name) for name in countries],
            "region": "Middle East",
            "start_date": min(row["date_start"] for row in focal_rows if row["date_start"]),
            "first_active_year": 2026,
            "last_active_year": 2026,
            "years_active": [2026],
            "active_at_source_boundary": True,
            "type": "candidate state-based conflict",
            "type_code": 2,
            "incompatibility": "candidate coding",
            "territory_name": "",
            "peak_intensity": None,
            "latest_intensity": None,
            "parties_a": sorted({row["side_a"] for row in focal_rows if row["side_a"]}),
            "parties_b": sorted({row["side_b"] for row in focal_rows if row["side_b"]}),
            "secondary_parties": [],
            "event_count": len(focal_rows),
            "source_id": "ucdp-candidate-ged-2026-06",
            "enclosure": {
                "outer": "UCDP candidate-event collection through June 2026",
                "active": "provisional event cluster coded as conflict 16905",
                "inner": ["geolocated events", "source offices", "fatality ranges", "code-status qualifiers"],
                "frontier_questions": ["What changed after June 2026?", "Which candidate records were revised?", "How do belligerent claims nest around each event?"]
            },
        }
    events.sort(key=lambda item: (item["date_start"], item["id"]))
    return events, focal


def build() -> dict:
    conflicts, years, states = historical_records()
    state_conditions = vdem_state_conditions()
    events, focal = current_events()
    if focal:
        conflicts.append(focal)
    claims = json.loads(CLAIMS.read_text(encoding="utf-8"))["claims"]
    projections = json.loads(PROJECTIONS.read_text(encoding="utf-8"))["projections"]
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))["sources"]
    for conflict in conflicts:
        conflict["enclosure"] = canonical_enclosure(
            conflict["enclosure"], f"conflict.{conflict['id']}",
            measurements=["conflict-year", "intensity", "party participation"],
            join_keys=["source_conflict_id", "year"],
        )
    for condition in state_conditions:
        condition["enclosure"] = canonical_enclosure(
            condition["enclosure"], f"state-condition.{condition['country_id']}.{condition['year']}",
            measurements=list(condition["conditions"]), join_keys=["country_id", "year"],
        )
    for claim in claims:
        claim["enclosure"] = canonical_enclosure(
            claim["enclosure"], f"claim.{claim['claim_id']}",
            join_keys=["claim_id", "conflict_id", "source_id", "source_locator"],
        )
    for projection in projections:
        projection["enclosure"] = projection_enclosure(projection)
    data = {
        "project": "The War Maps Project",
        "revision": 1,
        "generated_from": [source["id"] for source in sources],
        "coverage": {"start_year": 1946, "reviewed_through": 2025, "candidate_through": "2026-06-30"},
        "summary": {
            "conflicts": len(conflicts),
            "historical_conflicts": len(conflicts) - (1 if focal else 0),
            "conflict_years": len(years),
            "states": len(states),
            "candidate_events_2026": len(events),
            "focal_iran_events": sum(event["conflict_id"] == "ucdp-candidate-16905" for event in events),
            "vdem_state_years": len(state_conditions),
            "prompted_projection_branches": len(projections) + sum(claim["source_type"] == "user-prompted-causal-projection" for claim in claims),
        },
        "conflicts": conflicts,
        "conflict_years": years,
        "states": states,
        "state_conditions": state_conditions,
        "events": events,
        "claims": claims,
        "sources": sources,
        "prompted_projections": [claim for claim in claims if claim["source_type"] == "user-prompted-causal-projection"] + projections,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return data


def main() -> int:
    data = build()
    print(json.dumps(data["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
