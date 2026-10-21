"""Freeze public oPt Health Cluster aggregates; never merge them with UCDP.

Only explicitly allowlisted aggregate tables are queried. No patient, contact,
staff, mailing-list or facility-location records are requested.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
KEY = "80156306-247a-4933-911d-9555a0319530"  # public embed identifier, not a credential
URL = "https://app.powerbi.com/view?r=eyJrIjoiODAxNTYzMDYtMjQ3YS00OTMzLTkxMWQtOTU1NWEwMzE5NTMwIiwidCI6ImY2MTBjMGI3LWJkMjQtNGIzOS04MTBiLTNkYzI4MGFmYjU5MCIsImMiOjh9"
SOURCE_ID = "opt-health-cluster-public-dashboard"
RAW = ROOT / "data/raw/opt-health-dashboard.json"
OUTPUT = ROOT / "data/processed/opt-health-dashboard.json"
TABLES = {
    "oPt Casualties": ["Date", "Gaza Fatalities", "Gaza Injuries", "West Bank Fatalities", "West Bank  Injuries",
                       "Gaza Fatalities Daily", "Gaza Injuries Daily", "West Bank Fatalities Daily", "West Bank  Injuries Daily"],
    "GAd Gaza": ["Date", "Category", "Number"],
    "GAd_by_Years": ["Period", "Total", "order", "Men", "Women", "Children", "Elderly"],
    "Fact_Attack": ["AttackKey", "AttackID", "AttackDate", "Country", "Governorate", "TotalDeaths", "TotalInjuries",
                    "AmbulancesAffected", "FacilitiesAffected", "WarehousesAffected"],
}
LIMIT = 30000


def fetch(url, payload=None):
    headers = {"User-Agent": "WarMapsSourceRefresh/1.0", "X-PowerBI-ResourceKey": KEY,
               "Content-Type": "application/json"}
    with urlopen(Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers), timeout=60) as response:
        data = response.read()
    return gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data


def query(table, model):
    columns = TABLES[table]
    semantic = {"Version": 2, "From": [{"Name": "t", "Entity": table, "Type": 0}],
                "Select": [{"Column": {"Expression": {"SourceRef": {"Source": "t"}}, "Property": col},
                            "Name": table + "." + col} for col in columns]}
    return {"version": "1.0.0", "modelId": model["id"], "cancelQueries": [], "queries": [{
        "Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
            "Query": semantic, "Binding": {"Primary": {"Groupings": [{"Projections": list(range(len(columns)))}]},
            "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": LIMIT}}}, "Version": 1},
            "ExecutionMetricsKind": 1}}]}, "QueryId": "", "ApplicationContext": {"DatasetId": model["dbName"]}}]}


def decode(response, columns):
    """Decode the flat Power BI data shape, rejecting truncation/schema changes."""
    results = response.get("results", [])
    if len(results) != 1 or "data" not in results[0].get("result", {}):
        raise ValueError("Dashboard query failed")
    data = results[0]["result"]["data"]
    ds = data["dsr"]["DS"]
    if len(ds) != 1:
        raise ValueError("Unexpected dataset count")
    ds = ds[0]
    if ds.get("IC") is not True or ds.get("RT") or ds.get("RestartTokens"):
        raise ValueError("Truncated dashboard response; pagination required")
    blocks = ds.get("PH", [])
    if len(blocks) != 1 or set(blocks[0]) != {"DM0"}:
        raise ValueError("Expected one flat data block")
    records = blocks[0]["DM0"]
    if not records or len(records) >= LIMIT:
        raise ValueError("Empty or potentially truncated data")
    schema = records[0]["S"]
    if len(schema) != len(columns):
        raise ValueError("Column count changed")
    names = [s["Name"] for s in data["descriptor"]["Select"]]
    if any(not name.endswith("." + col) for name, col in zip(names, columns)) or len(names) != len(columns):
        raise ValueError("Column order changed")
    previous, rows = [], []
    for record in records:
        cells = iter(record.get("C", []))
        values = []
        for i, field in enumerate(schema):
            if record.get("R", 0) & (1 << i):
                if not previous:
                    raise ValueError("Invalid repeated value")
                value = previous[i]
            elif record.get("Ø", 0) & (1 << i):
                value = None
            else:
                value = next(cells)
                if "DN" in field and isinstance(value, int):
                    value = ds["ValueDicts"][field["DN"]][value]
                if field["T"] == 7 and value is not None:
                    value = datetime.fromtimestamp(value / 1000, timezone.utc).date().isoformat()
            values.append(value)
        if next(cells, None) is not None:
            raise ValueError("Unconsumed cells")
        previous = values
        rows.append(dict(zip(columns, values)))
    counts = [e["Metrics"]["RowCount"] for e in data.get("metrics", {}).get("Events", [])
              if "RowCount" in e.get("Metrics", {})]
    if counts and counts[0] != len(rows):
        raise ValueError("Row count does not match server")
    return rows


def normalize(raw):
    tables = {name: decode(raw["responses"][name], cols) for name, cols in TABLES.items()}
    series = sorted(tables["oPt Casualties"], key=lambda r: r["Date"])
    if len({r["Date"] for r in series}) != len(series):
        raise ValueError("Duplicate casualty-series dates")
    for row in series:
        datetime.strptime(row["Date"], "%Y-%m-%d")
        for col in TABLES["oPt Casualties"][1:5]:
            value = row[col]
            if value is not None and (not isinstance(value, int) or value < 0):
                raise ValueError("Invalid cumulative casualty count")
    attacks = tables["Fact_Attack"]
    if len({r["AttackKey"] for r in attacks}) != len(attacks):
        raise ValueError("Duplicate health-attack keys")
    latest = {}
    for col in TABLES["oPt Casualties"][1:5]:
        row = next(r for r in reversed(series) if r[col] is not None)
        latest[col] = {"date": row["Date"], "value": row[col]}
    return {"source_id": SOURCE_ID, "url": URL, "retrieved": raw["retrieved"],
            "model_refreshed": raw["model_refreshed"], "latest": latest,
            "coverage": [series[0]["Date"], series[-1]["Date"]],
            "in_ucdp": False, "add_to_ucdp": False,
            "note": "Cumulative reported fatalities/injuries and source-reported daily changes are not distinct events. "
                    "Do not sum cumulative rows, derive civilian/combatant status from age/sex, or add these figures to UCDP. "
                    "Health-attack deaths overlap casualty totals and are not additional deaths. "
                    "Announcement/report dates need not be dates of death. Demographic breakdowns have their own coverage.",
            "table_units": {"oPt Casualties": "cumulative persons and source-reported daily changes",
                            "GAd Gaza": "source demographic number by report date/category; not an independent casualty total",
                            "GAd_by_Years": "fractions (0-1), not persons", "Fact_Attack": "attack records; deaths and injuries kept separate"},
            "tables": tables, "graphs": health_graphs(tables)}


def health_graphs(tables):
    nodes, edges = {}, []
    for row in tables["Fact_Attack"]:
        event = "health-attack:" + str(row["AttackKey"])
        place = "governorate:" + row["Country"] + ":" + row["Governorate"]
        nodes[place] = {"id": place, "kind": "governorate", "label": row["Governorate"], "area": row["Country"]}
        nodes[event] = {"id": event, "kind": "health-attack", "source_attack_id": row["AttackID"],
                        "date": row["AttackDate"], "deaths": row["TotalDeaths"], "injuries": row["TotalInjuries"]}
        edges.append({"source": event, "target": place, "relation": "recorded location", "directed": False})
    for area in ("Gaza", "West Bank"):
        previous = None
        for row in sorted(tables["oPt Casualties"], key=lambda r: r["Date"]):
            identity = "casualty-report:" + area + ":" + row["Date"]
            nodes[identity] = {"id": identity, "kind": "cumulative-report", "area": area, "date": row["Date"],
                               "fatalities": row[area + " Fatalities"],
                               "injuries": row["Gaza Injuries" if area == "Gaza" else "West Bank  Injuries"]}
            if previous:
                edges.append({"source": previous, "target": identity, "relation": "next report date", "directed": True})
            previous = identity
    return {"nodes": list(nodes.values()), "edges": edges,
            "note": "Location and report-sequence edges, not causal or retaliatory links. Injuries never added to deaths."}


def capture():
    html = fetch(URL).decode()
    match = re.search(r"var resolvedClusterUri = '(https://[^']+)'", html)
    if not match or not re.fullmatch(r"https://[a-z0-9-]+\.analysis\.windows\.net/", match[1]):
        raise ValueError("Unexpected public dashboard cluster")
    base = match[1].rstrip("/").replace("-redirect.analysis", "-api.analysis")
    model = json.loads(fetch(base + "/public/reports/" + KEY + "/modelsAndExploration?preferReadOnlySession=true"))["models"][0]
    if model["displayName"] != "Unified Health Dashboard":
        raise ValueError("Unexpected report title")
    responses = {name: json.loads(fetch(base + "/public/reports/querydata", query(name, model))) for name in TABLES}
    # Detect refreshes during capture rather than mixing snapshots.
    after = json.loads(fetch(base + "/public/reports/" + KEY + "/modelsAndExploration?preferReadOnlySession=true"))["models"][0]
    if model["LastRefreshTime"] != after["LastRefreshTime"]:
        raise ValueError("Dashboard refreshed during capture; retry")
    return {"source_url": URL, "retrieved": datetime.now(timezone.utc).isoformat(),
            "model_refreshed": model["LastRefreshTime"], "model_id": model["id"],
            "queries": {name: query(name, model) for name in TABLES}, "responses": responses}


def context_records(existing, raw_path=RAW):
    """Replace the overlapping Gaza context, not UCDP; add distinct West Bank."""
    if not raw_path.exists():
        return existing
    data = normalize(json.loads(raw_path.read_text()))
    result = [dict(r) for r in existing]
    previous = next((r for r in result if r["id"] == "gaza-ocha-moh"), None)
    for area, place, lon, lat, identity in (
        ("Gaza", "Gaza Strip", 34.28, 31.42, "gaza-ocha-moh"),
        ("West Bank", "West Bank", 35.2, 31.9, "west-bank-health-cluster"),
    ):
        latest = data["latest"][area + " Fatalities"]
        if area == "Gaza" and previous and latest["date"] < previous["as_of"]:
            continue
        result = [r for r in result if r["id"] != identity]
        injury = data["latest"]["Gaza Injuries" if area == "Gaza" else "West Bank  Injuries"]
        row = {"id": identity, "place": place, "admin": "Palestine", "lon": lon, "lat": lat,
               "in_ucdp": False, "civilians": latest["value"], "metric": "reported fatalities (all statuses)",
               "as_of": latest["date"], "period": data["coverage"][0] + " to " + latest["date"],
               "source_short": "Health Cluster / MoH", "source": "oPt Health Cluster / WHO Unified Health Dashboard, MoH casualty series",
               "url": URL, "reported_injuries": injury["value"], "injuries_as_of": injury["date"],
               "note": "Not part of UCDP. Reported cumulative fatalities, not a verified civilian-only count. "
                       "No complete civilian/combatant split; demographic categories do not establish combatant status. "
                       "Injuries are separate, not deaths. Source announcements can revise previous counts.",
               "source_id": SOURCE_ID}
        if area == "Gaza" and previous:
            row["previous_context_snapshot"] = previous
            row["change_from_previous_snapshot"] = latest["value"] - previous["civilians"]
            row["comparison_note"] = "Change between published snapshots, not deaths assigned to the intervening dates."
        result.append(row)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Fetch public aggregates; otherwise rebuild offline from frozen responses")
    args = parser.parse_args()
    raw = capture() if args.refresh else json.loads(RAW.read_text())
    normalized = normalize(raw)  # validate every table before replacing usable files
    if args.refresh:
        RAW.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n")
    OUTPUT.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
    manifest_path = ROOT / "data/SOURCES.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["sources"] = [s for s in manifest["sources"] if s["id"] != SOURCE_ID] + [{
        "id": SOURCE_ID, "title": "oPt Unified Health Dashboard — casualty and health-attack aggregates",
        "publisher": "oPt Health Cluster / WHO; casualty series attributed to Palestinian Ministry of Health",
        "url": URL, "coverage": normalized["coverage"], "retrieved": raw["retrieved"],
        "model_refreshed": raw["model_refreshed"], "sha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
        "license": "Publisher terms apply; no blanket open-data license inferred from public access",
        "enclosure": "Separate humanitarian context; overlapping reports, never additive to UCDP",
        "raw_path": str(RAW.relative_to(ROOT)), "processed_path": str(OUTPUT.relative_to(ROOT))}]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"rows": {k: len(v) for k, v in normalized["tables"].items()}, "latest": normalized["latest"]}, indent=2))


if __name__ == "__main__":
    main()
