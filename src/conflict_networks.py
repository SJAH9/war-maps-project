"""Evidence-preserving, print-only conflict networks. No synthetic BA-model edges."""
from __future__ import annotations

import csv
import io
import math
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[1]


def active_in(row, year):
    """Interval overlap, not an inference from a title or 'ongoing' flag."""
    start = str(row.get("date_start", ""))[:10]
    end = str(row.get("date_end", ""))[:10] or start
    return bool(start and start <= f"{year}-12-31" and end >= f"{year}-01-01")


def event_rows(root=ROOT):
    """Reviewed GED followed by candidate releases, latest ID revision wins."""
    from src.build_atlas import CURRENT_SOURCES
    revised = {}
    for path, source in CURRENT_SOURCES:
        with (root / path.relative_to(ROOT)).open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                row["_source"] = source
                revised[row["id"]] = row
    archive = root / "data/raw/ged261-csv.zip"
    if not archive.exists():
        raise FileNotFoundError("Full-history print requires data/raw/ged261-csv.zip; no silent 2026-only fallback.")
    with zipfile.ZipFile(archive) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if len(names) != 1:
            raise ValueError("Expected exactly one reviewed GED CSV")
        with io.TextIOWrapper(z.open(names[0]), encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                if row["id"] in revised:
                    continue
                row["_source"] = "ucdp-ged-26.1"
                yield row
    yield from revised.values()


def key(row):
    return (str(row.get("type_of_violence", "1")), str(row["conflict_new_id"]))


def actor(name):
    # Exact coded names retained: group-coded annual names are not split into
    # invented individual dyads; no cross-conflict name-based identity merges.
    return "actor:" + name.strip()


def add_edge(g, a, b, kind, year, source):
    if a == b:
        return
    if not g.has_edge(a, b):
        g.add_edge(a, b, counts=Counter(), years=Counter(), sources=set())
    edge = g[a][b]
    edge["counts"][kind] += 1
    edge["years"][year] += 1
    edge["sources"].add(source)


def add_actor(g, name, country=None):
    name = name.strip()
    if not name:
        return None
    a = actor(name)
    kind = "Civilian category" if name.lower() == "civilians" else (
        "Government actor" if name.startswith("Government of ") else "Other / group-coded actor")
    if kind == "Civilian category":
        scope = country or "unspecified country"
        a += "@" + scope
        name += " / " + scope
    g.add_node(a, label=name, kind=kind)
    return a


def compile_networks(data, root=ROOT):
    # Type is part of identity. Annual ACD records can join only type-1 GED.
    models = {}
    def new_model(k, title):
        return dict(key=list(k), title=title, graph=nx.Graph(), events=0, annual=0,
                complete=0, years=Counter(), event_years=Counter(), sources=set(),
                event_ids=[], annual_ids=[], candidate=0, active_2026=False,
                deaths_best=0, deaths_unknown=0)
    for row in event_rows(root):
        k = key(row)
        m = models.setdefault(k, new_model(k, row.get("conflict_name") or str(k)))
        m["title"] = row.get("conflict_name") or m["title"]
        m["active_2026"] |= active_in(row, 2026)
        g = m["graph"]
        year = int(row["date_start"][:4])
        country, adm = row.get("country", "").strip(), row.get("adm_1", "").strip()
        a = add_actor(g, row.get("side_a", ""), country)
        b = add_actor(g, row.get("side_b", ""), country)
        place = country + (" / " + adm if adm else " / unspecified subdivision")
        p = "place:" + place
        if country:
            g.add_node(p, label=place, kind="Geographic theatre")
            for n in (a, b):
                if n:
                    add_edge(g, n, p, "event incidence", year, row["_source"])
        if a and b:
            add_edge(g, a, b, "coded sides", year, row["_source"])
        m["events"] += 1
        try:
            m["deaths_best"] += float(row["best"])
        except (KeyError, ValueError, TypeError):
            m["deaths_unknown"] += 1
        m["candidate"] += row["_source"].startswith("ucdp-candidate")
        m["event_ids"].append(row["id"])
        m["complete"] += int(bool(a and b and country and adm and row.get("date_start")
                                  and (row.get("source_headline") or row.get("source_article")
                                       or row.get("source_original"))))
        m["years"][year] += 1
        m["event_years"][year] += 1
        m["sources"].add(row["_source"])
    for i, row in enumerate(data["conflict_years"]):
        k = ("1", row["conflict_id"].removeprefix("ucdp-"))
        m = models.get(k)
        if m is None:
            continue
        g = m["graph"]
        a, b = add_actor(g, row["side_a"]), add_actor(g, row["side_b"])
        if a and b:
            add_edge(g, a, b, "annual coded sides", row["year"], "ucdp-prio-acd-26.1")
        # Secondary participation is distinct from an observed combat dyad.
        for primary, field in ((a, "side_a_secondary"), (b, "side_b_secondary")):
            for name in row[field]:
                n = add_actor(g, name)
                if primary and n:
                    add_edge(g, primary, n, "annual same-side participation",
                             row["year"], "ucdp-prio-acd-26.1")
        m["annual"] += 1
        m["annual_ids"].append(i)
        m["years"][row["year"]] += 1
        m["sources"].add("ucdp-prio-acd-26.1")
    for m in models.values():
        g = m["graph"]
        m["completeness"] = m["complete"] / max(1, m["events"])
        # Multiplicative quality prevents quantity alone from deciding the posters.
        m["score"] = m["completeness"] * math.log1p(m["events"]) * math.log1p(len(g))
        m["eligible"] = m["events"] >= 10 and len(g) >= 8 and g.number_of_edges() >= 10
    poster_keys = {tuple(m["key"]) for m in top_five(models.values()) + top_ten_mortality(models.values())}
    for m in models.values():
        if not m["active_2026"] and tuple(m["key"]) not in poster_keys:
            continue
        g = m["graph"]
        m["components"] = nx.number_connected_components(g)
        m["articulations"] = sorted(nx.articulation_points(g))
        m["centrality"] = nx.betweenness_centrality(
            g, k=min(128, len(g)) if len(g) > 128 else None, seed=2026, weight=None)
        m["centrality_method"] = "128-source sampled" if len(g) > 128 else "exact"
        m["top_degree"] = sorted(g, key=lambda n: (-g.degree(n), n))[:8]
        m["top_bridge"] = sorted(g, key=lambda n: (-m["centrality"][n], n))[:5]
    return sorted(models.values(), key=lambda m: (m["title"].casefold(), m["key"]))


def top_five(models):
    return sorted((m for m in models if m["eligible"]),
                  key=lambda m: (-m["score"], m["key"]))[:5]


def top_ten_mortality(models):
    """All recorded conflicts ranked by summed best event deaths, no quality filter."""
    return sorted(models, key=lambda m: (-m["deaths_best"], m["key"]))[:10]


def serializable(m):
    g = m["graph"]
    result = {k: v for k, v in m.items() if k != "graph"}
    result["sources"] = sorted(m["sources"])
    result["nodes"] = [dict(id=n, degree=g.degree(n), **g.nodes[n]) for n in sorted(g)]
    result["edges"] = [dict(left=a, right=b, counts=dict(e["counts"]),
                            years=dict(e["years"]), sources=sorted(e["sources"]))
                       for a, b, e in sorted(g.edges(data=True))]
    return result
