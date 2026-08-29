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
CURRENT_SOURCES = (
    (ROOT / "data/raw/GEDEvent_v26_01_26_06.csv", "ucdp-candidate-ged-2026-06"),
    (ROOT / "data/raw/GEDEvent_v26_0_7.csv", "ucdp-candidate-ged-2026-07"),
)
VDEM = ROOT / "data/raw/V-Dem-CY-Core-v15.csv"
VDEM_REGIMES = ROOT / "data/raw/V-Dem-CY-Regime-v15.csv"
GEOMETRY = ROOT / "data/raw/ne_110m_admin_0_countries.geojson"
SATELLITE_ORBITS = ROOT / "data/raw/CelesTrak-ICEYE-SAR-2026-08-29.json"
SATELLITE_RELATIONS = ROOT / "data/curated/satellite_relations.json"
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
REGIME_NAMES = {
    0: "Closed autocracy",
    1: "Electoral autocracy",
    2: "Electoral democracy",
    3: "Liberal democracy",
}

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
    """Represent a finite observation with an explicit, addressable boundary."""
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


def mapped_names(names: set[str] | list[str]) -> list[str]:
    return sorted({LOCATION_ALIASES.get(name, name) for name in names})


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
                "plot_locations": plot_locations(row["location"]),
                "side_a_states": mapped_names(set(government_names(row.get("side_a"))) | set(government_names(row.get("side_a_2nd")))),
                "side_b_states": mapped_names(set(government_names(row.get("side_b"))) | set(government_names(row.get("side_b_2nd")))),
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
    regimes = {}
    with VDEM_REGIMES.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            code = as_float(row.get("v2x_regime"))
            regimes[(row["country_text_id"], as_int(row["year"]))] = {
                "code": int(code) if code is not None else None,
                "name": REGIME_NAMES.get(int(code)) if code is not None else None,
                "ambiguity_code": as_float(row.get("v2x_regime_amb")),
            }
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
                "regime": regimes.get((row["country_text_id"], year), {"code": None, "name": None, "ambiguity_code": None}),
                "source_id": "vdem-core-v15-rtldi",
                "enclosure": {
                    "outer": "V-Dem country-year measurement and coding model",
                    "active": f"observed state conditions for {row['country_name']} in {year}",
                    "inner": list(VDEM_FIELDS),
                    "frontier_questions": ["Which condition projected into the conflict decision?", "Which decision maker carried the departure?", "Which enclosed consequence became durable?"]
                },
            })
    return records


def current_events() -> tuple[list[dict], list[dict]]:
    source_rows: dict[str, tuple[dict[str, str], str]] = {}
    for source_path, source_id in CURRENT_SOURCES:
        if not source_path.exists():
            continue
        with source_path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                source_rows[row.get("id", "")] = (row, source_id)

    events = []
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row, source_id in source_rows.values():
        conflict_id = row.get("conflict_new_id", "").strip()
        record = {
            "id": row.get("id", ""),
            "conflict_id": f"ucdp-candidate-{conflict_id}" if conflict_id else None,
            "conflict_name": row.get("conflict_name", ""),
            "date_start": row.get("date_start", "")[:10],
            "date_end": row.get("date_end", "")[:10],
            "country": row.get("country", ""),
            "region": row.get("region", "Other"),
            "place": row.get("where_coordinates", ""),
            "description": row.get("where_description", ""),
            "latitude": float(row["latitude"]) if row.get("latitude") else None,
            "longitude": float(row["longitude"]) if row.get("longitude") else None,
            "side_a": row.get("side_a", ""),
            "side_b": row.get("side_b", ""),
            "side_a_states": mapped_names(government_names(row.get("side_a"))),
            "side_b_states": mapped_names(government_names(row.get("side_b"))),
            "type_of_violence": as_int(row.get("type_of_violence")),
            "dyad_id": row.get("dyad_new_id", ""),
            "dyad_name": row.get("dyad_name", ""),
            "code_status": row.get("code_status", ""),
            "event_clarity": as_int(row.get("event_clarity")),
            "date_precision": as_int(row.get("date_prec")),
            "location_precision": as_int(row.get("where_prec")),
            "source_count": as_int(row.get("number_of_sources")),
            "source_office": row.get("source_office", ""),
            "source_date": row.get("source_date", ""),
            "source_headline": row.get("source_headline", ""),
            "source_original": row.get("source_original", ""),
            "fatalities": {
                "low": as_int(row.get("low")),
                "best": as_int(row.get("best")),
                "high": as_int(row.get("high")),
                "side_a": as_int(row.get("deaths_a")),
                "side_b": as_int(row.get("deaths_b")),
                "civilians": as_int(row.get("deaths_civilians")),
                "unknown": as_int(row.get("deaths_unknown")),
            },
            "source_id": source_id,
        }
        events.append(record)
        if conflict_id:
                grouped[conflict_id].append(record)

    violence_types = {1: "candidate state-based conflict", 2: "candidate non-state conflict", 3: "candidate one-sided violence"}
    conflicts = []
    for conflict_id, conflict_rows in grouped.items():
        countries = sorted({row["country"] for row in conflict_rows if row["country"]})
        type_codes = {row["type_of_violence"] for row in conflict_rows}
        type_code = next(iter(type_codes)) if len(type_codes) == 1 else 0
        titles = sorted({row["conflict_name"] for row in conflict_rows if row["conflict_name"]})
        source_ids = sorted({row["source_id"] for row in conflict_rows})
        record = {
            "id": f"ucdp-candidate-{conflict_id}",
            "source_conflict_id": as_int(conflict_id),
            "title": titles[0] if titles else f"UCDP candidate conflict {conflict_id}",
            "locations": countries,
            "plot_locations": [LOCATION_ALIASES.get(name, name) for name in countries],
            "region": next((row["region"] for row in conflict_rows if row["region"]), "Other"),
            "start_date": min(row["date_start"] for row in conflict_rows if row["date_start"]),
            "first_active_year": 2026,
            "last_active_year": 2026,
            "years_active": [2026],
            "active_at_source_boundary": "ucdp-candidate-ged-2026-07" in source_ids,
            "type": violence_types.get(type_code, "candidate organized violence"),
            "type_code": type_code,
            "incompatibility": "candidate coding",
            "territory_name": "",
            "peak_intensity": None,
            "latest_intensity": None,
            "parties_a": sorted({row["side_a"] for row in conflict_rows if row["side_a"]}),
            "parties_b": sorted({row["side_b"] for row in conflict_rows if row["side_b"]}),
            "secondary_parties": [],
            "event_count": len(conflict_rows),
            "source_id": source_ids[-1],
            "source_ids": source_ids,
            "enclosure": {
                "outer": "UCDP candidate-event collection through July 2026",
                "active": f"provisional event cluster coded as conflict {conflict_id}",
                "inner": ["geolocated events", "source offices", "fatality ranges", "code-status qualifiers"],
                "frontier_questions": ["What changed after July 2026?", "Which candidate records were revised?", "How do actor claims nest around each event?"]
            },
        }
        if conflict_id == "16905":
            record["historical_link"] = "ucdp-14609"
            record["title"] = "Iran - Israel and United States, 2026 candidate-event layer"
        conflicts.append(record)
    events.sort(key=lambda item: (item["date_start"], item["id"]))
    conflicts.sort(key=lambda item: (item["title"], item["id"]))
    return events, conflicts


MAP_NAME_ALIASES = {
    "Burma/Myanmar": "Myanmar",
    "Cape Verde": "Cabo Verde",
    "Congo": "Republic of the Congo",
    "Ivory Coast": "Cote d'Ivoire",
    "Palestine/West Bank": "Palestine",
    "Republic of Vietnam": "Vietnam",
    "South Yemen": "Yemen",
    "The Gambia": "Gambia",
    "United States": "United States of America",
}


def regime_periods(rows: list[dict]) -> list[dict]:
    periods = []
    for row in sorted(rows, key=lambda item: item["year"]):
        code = row["regime"]["code"]
        if code is None:
            continue
        if periods and periods[-1]["code"] == code and periods[-1]["end_year"] + 1 == row["year"]:
            periods[-1]["end_year"] = row["year"]
        else:
            periods.append({"code": code, "name": REGIME_NAMES[code], "start_year": row["year"], "end_year": row["year"]})
    return periods


def nation_profiles(conflicts: list[dict], years: list[dict], states: list[dict],
                    conditions: list[dict], events: list[dict]) -> list[dict]:
    """Build nation-centred UCDP relations without relabeling them as permanent alliances."""
    geometry = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    map_records = {}
    for feature in geometry["features"]:
        props = feature["properties"]
        record = {
            "map_name": props["ADMIN"],
            "country_id": props.get("ISO_A3") if props.get("ISO_A3") != "-99" else None,
            "centroid": [props.get("LABEL_X"), props.get("LABEL_Y")],
        }
        for key in ("ADMIN", "NAME", "NAME_LONG", "NAME_EN", "SOVEREIGNT"):
            if props.get(key):
                if key == "SOVEREIGNT":
                    map_records.setdefault(props[key], record)
                else:
                    map_records[props[key]] = record

    condition_rows: dict[str, list[dict]] = defaultdict(list)
    country_ids = {}
    for row in conditions:
        condition_rows[row["country"]].append(row)
        country_ids[row["country"]] = row["country_id"]

    conflicts_by_nation: dict[str, set[str]] = defaultdict(set)
    years_by_nation: dict[str, set[int]] = defaultdict(set)
    same_side: dict[str, dict[str, dict[str, set]]] = defaultdict(lambda: defaultdict(lambda: {"years": set(), "conflicts": set()}))
    opposing: dict[str, dict[str, dict[str, set]]] = defaultdict(lambda: defaultdict(lambda: {"years": set(), "conflicts": set()}))

    def add_relation(store: dict, left: str, right: str, year: int, conflict_id: str):
        if left == right:
            return
        store[left][right]["years"].add(year)
        store[left][right]["conflicts"].add(conflict_id)

    def add_year(left_states: list[str], right_states: list[str], locations: list[str], year: int, conflict_id: str):
        left, right = set(left_states), set(right_states)
        for nation in left | right | set(locations):
            conflicts_by_nation[nation].add(conflict_id)
            years_by_nation[nation].add(year)
        for group in (left, right):
            for nation in group:
                for partner in group:
                    add_relation(same_side, nation, partner, year, conflict_id)
        for nation in left:
            for adversary in right:
                add_relation(opposing, nation, adversary, year, conflict_id)
                add_relation(opposing, adversary, nation, year, conflict_id)

    for row in years:
        add_year(row["side_a_states"], row["side_b_states"], row["plot_locations"], row["year"], row["conflict_id"])
    for event in events:
        if not event["conflict_id"]:
            continue
        add_year(event["side_a_states"], event["side_b_states"], [LOCATION_ALIASES.get(event["country"], event["country"])],
                 as_int(event["date_start"][:4]), event["conflict_id"])

    state_stats = {row["state"]: row for row in states}
    fatality_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"low": 0, "best": 0, "high": 0, "events": 0})
    for event in events:
        country = LOCATION_ALIASES.get(event["country"], event["country"])
        fatality_totals[country]["events"] += 1
        for field in ("low", "best", "high"):
            fatality_totals[country][field] += event["fatalities"][field]

    names = set(condition_rows) | set(state_stats) | set(conflicts_by_nation)
    names.update(record["map_name"] for record in map_records.values())
    profiles = []
    for country in sorted(names):
        map_record = map_records.get(MAP_NAME_ALIASES.get(country, country), {})
        stats = state_stats.get(country, {})

        def relations(store: dict) -> list[dict]:
            return sorted(({
                "country": other,
                "map_name": MAP_NAME_ALIASES.get(other, other),
                "duration_years": len(values["years"]),
                "first_year": min(values["years"]),
                "last_year": max(values["years"]),
                "conflict_ids": sorted(values["conflicts"]),
            } for other, values in store.get(country, {}).items()), key=lambda item: (-item["duration_years"], item["country"]))

        profiles.append({
            "country": country,
            "country_id": country_ids.get(country) or map_record.get("country_id"),
            "map_name": map_record.get("map_name", MAP_NAME_ALIASES.get(country, country)),
            "centroid": map_record.get("centroid"),
            "conflict_ids": sorted(conflicts_by_nation.get(country, set())),
            "years_active": sorted(years_by_nation.get(country, set())),
            "same_side_partners": relations(same_side),
            "opposing_states": relations(opposing),
            "regime_periods": regime_periods(condition_rows.get(country, [])),
            "candidate_event_fatalities_in_territory": fatality_totals[country],
            "conflict_count": len(conflicts_by_nation.get(country, set())),
            "territorial_conflict_count": stats.get("territorial_conflict_count", 0),
            "interstate_conflict_count": stats.get("interstate_conflict_count", 0),
        })
    return profiles


def satellite_constellations() -> list[dict]:
    """Join public orbit geometry to separately sourced constellation-level conflict relations."""
    objects = json.loads(SATELLITE_ORBITS.read_text(encoding="utf-8"))
    relations = json.loads(SATELLITE_RELATIONS.read_text(encoding="utf-8"))["constellations"]
    fields = (
        "OBJECT_NAME", "OBJECT_ID", "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION",
        "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER",
        "MEAN_ANOMALY", "EPHEMERIS_TYPE", "CLASSIFICATION_TYPE", "ELEMENT_SET_NO",
        "REV_AT_EPOCH", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
    )
    for relation in relations:
        prefix = relation.pop("object_name_prefix")
        relation["objects"] = [
            {field: item.get(field) for field in fields}
            for item in objects if item.get("OBJECT_NAME", "").startswith(prefix)
        ]
        relation["object_count"] = len(relation["objects"])
    return relations


def build() -> dict:
    conflicts, years, states = historical_records()
    historical_conflict_count = len(conflicts)
    state_conditions = vdem_state_conditions()
    events, candidate_conflicts = current_events()
    conflicts.extend(candidate_conflicts)
    nations = nation_profiles(conflicts, years, states, state_conditions, events)
    constellations = satellite_constellations()
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
            measurements=[*condition["conditions"], "v2x_regime", "v2x_regime_amb"], join_keys=["country_id", "year"],
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
        "coverage": {"start_year": 1946, "reviewed_through": 2025, "candidate_through": "2026-07-31"},
        "summary": {
            "conflicts": len(conflicts),
            "historical_conflicts": historical_conflict_count,
            "candidate_conflicts": len(candidate_conflicts),
            "conflict_years": len(years),
            "states": len(states),
            "nation_profiles": len(nations),
            "candidate_events_2026": len(events),
            "focal_iran_events": sum(event["conflict_id"] == "ucdp-candidate-16905" for event in events),
            "vdem_state_years": len(state_conditions),
            "prompted_projection_branches": len(projections) + sum(claim["source_type"] == "user-prompted-causal-projection" for claim in claims),
            "public_satellite_orbits": sum(item["object_count"] for item in constellations),
        },
        "conflicts": conflicts,
        "conflict_years": years,
        "states": states,
        "nations": nations,
        "regime_types": [{"code": code, "name": name} for code, name in REGIME_NAMES.items()],
        "satellite_constellations": constellations,
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
