#!/usr/bin/env python3
"""Generate the print-first War Map product from a dated focal interval."""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter, defaultdict, deque
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from fpdf import FPDF

from src.build_atlas import ROOT, build

SPECS = ROOT / "data/curated/print_war_maps.json"
GEOMETRY = ROOT / "data/raw/ne_110m_admin_0_countries.geojson"
OUTPUT = ROOT / "outputs/print"

INK = (25, 27, 24)
MUTED = (92, 96, 88)
PAPER = (244, 241, 228)
SURFACE = (229, 225, 205)
OCEAN = (31, 48, 54)
SLATE = (101, 112, 120)
OLIVE = (102, 111, 60)
CLAY = (157, 82, 60)
OXBLOOD = (112, 43, 34)
MANILA = (216, 197, 143)
ORANGE = (240, 120, 0)
YELLOW = (255, 213, 0)


def latin(value: object) -> str:
    return str(value).encode("latin-1", "replace").decode("latin-1")


def read_js(path: Path, prefix: str) -> dict:
    text = path.read_text(encoding="utf-8")
    return json.loads(text.removeprefix(prefix).removesuffix(";\n"))


class AtlasPDF(FPDF):
    section_name = ""
    footer_text = ""

    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(*INK)
        self.rect(0, 0, self.w, 12, "F")
        self.set_xy(12, 3.2)
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*MANILA)
        self.cell(130, 5, "THE WAR MAPS PROJECT")
        self.set_text_color(205, 205, 192)
        self.cell(130, 5, latin(self.section_name.upper()), align="R")

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-9)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*MUTED)
        text = self.footer_text or "THE WAR MAPS PROJECT"
        self.cell(0, 4, f"{latin(text)}  |  {self.page_no():02d}", align="C")

    def section_page(self, section: str, eyebrow: str, title: str, deck: str = ""):
        self.section_name = section
        self.add_page()
        self.set_xy(14, 20)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*CLAY)
        self.cell(0, 5, latin(eyebrow.upper()))
        self.set_xy(14, 29)
        self.set_font("Times", "B", 25)
        self.set_text_color(*INK)
        self.cell(0, 10, latin(title))
        if deck:
            self.set_xy(14, 42)
            self.set_font("Helvetica", "", 9.5)
            self.set_text_color(*MUTED)
            self.multi_cell(267, 5.2, latin(deck))

    def label(self, x: float, y: float, text: str, color=CLAY):
        self.set_xy(x, y)
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*color)
        self.cell(0, 4, latin(text.upper()))

    def copy(self, x: float, y: float, w: float, text: str, size=9.5, color=INK, line=5.2):
        self.set_xy(x, y)
        self.set_font("Helvetica", "", size)
        self.set_text_color(*color)
        self.multi_cell(w, line, latin(text))


def metric_lookup(payload: dict, country: str, key: str) -> list[list]:
    row = next((item for item in payload["locations"] if item["name"] == country), None)
    return row.get(key, []) if row else []


def series_window(rows: list[list], start=1980, end=2000) -> list[tuple[int, float]]:
    return sorted((int(row[0]), float(row[1])) for row in rows if start <= int(row[0]) <= end and row[1] is not None)


def metric_value(payload: dict, country: str, key: str, year: int) -> float | None:
    rows = metric_lookup(payload, country, key)
    row = next((item for item in rows if int(item[0]) == year), None)
    return float(row[1]) if row and row[1] is not None else None


def line_chart(pdf: AtlasPDF, x: float, y: float, w: float, h: float, series: list[tuple[int, float]], title: str, unit: str, color):
    pdf.set_fill_color(*SURFACE)
    pdf.rect(x, y, w, h, "F")
    pdf.label(x + 4, y + 4, title, color)
    if not series:
        pdf.copy(x + 4, y + 14, w - 8, "No observation in the loaded source window.", 8, MUTED)
        return
    values = [value for _, value in series]
    low, high = min(values), max(values)
    span = high - low or 1
    left, top, cw, ch = x + 5, y + 18, w - 10, h - 27
    pdf.set_draw_color(190, 187, 170)
    for index in range(3):
        gy = top + ch * index / 2
        pdf.line(left, gy, left + cw, gy)
    points = []
    for year, value in series:
        px = left + (year - series[0][0]) / max(1, series[-1][0] - series[0][0]) * cw
        py = top + (high - value) / span * ch
        points.append((px, py))
    pdf.set_draw_color(*color)
    pdf.set_line_width(1.1)
    for first, second in zip(points, points[1:]):
        pdf.line(*first, *second)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(left, y + h - 7)
    pdf.cell(cw / 2, 4, str(series[0][0]))
    pdf.cell(cw / 2, 4, str(series[-1][0]), align="R")
    pdf.set_xy(left, y + 10)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.cell(cw, 4, latin(f"{high:,.1f} to {low:,.1f} {unit}"), align="R")


def feature_rings(feature: dict):
    geometry = feature.get("geometry") or {}
    polygons = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        polygons = [polygons]
    for polygon in polygons:
        if polygon:
            yield polygon[0]


def draw_falklands(pdf: AtlasPDF, spec: dict, x: float, y: float, w: float, h: float, opening=False):
    geo = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    feature = next(item for item in geo["features"] if item.get("properties", {}).get("ADMIN") == "Falkland Islands")
    west, east, south, north = -61.5, -57.5, -52.5, -51.0

    def project(lon, lat):
        return x + (lon - west) / (east - west) * w, y + (north - lat) / (north - south) * h

    pdf.set_fill_color(*OCEAN)
    pdf.rect(x, y, w, h, "F")
    pdf.set_draw_color(63, 84, 88)
    for index in range(1, 6):
        pdf.line(x + w * index / 6, y, x + w * index / 6, y + h)
    for index in range(1, 4):
        pdf.line(x, y + h * index / 4, x + w, y + h * index / 4)
    pdf.set_fill_color(*(CLAY if opening else (137, 126, 83)))
    pdf.set_draw_color(*MANILA)
    for ring in feature_rings(feature):
        points = [project(float(point[0]), float(point[1])) for point in ring]
        pdf.polygon(points, style="DF")
    place_by_name = {place["name"]: place for place in spec["places"]}
    path = ["San Carlos", "Goose Green", "Mount Tumbledown", "Stanley"]
    pdf.set_draw_color(*SLATE)
    pdf.set_line_width(2)
    path_points = [project(place_by_name[name]["lon"], place_by_name[name]["lat"]) for name in path]
    for first, second in zip(path_points, path_points[1:]):
        pdf.line(*first, *second)
    label_offsets = {
        "San Carlos": (3, -2, "L"),
        "Goose Green": (3, -2, "L"),
        "Mount Tumbledown": (-39, 1, "R"),
        "Stanley": (-39, -6, "R"),
    }
    for name, point in zip(path, path_points):
        px, py = point
        pdf.set_fill_color(*(YELLOW if name == "San Carlos" else PAPER))
        pdf.ellipse(px - 2, py - 2, 4, 4, "F")
        dx, dy, align = label_offsets[name]
        pdf.set_xy(px + dx, py + dy)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*PAPER)
        pdf.cell(36, 4, latin(name), align=align)
    pdf.set_xy(x + 5, y + h - 9)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*MANILA)
    pdf.cell(0, 4, "REFERENCE GEOMETRY: NATURAL EARTH 1:110M  |  OPERATIONAL PATH: RETROSPECTIVE SCHEMATIC")


def timeline(pdf: AtlasPDF, spec: dict, x: float, y: float, w: float, h: float):
    events = spec["events"]
    start, end = 18, 44
    pdf.set_draw_color(*INK)
    pdf.set_line_width(1)
    pdf.line(x, y + 7, x + w, y + 7)
    for index, event in enumerate(events):
        day = int(event["date"][-2:]) if event["date"][5:7] == "05" else 31 + int(event["date"][-2:])
        px = x + (day - start) / (end - start) * w
        color = SLATE if event["side"] == "B" else OXBLOOD if event["side"] == "A" else ORANGE
        pdf.set_fill_color(*color)
        pdf.ellipse(px - 1.7, y + 5.3, 3.4, 3.4, "F")
        pdf.set_xy(px - 5, y - 2)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*PAPER)
        pdf.cell(10, 4, str(index + 1), align="C")

    card_w, card_h = 61, 18
    gap_x, gap_y = 4, 5
    for index, event in enumerate(events):
        col, row = index % 4, index // 4
        cx, cy = x + col * (card_w + gap_x), y + 20 + row * (card_h + gap_y)
        color = SLATE if event["side"] == "B" else OXBLOOD if event["side"] == "A" else ORANGE
        pdf.set_fill_color(*SURFACE)
        pdf.rect(cx, cy, card_w, card_h, "F")
        pdf.set_fill_color(*color)
        pdf.rect(cx, cy, 5, card_h, "F")
        pdf.set_xy(cx + 1, cy + 2)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*PAPER)
        pdf.cell(3, 4, str(index + 1), align="C")
        pdf.set_xy(cx + 8, cy + 2)
        pdf.set_text_color(*color)
        pdf.cell(15, 4, event["date"][5:])
        pdf.set_xy(cx + 8, cy + 7)
        pdf.set_font("Helvetica", "", 6.8)
        pdf.set_text_color(*INK)
        pdf.multi_cell(card_w - 11, 3.5, latin(event["label"]))


def fitted_text(pdf: AtlasPDF, text: str, max_width: float, start_size=7.5, minimum=5.5) -> float:
    size = start_size
    while size > minimum:
        pdf.set_font("Helvetica", "", size)
        if pdf.get_string_width(latin(text)) <= max_width:
            break
        size -= 0.25
    return size


def network_metrics(nodes: list[list], edges: list[list]):
    ids = [node[0] for node in nodes]
    adjacency = {node: set() for node in ids}
    for left, right in edges:
        adjacency[left].add(right)
        adjacency[right].add(left)
    between = dict.fromkeys(ids, 0.0)
    for source in ids:
        stack, predecessors = [], {node: [] for node in ids}
        paths, distance = dict.fromkeys(ids, 0.0), dict.fromkeys(ids, -1)
        paths[source], distance[source] = 1.0, 0
        queue = deque([source])
        while queue:
            vertex = queue.popleft()
            stack.append(vertex)
            for neighbor in adjacency[vertex]:
                if distance[neighbor] < 0:
                    queue.append(neighbor)
                    distance[neighbor] = distance[vertex] + 1
                if distance[neighbor] == distance[vertex] + 1:
                    paths[neighbor] += paths[vertex]
                    predecessors[neighbor].append(vertex)
        dependency = dict.fromkeys(ids, 0.0)
        while stack:
            vertex = stack.pop()
            for parent in predecessors[vertex]:
                dependency[parent] += paths[parent] / paths[vertex] * (1 + dependency[vertex])
            if vertex != source:
                between[vertex] += dependency[vertex]
    normalizer = 1 / ((len(ids) - 1) * (len(ids) - 2)) if len(ids) > 2 else 0
    between = {node: value * normalizer for node, value in between.items()}
    return adjacency, between


def network_layout(nodes: list[list], edges: list[list], adjacency: dict):
    random.seed(346)
    positions = {node[0]: [random.uniform(-1, 1), random.uniform(-1, 1)] for node in nodes}
    for step in range(240):
        cooling = 1 - step / 240
        forces = {node[0]: [0.0, 0.0] for node in nodes}
        ids = list(positions)
        for index, left in enumerate(ids):
            for right in ids[index + 1:]:
                dx, dy = positions[left][0] - positions[right][0], positions[left][1] - positions[right][1]
                distance = max(0.05, math.hypot(dx, dy))
                force = 0.018 / distance
                fx, fy = dx / distance * force, dy / distance * force
                forces[left][0] += fx; forces[left][1] += fy
                forces[right][0] -= fx; forces[right][1] -= fy
        for left, right in edges:
            dx, dy = positions[right][0] - positions[left][0], positions[right][1] - positions[left][1]
            distance = max(0.05, math.hypot(dx, dy))
            force = (distance - 0.34) * 0.012
            fx, fy = dx / distance * force, dy / distance * force
            forces[left][0] += fx; forces[left][1] += fy
            forces[right][0] -= fx; forces[right][1] -= fy
        for node in ids:
            positions[node][0] += forces[node][0] * cooling
            positions[node][1] += forces[node][1] * cooling
    return positions


def draw_network(pdf: AtlasPDF, spec: dict, x: float, y: float, w: float, h: float):
    nodes, edges = spec["network"]["nodes"], spec["network"]["edges"]
    adjacency, between = network_metrics(nodes, edges)
    positions = network_layout(nodes, edges, adjacency)
    xs, ys = zip(*positions.values())
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    plotted = {key: (x + 10 + (value[0] - min_x) / (max_x - min_x) * (w - 20), y + 10 + (value[1] - min_y) / (max_y - min_y) * (h - 20)) for key, value in positions.items()}
    pdf.set_fill_color(20, 24, 20)
    pdf.rect(x, y, w, h, "F")
    pdf.set_draw_color(87, 91, 70)
    pdf.set_line_width(0.35)
    for left, right in edges:
        pdf.line(*plotted[left], *plotted[right])
    palette = {"nation": YELLOW, "command": CLAY, "person": MANILA, "formation": SLATE, "place": OLIVE, "event": ORANGE, "loss": OXBLOOD}
    labels = {node[0]: node[1] for node in nodes}
    types = {node[0]: node[2] for node in nodes}
    for node_id in sorted(plotted, key=lambda item: len(adjacency[item])):
        px, py = plotted[node_id]
        radius = 1.7 + math.sqrt(len(adjacency[node_id])) * 0.75
        pdf.set_fill_color(*palette[types[node_id]])
        pdf.set_draw_color(*PAPER)
        pdf.ellipse(px - radius, py - radius, radius * 2, radius * 2, "DF")
        label = latin(labels[node_id])
        label_w = min(47, max(20, pdf.get_string_width(label) + 2))
        label_x = px + radius + 1
        align = "L"
        if label_x + label_w > x + w - 2:
            label_x = px - radius - label_w - 1
            align = "R"
        pdf.set_xy(max(x + 2, label_x), py - 2)
        size = fitted_text(pdf, label, label_w, 6.6, 5.5)
        pdf.set_font("Helvetica", "B" if len(adjacency[node_id]) >= 3 else "", size)
        pdf.set_text_color(*PAPER)
        pdf.cell(label_w, 4, label, align=align)
    return adjacency, between


def add_cover(pdf: AtlasPDF, spec: dict):
    pdf.add_page()
    pdf.set_fill_color(*INK)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    draw_falklands(pdf, spec, 145, 0, 152, 210)
    pdf.set_fill_color(*INK)
    pdf.rect(0, 0, 154, 210, "F")
    pdf.set_xy(16, 18)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*ORANGE)
    pdf.cell(0, 5, "THE WAR MAPS PROJECT / PRINT PROTOTYPE 01")
    pdf.set_xy(16, 42)
    pdf.set_font("Times", "B", 31)
    pdf.set_text_color(*PAPER)
    pdf.multi_cell(126, 12, latin(spec["title"]))
    pdf.set_xy(16, 90)
    pdf.set_font("Times", "", 17)
    pdf.set_text_color(*MANILA)
    pdf.multi_cell(120, 8, latin(spec["subtitle"]))
    pdf.set_xy(16, 135)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*YELLOW)
    pdf.cell(0, 5, "18 MAY - 13 JUNE 1982")
    pdf.set_xy(16, 146)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(205, 205, 192)
    pdf.multi_cell(112, 5.5, "A dated field of states, forces, people, losses, places, and events before the campaign endpoint.")
    pdf.set_xy(16, 190)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*MANILA)
    pdf.cell(0, 4, "UCDP CONFLICT 346  /  INTERSTATE  /  TERRITORIAL INCOMPATIBILITY")


def add_principle(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Method", "One map / changing field", "Choosing the informative interval", "A war map is one recurring structure populated by a different conflict and interval. The interval is selected where the movement that later prevailed is underway but victory has not yet removed the contested field.")
    pdf.label(14, 63, "The focal-range rule")
    pdf.set_fill_color(*INK); pdf.rect(14, 70, 269, 35, "F")
    pdf.set_xy(22, 78); pdf.set_font("Times", "B", 17); pdf.set_text_color(*PAPER)
    pdf.multi_cell(252, 8, "Begin before the retrospectively decisive movement. End before the conflict endpoint.")
    pdf.copy(14, 116, 126, "This keeps occupation, resistance, command decisions, losses, uncertainty, and competing capacity visible at once. It avoids selecting only the opening shock or the spectacle of final destruction.", 10, INK, 6)
    pdf.copy(154, 116, 129, "The rule does not turn hindsight into inevitability. The focal movement is an interpretive selection that must be stated, sourced, and open to revision. Other intervals can be generated from the same conflict record.", 10, INK, 6)
    pdf.label(14, 164, "Falklands / Malvinas selection")
    pdf.copy(14, 172, 269, spec["selection_note"], 9.5, MUTED, 5.5)


def add_range(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Focal field", "Interval address", "Before the landing / before surrender", "The selected frame begins three days before San Carlos and ends one day before the formal surrender. Events outside it remain context, not plotted observations.")
    pdf.set_draw_color(*INK); pdf.set_line_width(1.2); pdf.line(25, 95, 272, 95)
    marks = [(25, "18 MAY", "Air component reinforced\nInterval opens", SLATE), (75, "21 MAY", "San Carlos landings\nFocal movement", YELLOW), (151, "28-29 MAY", "Goose Green", ORANGE), (247, "13 JUNE", "Final attacks underway\nInterval closes", CLAY), (272, "14 JUNE", "Surrender\nExcluded endpoint", OXBLOOD)]
    for px, date, note, color in marks:
        pdf.set_fill_color(*color); pdf.ellipse(px - 3, 92, 6, 6, "F")
        pdf.set_xy(px - 20, 105); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*color); pdf.cell(40, 5, date, align="C")
        pdf.set_xy(px - 24, 113); pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*INK); pdf.multi_cell(48, 4.5, latin(note), align="C")
    pdf.label(14, 157, "Data boundary")
    pdf.copy(14, 165, 269, "UCDP supplies one 1982 conflict-year record for conflict 346. The dated sequence on subsequent pages is a curated print layer from the cited National Army Museum, RAF Museum, Argentine government, and parliamentary records. It is not represented as UCDP event data.", 9.5, MUTED, 5.5)


def add_field(pdf: AtlasPDF, spec: dict):
    pdf.section_page("War map", "Operational field", "The movement across East Falkland", "Clay records the Argentine-held island field at the opening of the interval. The slate path is a retrospective schematic of the British movement from the San Carlos beachhead toward Stanley.")
    draw_falklands(pdf, spec, 14, 58, 190, 126, opening=True)
    pdf.label(215, 62, "Opening condition", OXBLOOD)
    pdf.copy(215, 70, 66, "Argentine forces occupied the islands. The British land force had not yet established its beachhead.", 9, INK, 5.2)
    pdf.label(215, 105, "Departure", SLATE)
    pdf.copy(215, 113, 66, "The 21 May landing established a sustained land position. Fighting at sea and in the air continued around it.", 9, INK, 5.2)
    pdf.label(215, 151, "Endpoint withheld", CLAY)
    pdf.copy(215, 159, 66, "The map stops while final attacks are underway, before surrender resolves the field.", 9, INK, 5.2)


def add_losses(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Human record", "Reported deaths", "Conflict mortality is not scenery", "The print field begins with reported deaths, but does not use trauma as visual spectacle. Counts remain attached to producer and denominator.")
    total = sum(item["value"] for item in spec["casualties"])
    x, y, max_w = 18, 74, 252
    for index, item in enumerate(spec["casualties"]):
        width = item["value"] / max(row["value"] for row in spec["casualties"]) * max_w
        color = OXBLOOD if index == 0 else SLATE if index == 1 else CLAY
        pdf.set_fill_color(*color); pdf.rect(x, y + index * 25, width, 13, "F")
        label_x = x + 4 if width >= 58 else x + width + 4
        label_color = PAPER if width >= 58 else INK
        pdf.set_xy(label_x, y + index * 25 + 3); pdf.set_font("Helvetica", "B", 10); pdf.set_text_color(*label_color); pdf.cell(100, 6, latin(f"{item['value']:,}  {item['label']}"))
    pdf.set_xy(18, 153); pdf.set_font("Times", "B", 24); pdf.set_text_color(*INK); pdf.cell(65, 10, f"{total:,}")
    pdf.copy(65, 154, 95, "reported deaths across the three displayed categories", 9, MUTED, 5)
    pdf.copy(174, 151, 107, "The UK MOD cohort study reports 237 armed-forces personnel dying during its defined campaign period. The museum and parliamentary total of 255 uses a broader campaign convention. Both are cited; they are not silently merged.", 8.5, MUTED, 4.8)


def add_life_death(pdf: AtlasPDF, spec: dict, conflict: dict, health: dict, birth: dict, population: dict):
    pdf.section_page(
        "Life and death",
        "Five measures / five scales",
        "The conflict inside the living field",
        "Campaign deaths are set against the annual population-health observations that contain the conflict period. Bar length compares the two state records within a row only; unlike units are never added.",
    )
    deaths = {"Argentina": 649.0, "United Kingdom": 255.0}
    rows = [
        ("Conflict deaths", "campaign total", OXBLOOD, deaths),
        ("Population", "people in 1982", MANILA, {country: metric_value(population, country, "population", 1982) for country in spec["states"]}),
        ("All-cause mortality", "deaths per 100,000 in 1982", (39, 56, 73), {country: metric_value(health, country, "mortality", 1982) for country in spec["states"]}),
        ("Total fertility", "births per woman in 1982", (75, 48, 69), {country: metric_value(health, country, "fertility", 1982) for country in spec["states"]}),
        ("Crude birth rate", "live births per 1,000 in 1982", OLIVE, {country: metric_value(birth, country, "birth_rate", 1982) for country in spec["states"]}),
    ]
    center, max_bar = 148.5, 83
    pdf.set_xy(14, 61); pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*OXBLOOD); pdf.cell(117, 5, "ARGENTINA", align="R")
    pdf.set_xy(166, 61); pdf.set_text_color(*SLATE); pdf.cell(117, 5, "UNITED KINGDOM")
    pdf.set_draw_color(185, 181, 164); pdf.set_line_width(0.45); pdf.line(center, 67, center, 163)
    for index, (label, unit, color, values) in enumerate(rows):
        y = 72 + index * 19
        left, right = values["Argentina"], values["United Kingdom"]
        maximum = max(value for value in (left, right) if value is not None)
        left_w = 0 if left is None else left / maximum * max_bar
        right_w = 0 if right is None else right / maximum * max_bar
        pdf.set_fill_color(*SURFACE); pdf.rect(center - max_bar, y + 7, max_bar, 5.5, "F"); pdf.rect(center, y + 7, max_bar, 5.5, "F")
        pdf.set_fill_color(*color); pdf.rect(center - left_w, y + 7, left_w, 5.5, "F"); pdf.rect(center, y + 7, right_w, 5.5, "F")
        pdf.set_xy(center - 52, y - 1); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*INK); pdf.cell(104, 4, latin(label.upper()), align="C")
        pdf.set_xy(center - 52, y + 3); pdf.set_font("Helvetica", "", 6.5); pdf.set_text_color(*MUTED); pdf.cell(104, 3.5, latin(unit), align="C")
        left_label = "NA" if left is None else f"{left:,.2f}".rstrip("0").rstrip(".")
        right_label = "NA" if right is None else f"{right:,.2f}".rstrip("0").rstrip(".")
        pdf.set_xy(14, y + 7); pdf.set_font("Helvetica", "B", 7.5); pdf.set_text_color(*color); pdf.cell(45, 5.5, left_label)
        pdf.set_xy(238, y + 7); pdf.cell(45, 5.5, right_label, align="R")
    conflict_start = conflict.get("start_date") or "1982-04-02"
    conflict_end = conflict.get("end_date") or "1982-06-14"
    pdf.label(14, 174, "Temporal and measurement boundary")
    pdf.copy(14, 181, 269, f"Conflict record: {conflict_start} through {conflict_end}. The 649 and 255 death figures are cited campaign totals, not deaths isolated to the 18 May-13 June focal field. Population is a mid-year count; mortality, fertility, and crude birth rate are annual 1982 observations. Each remains attached to its producer and denominator.", 8.3, MUTED, 4.6)


def add_nation(pdf: AtlasPDF, country: str, side: str, conflict: dict, health: dict, birth: dict, population: dict, conditions: list[dict]):
    color = OXBLOOD if side == "A" else SLATE
    pdf.section_page("Nation field", f"UCDP side {side}", country, f"State record at the focal interval, followed by observed population-health trajectories. These series provide recovery context; they do not identify the conflict as their cause.")
    condition = next((row for row in conditions if row["country"] == country and row["year"] == 1982), None)
    pdf.set_fill_color(*color); pdf.rect(14, 60, 82, 38, "F")
    pdf.set_xy(20, 68); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*PAPER); pdf.cell(0, 5, "UCDP 1982")
    pdf.set_xy(20, 78); pdf.set_font("Times", "B", 16); pdf.cell(68, 8, latin(f"Side {side} / intensity {conflict['peak_intensity']}"))
    pdf.copy(104, 63, 78, "Government of " + country + " is the state party encoded in UCDP conflict 346.", 9, INK, 5.2)
    regime = "Not loaded"
    if condition:
        regime = str(condition.get("regime", {}).get("label") or condition.get("regime_label") or "V-Dem observation loaded")
    pdf.label(196, 64, "V-Dem 1982")
    pdf.copy(196, 72, 85, regime, 9, INK, 5.2)
    mortality = series_window(metric_lookup(health, country, "mortality"))
    fertility = series_window(metric_lookup(health, country, "fertility"))
    crude = series_window(metric_lookup(birth, country, "birth_rate"))
    pop = series_window(metric_lookup(population, country, "population"))
    line_chart(pdf, 14, 111, 64, 70, mortality, "All-cause mortality", "per 100k", OCEAN)
    line_chart(pdf, 83, 111, 64, 70, fertility, "Total fertility", "births/woman", (75, 48, 69))
    line_chart(pdf, 152, 111, 64, 70, crude, "Crude birth rate", "per 1,000", OLIVE)
    line_chart(pdf, 221, 111, 62, 70, pop, "Population", "people", CLAY)


def add_demography(pdf: AtlasPDF, spec: dict, health: dict, birth: dict):
    pdf.section_page("Recovery field", "Observed afterlives", "War ends / population continues", "Mortality, fertility, and crude birth rate remain separate measures. A postwar change can frame a question about recovery, but temporal sequence alone does not establish that war caused the change.")
    for row, country in enumerate(spec["states"]):
        y = 66 + row * 60
        pdf.label(14, y, country, OXBLOOD if country == "Argentina" else SLATE)
        line_chart(pdf, 58, y - 4, 69, 51, series_window(metric_lookup(health, country, "mortality"), 1980, 1995), "Mortality 1980-95", "per 100k", OCEAN)
        line_chart(pdf, 132, y - 4, 69, 51, series_window(metric_lookup(health, country, "fertility"), 1980, 1995), "Fertility 1980-95", "births/woman", (75, 48, 69))
        line_chart(pdf, 206, y - 4, 77, 51, series_window(metric_lookup(birth, country, "birth_rate"), 1980, 1995), "Crude birth rate 1980-95", "per 1,000", OLIVE)
    pdf.copy(14, 185, 269, "Future volumes can test whether demographic departures precede, accompany, or follow changes in military capacity. This prototype does not infer a baby-boom-to-war causal path from two national series.", 8.5, MUTED, 4.7)


def add_events(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Chronology", "Dated observations", "The field remains unresolved", "The event sequence is bounded by the chosen interval. The formal surrender on 14 June is shown only as the excluded endpoint.")
    timeline(pdf, spec, 20, 73, 256, 92)
    pdf.label(14, 174, "Reading direction")
    pdf.copy(14, 181, 269, "Slate marks British movement or capacity; oxblood marks Argentine attacks or losses imposed on the British force; orange marks direct engagements. Colors identify roles in this selected record, not moral standing.", 8.5, MUTED, 4.8)


def add_network(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Conflict network", "Mechanics of the interval", "People, forces, places, events, losses", "The network is a sourced analytical diagram for the focal range. Node area follows degree. Lines indicate an encoded relation in this print specification, not command unless the connected labels state a command relation.")
    adjacency, between = draw_network(pdf, spec, 14, 57, 269, 129)
    return adjacency, between


def add_network_analysis(pdf: AtlasPDF, spec: dict, adjacency: dict, between: dict):
    nodes = spec["network"]["nodes"]
    labels = {node[0]: node[1] for node in nodes}
    pdf.section_page("Conflict network", "Structural diagnostics", "Degree and betweenness", "Degree counts direct relations in this edition. Normalized betweenness estimates how often a node lies on shortest paths between other nodes. Neither measure proves authority, courage, responsibility, or causal control.")
    ranked_degree = sorted(adjacency, key=lambda node: (-len(adjacency[node]), labels[node]))[:10]
    ranked_between = sorted(between, key=lambda node: (-between[node], labels[node]))[:10]
    pdf.label(14, 62, "Highest degree", SLATE)
    for index, node in enumerate(ranked_degree):
        y = 72 + index * 10
        value = len(adjacency[node]); width = value / max(map(len, adjacency.values())) * 92
        pdf.set_fill_color(*SLATE); pdf.rect(65, y, width, 5.5, "F")
        pdf.set_xy(14, y); size = fitted_text(pdf, labels[node], 48, 7.5, 5.5); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(49, 5, latin(labels[node]))
        pdf.set_xy(160, y); pdf.cell(12, 5, str(value), align="R")
    pdf.label(178, 62, "Highest normalized betweenness", ORANGE)
    for index, node in enumerate(ranked_between):
        y = 72 + index * 10
        value = between[node]; width = value / max(between.values()) * 74 if max(between.values()) else 0
        pdf.set_fill_color(*ORANGE); pdf.rect(224, y, width, 5.5, "F")
        pdf.set_xy(178, y); size = fitted_text(pdf, labels[node], 43, 7.5, 5.5); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(44, 5, latin(labels[node]))
        pdf.set_xy(269, y); pdf.cell(14, 5, f"{value:.3f}", align="R")
    distribution = Counter(map(len, adjacency.values()))
    pdf.label(14, 177, "Degree distribution")
    pdf.copy(14, 184, 269, "  /  ".join(f"degree {degree}: {count} node{'s' if count != 1 else ''}" for degree, count in sorted(distribution.items())), 7.5, MUTED, 4.2)


def add_sources(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Documentation", "Provenance and limits", "Sources / transformations / revision path", "Every dated claim in the print layer is addressable to a listed producer. The map and network are project transformations; source observations retain their producers and boundaries.")
    y = 62
    for key, source in spec["sources"].items():
        domain = urlparse(source["url"]).netloc.removeprefix("www.")
        pdf.set_xy(14, y); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*INK); pdf.cell(53, 5, latin(key.upper()))
        pdf.set_xy(67, y); pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*INK); pdf.cell(145, 5, latin(source["title"][:82]))
        pdf.set_xy(214, y); pdf.set_text_color(*CLAY); pdf.cell(69, 5, latin(domain), link=source["url"])
        y += 10
    pdf.set_fill_color(*INK); pdf.rect(14, 176, 269, 18, "F")
    pdf.set_xy(19, 181); pdf.set_font("Helvetica", "", 8); pdf.set_text_color(*PAPER)
    pdf.cell(0, 5, "Generated reproducibly from repository data and print specification. Review interval, event selection, node relations, and source addresses before publication.")


def event_totals(events: list[dict]) -> dict[str, dict[str, int]]:
    totals = defaultdict(lambda: {"events": 0})
    for event in events:
        row = totals[event.get("network_location") or event["country"]]
        row["events"] += 1
    return dict(totals)


def metric_value_for(payload: dict, names: list[str], key: str, year: int | None = None) -> tuple[int, float] | None:
    row = next((item for item in payload["locations"] if item["name"] in names), None)
    if not row or not row.get(key):
        return None
    values = row[key]
    selected = next((item for item in values if year is not None and int(item[0]) == year), None) if year else values[-1]
    return (int(selected[0]), float(selected[1])) if selected else None


def draw_event_region(pdf: AtlasPDF, spec: dict, events: list[dict], x: float, y: float, w: float, h: float, cover=False):
    west, east, south, north = spec["map_bounds"]
    totals = event_totals(events)
    affected = set(totals)
    geo = json.loads(GEOMETRY.read_text(encoding="utf-8"))

    def project(lon, lat):
        px = x + (max(west, min(east, lon)) - west) / (east - west) * w
        py = y + (north - max(south, min(north, lat))) / (north - south) * h
        return px, py

    pdf.set_fill_color(*OCEAN)
    pdf.rect(x, y, w, h, "F")
    pdf.set_draw_color(63, 84, 88)
    for index in range(1, 7):
        pdf.line(x + w * index / 7, y, x + w * index / 7, y + h)
    for index in range(1, 5):
        pdf.line(x, y + h * index / 5, x + w, y + h * index / 5)
    for feature in geo["features"]:
        name = feature.get("properties", {}).get("ADMIN", "")
        rings = list(feature_rings(feature))
        if not rings:
            continue
        flat = [point for ring in rings for point in ring]
        if max(point[0] for point in flat) < west or min(point[0] for point in flat) > east or max(point[1] for point in flat) < south or min(point[1] for point in flat) > north:
            continue
        fill = (137, 126, 83) if name not in affected else CLAY
        if name == "Iran":
            fill = OXBLOOD
        elif name == "Israel":
            fill = SLATE
        pdf.set_fill_color(*fill)
        pdf.set_draw_color(*MANILA)
        pdf.set_line_width(0.25)
        for ring in rings:
            pdf.polygon([project(float(point[0]), float(point[1])) for point in ring], style="DF")
    for event in (item for item in events if item["map_point_eligible"]):
        px, py = project(float(event["plot_longitude"]), float(event["plot_latitude"]))
        radius = 1.15
        pdf.set_fill_color(*OXBLOOD)
        pdf.set_draw_color(*PAPER)
        pdf.ellipse(px - radius, py - radius, radius * 2, radius * 2, "DF")
    if not cover:
        top = sorted(totals.items(), key=lambda item: (-item[1]["events"], item[0]))[:7]
        for index, (name, values) in enumerate(top):
            cy = y + 5 + index * 5
            pdf.set_fill_color(*(OXBLOOD if name == "Iran" else CLAY))
            pdf.ellipse(x + 4, cy + 0.8, 2.5, 2.5, "F")
            pdf.set_xy(x + 9, cy)
            pdf.set_font("Helvetica", "B", 6.5)
            pdf.set_text_color(*PAPER)
            pdf.cell(52, 4, latin(f"{name}  {values['events']} observations"))


def current_network(events: list[dict], conflict: dict):
    nodes: dict[str, list] = {}
    edges: set[tuple[str, str]] = set()
    event_meta = {}

    def add(node_id, label, kind):
        nodes.setdefault(node_id, [node_id, label, kind])

    def link(left, right):
        edges.add(tuple(sorted((left, right))))

    add("conflict", "Iran conflict 16905", "conflict")
    add("side-a", "UCDP Side A", "side_a"); add("side-b", "UCDP Side B", "side_b")
    link("conflict", "side-a"); link("conflict", "side-b")
    parties = [("iran", "Iran / party", "side-a"), ("israel", "Israel / party", "side-b"), ("usa", "United States / party", "side-b")]
    for node_id, label, side in parties:
        add(node_id, label, "nation"); link(side, node_id)
    for actor, side in [("Government of Iran", "side-a"), ("Government of Israel", "side-b"), ("Government of United States of America", "side-b")]:
        node_id = "actor-" + actor.lower().replace(" ", "-")
        add(node_id, actor, "actor"); link(side, node_id)
    for event in events:
        location = event.get("network_location") or event["country"]
        location_id = "location-" + location.lower().replace(" ", "-")
        add(location_id, location + " / locale", "location"); link("conflict", location_id)
        for node_id, _, _ in parties:
            link(node_id, location_id)
        event_id = "event-" + event["id"]
        add(event_id, f"{event['date_start']} / {event['place']}", "observation")
        event_meta[event_id] = event
        link(location_id, event_id)
    node_list = list(nodes.values())
    edge_list = [list(edge) for edge in sorted(edges)]
    return node_list, edge_list, event_meta


def draw_current_network(pdf: AtlasPDF, spec: dict, events: list[dict], conflict: dict, x: float, y: float, w: float, h: float):
    nodes, edges, event_meta = current_network(events, conflict)
    adjacency, between = network_metrics(nodes, edges)
    by_location = defaultdict(list)
    for event in events:
        by_location[event.get("network_location") or event["country"]].append(event)
    positions = {"conflict": (0.5, 0.5), "side-a": (0.18, 0.10), "side-b": (0.82, 0.10), "iran": (0.12, 0.23), "israel": (0.74, 0.20), "usa": (0.91, 0.23)}
    actor_positions = {
        "actor-government-of-iran": (0.31, 0.05),
        "actor-government-of-israel": (0.62, 0.05),
        "actor-government-of-united-states-of-america": (0.88, 0.05),
    }
    positions.update(actor_positions)
    locations = sorted(by_location, key=lambda name: (-len(by_location[name]), name))
    for index, name in enumerate(locations):
        angle = -math.pi / 2 + index * math.tau / len(locations)
        location_id = "location-" + name.lower().replace(" ", "-")
        anchor = (0.5 + 0.30 * math.cos(angle), 0.56 + 0.28 * math.sin(angle))
        positions[location_id] = anchor
        for event_index, event in enumerate(sorted(by_location[name], key=lambda item: item["id"])):
            event_angle = event_index * 2.399963
            radius = 0.026 + 0.012 * math.sqrt(event_index)
            positions["event-" + event["id"]] = (anchor[0] + math.cos(event_angle) * radius, anchor[1] + math.sin(event_angle) * radius)
    plotted = {node_id: (x + 8 + px * (w - 16), y + 7 + py * (h - 14)) for node_id, (px, py) in positions.items()}
    types = {node[0]: node[2] for node in nodes}; labels = {node[0]: node[1] for node in nodes}
    palette = {"conflict": ORANGE, "side_a": SLATE, "side_b": OXBLOOD, "nation": OLIVE, "actor": MANILA, "location": CLAY, "observation": OXBLOOD}
    pdf.set_fill_color(20, 24, 20); pdf.rect(x, y, w, h, "F")
    pdf.set_draw_color(82, 88, 72); pdf.set_line_width(0.25)
    for left, right in edges:
        pdf.line(*plotted[left], *plotted[right])
    former_only = set(spec.get("us_basing_context", {}).get("former_only", []))
    for node in sorted(nodes, key=lambda item: item[2] != "observation"):
        node_id, label, kind = node
        px, py = plotted[node_id]
        if kind == "observation":
            radius = 0.75
        elif kind == "location":
            country = label.removesuffix(" / locale")
            count = len(by_location[country]); radius = 1.9 + math.sqrt(count) * 0.43
        else:
            radius = 2.2 + math.sqrt(len(adjacency[node_id])) * 0.42
        if kind == "location" and label.removesuffix(" / locale") in former_only:
            pdf.set_draw_color(255, 255, 255); pdf.set_line_width(1.2)
            pdf.ellipse(px - radius - 1.6, py - radius - 1.6, radius * 2 + 3.2, radius * 2 + 3.2, "D")
        pdf.set_fill_color(*palette[kind]); pdf.set_draw_color(*PAPER); pdf.set_line_width(0.35)
        pdf.ellipse(px - radius, py - radius, radius * 2, radius * 2, "DF")
        show_label = kind != "observation"
        if show_label:
            text = label
            label_w = 43
            label_x, align = px + radius + 1, "L"
            if node_id == "actor-government-of-israel":
                label_x, align = px - radius - label_w - 1, "R"
            if label_x + label_w > x + w - 2:
                label_x, align = px - radius - label_w - 1, "R"
            pdf.set_xy(max(x + 2, label_x), py - 2)
            size = fitted_text(pdf, text, label_w, 6.2, 5.0)
            pdf.set_font("Helvetica", "B" if kind in {"conflict", "location"} else "", size)
            pdf.set_text_color(*PAPER); pdf.cell(label_w, 4, latin(text), align=align)
    legend = [("Formal side", SLATE), ("Party state", OLIVE), ("Government", MANILA), ("Locale", CLAY), ("Event", OXBLOOD), ("Conflict", ORANGE)]
    for index, (label, color) in enumerate(legend):
        lx = x + 4 + index * 38
        pdf.set_fill_color(*color); pdf.ellipse(lx, y + h - 7, 2.5, 2.5, "F")
        pdf.set_xy(lx + 4, y + h - 8); pdf.set_font("Helvetica", "", 5.6); pdf.set_text_color(*PAPER); pdf.cell(31, 4, label)
    lx = x + 4 + len(legend) * 38
    pdf.set_draw_color(255, 255, 255); pdf.set_line_width(0.8); pdf.ellipse(lx, y + h - 7.5, 3.4, 3.4, "D")
    pdf.set_xy(lx + 5, y + h - 8); pdf.set_font("Helvetica", "", 5.6); pdf.set_text_color(*PAPER); pdf.cell(31, 4, "Former-only U.S. footprint")
    return nodes, edges, adjacency, between


def current_aliases(country: str, source: str) -> list[str]:
    aliases = {
        ("Iran", "health"): ["Iran (Islamic Republic of)"],
        ("Iran", "world-bank"): ["Iran, Islamic Rep."],
        ("United States of America", "health"): ["United States of America"],
        ("United States of America", "world-bank"): ["United States"],
    }
    return aliases.get((country, source), [country])


def current_series(payload: dict, country: str, source: str, key: str, start: int, end: int) -> list[tuple[int, float]]:
    names = current_aliases(country, source)
    row = next((item for item in payload["locations"] if item["name"] in names), None)
    return series_window(row.get(key, []) if row else [], start, end)


def add_current_cover(pdf: AtlasPDF, spec: dict, events: list[dict]):
    pdf.add_page(); pdf.set_fill_color(*INK); pdf.rect(0, 0, pdf.w, pdf.h, "F")
    draw_event_region(pdf, spec, events, 145, 0, 152, 210, cover=True)
    pdf.set_fill_color(*INK); pdf.rect(0, 0, 154, 210, "F")
    pdf.set_xy(16, 18); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*ORANGE); pdf.cell(0, 5, "THE WAR MAPS PROJECT / CURRENT FIELD PROOF")
    pdf.set_xy(16, 42); pdf.set_font("Times", "B", 31); pdf.set_text_color(*PAPER); pdf.multi_cell(126, 12, latin(spec["title"]))
    pdf.set_xy(16, 88); pdf.set_font("Times", "", 17); pdf.set_text_color(*MANILA); pdf.multi_cell(120, 8, latin(spec["subtitle"]))
    pdf.set_xy(16, 132); pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*YELLOW); pdf.cell(0, 5, "28 FEBRUARY - 30 JULY 2026")
    pdf.set_xy(16, 144); pdf.set_font("Helvetica", "", 9); pdf.set_text_color(205, 205, 192)
    pdf.multi_cell(112, 5.5, "125 candidate events connected to their recorded locales. The field remains unresolved beyond the source boundary.")
    pdf.set_xy(16, 189); pdf.set_font("Helvetica", "B", 7); pdf.set_text_color(*MANILA)
    pdf.cell(0, 4, "UCDP CANDIDATE CONFLICT 16905  /  STATE-BASED  /  OPEN AT SOURCE BOUNDARY")


def add_current_principle(pdf: AtlasPDF, spec: dict):
    pdf.section_page("Method", "Current war / unresolved outcome", "No retrospective turning point yet", "The historical War Map rule selects a movement visible before eventual victory. A current conflict has no such hindsight. This proof therefore maps the complete observed candidate-event interval without predicting its endpoint.")
    pdf.label(14, 65, "Current-field rule")
    pdf.set_fill_color(*INK); pdf.rect(14, 72, 269, 34, "F")
    pdf.set_xy(22, 80); pdf.set_font("Times", "B", 17); pdf.set_text_color(*PAPER)
    pdf.multi_cell(252, 8, "Begin at the first observed departure. End at the latest source observation. Keep the frontier open.")
    pdf.copy(14, 118, 126, "The map does not borrow certainty from a future outcome. It retains the event field, recorded parties, locations, casualties, source status, and unanswered causal structure available now.", 10, INK, 6)
    pdf.copy(154, 118, 129, "The source currently begins on 28 February and contains events through 30 July 2026. The project date is later than the observation boundary; the missing interval remains missing.", 10, INK, 6)
    pdf.label(14, 166, "Selection statement")
    pdf.copy(14, 174, 269, spec["selection_note"], 9.3, MUTED, 5.3)


def add_current_range(pdf: AtlasPDF, events: list[dict]):
    pdf.section_page("Observed interval", "Candidate-event accumulation", "The field develops by month", "Counts show observations in the loaded candidate-event snapshots. Casualty estimates remain attached to individual records because candidate observations can overlap.")
    monthly = defaultdict(lambda: {"events": 0})
    for event in events:
        key = event["date_start"][:7]
        monthly[key]["events"] += 1
    items = sorted(monthly.items())
    max_events = max(row["events"] for _, row in items)
    for index, (month, values) in enumerate(items):
        x = 16 + index * 45
        pdf.set_xy(x, 67); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*CLAY); pdf.cell(38, 5, date.fromisoformat(month + "-01").strftime("%B").upper(), align="C")
        event_h = values["events"] / max_events * 55
        pdf.set_fill_color(*SLATE); pdf.rect(x + 14, 137 - event_h, 16, event_h, "F")
        pdf.set_xy(x + 8, 142); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*SLATE); pdf.cell(28, 4, f"{values['events']} obs", align="C")
    pdf.label(14, 160, "Reading the interval")
    pdf.copy(14, 168, 269, "The opening month contains the largest number of candidate observations and the beginning of the multi-locale structure. Later observations extend the temporal enclosure; they do not retroactively establish an eventual winner or decisive movement.", 9, MUTED, 5.2)


def add_current_map(pdf: AtlasPDF, spec: dict, events: list[dict]):
    pdf.section_page("Regional field", "Eligible event coordinates", "One conflict, a provisional event field", "The formal UCDP dyad occupies a wider geographic event surface. Equal-area circles are candidate observations with eligible point geometry; country fill identifies recorded terrestrial locale, not belligerent membership.")
    draw_event_region(pdf, spec, events, 14, 58, 269, 126)
    pdf.label(14, 188, "Boundary")
    pdf.copy(14, 194, 269, "Natural Earth supplies reference geometry. UCDP supplies event coordinates, location precision, status, parties, and fatality ranges. Precision 5-6 and Check geography records are withheld from the point layer; maritime observations use separate network locales.", 7.8, MUTED, 4.2)


def add_locale_proportions(pdf: AtlasPDF, events: list[dict]):
    pdf.section_page("Regional field", "Locale proportionality", "Where candidate observations accumulate", "Event share uses the loaded conflict network as its denominator. It describes source-record density, not attack direction, casualties, or a complete regional war ledger.")
    totals = event_totals(events); total_events = len(events)
    ordered = sorted(totals.items(), key=lambda item: (-item[1]["events"], item[0]))
    pdf.label(14, 61, "Recorded locale"); pdf.label(93, 61, "Observation share", SLATE); pdf.label(190, 61, "Casualty roll-up", OXBLOOD)
    for index, (name, values) in enumerate(ordered):
        y = 70 + index * 8.5
        event_share = values["events"] / total_events
        pdf.set_xy(14, y); size = fitted_text(pdf, name, 55, 7.5, 6); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(57, 5, latin(name))
        pdf.set_xy(71, y); pdf.set_font("Helvetica", "B", 7); pdf.set_text_color(*SLATE); pdf.cell(20, 5, f"{values['events']}/{total_events}", align="R")
        pdf.set_fill_color(*SURFACE); pdf.rect(95, y, 69, 5, "F"); pdf.set_fill_color(*SLATE); pdf.rect(95, y, 69 * event_share, 5, "F")
        pdf.set_xy(165, y); pdf.set_text_color(*SLATE); pdf.cell(18, 5, f"{event_share:.1%}", align="R")
        pdf.set_xy(190, y); pdf.set_text_color(*MUTED); pdf.cell(93, 5, "not computed / possible overlap", align="R")
    gcc = {"Bahrain", "Kuwait", "Oman", "Saudi Arabia", "United Arab Emirates"}
    gcc_events = sum(values["events"] for name, values in totals.items() if name in gcc)
    pdf.set_fill_color(*INK); pdf.rect(14, 177, 269, 18, "F")
    pdf.set_xy(20, 181); pdf.set_font("Helvetica", "B", 9); pdf.set_text_color(*PAPER)
    pdf.cell(0, 5, latin(f"GCC VULNERABILITY FIELD  {gcc_events}/{total_events} observations ({gcc_events/total_events:.1%})  /  CASUALTY ROLL-UP NOT COMPUTED"))


def iso_block(pdf: AtlasPDF, x: float, y: float, size: float, color, outline=False):
    top = [(x, y), (x + size, y - size * 0.45), (x + size * 2, y), (x + size, y + size * 0.45)]
    left = [(x, y), (x + size, y + size * 0.45), (x + size, y + size * 1.35), (x, y + size * 0.9)]
    right = [(x + size, y + size * 0.45), (x + size * 2, y), (x + size * 2, y + size * 0.9), (x + size, y + size * 1.35)]
    if outline:
        pdf.set_draw_color(255, 255, 255); pdf.set_line_width(0.55)
        for face in (top, left, right): pdf.polygon(face, style="D")
        return
    top_color = tuple(min(255, channel + 28) for channel in color)
    side_color = tuple(max(0, channel - 22) for channel in color)
    pdf.set_draw_color(*PAPER); pdf.set_line_width(0.15)
    pdf.set_fill_color(*top_color); pdf.polygon(top, style="DF")
    pdf.set_fill_color(*color); pdf.polygon(left, style="DF")
    pdf.set_fill_color(*side_color); pdf.polygon(right, style="DF")


def add_current_isometric_life_death(pdf: AtlasPDF, spec: dict, events: list[dict], health: dict, birth: dict, population: dict):
    pdf.section_page("Life and death", "Isometric regional comparison", "Relative stacks across the vulnerability field", "Each metric forms a separate stack at every observed locale. Stack height is normalized within that metric and carries no shared vertical unit. The basing-context stack is ordinal only and does not represent installation or troop counts.")
    context = spec["us_basing_context"]
    totals = event_totals(events)
    countries = list(context["locales"])
    centroids = {}
    for country in countries:
        local = [event for event in events if event.get("network_location") == country and event["map_point_eligible"]]
        if local:
            centroids[country] = (sum(event["longitude"] for event in local) / len(local), sum(event["latitude"] for event in local) / len(local))
    centroids["Qatar"] = (51.18, 25.35)
    countries.append("Qatar")
    base_levels = {"persistent + other": 4, "persistent": 3, "other identified sites": 2, "other identified site": 2, "former-only footprint": 1, "not classified here": 0}
    metric_values = {
        "conflict": {country: float(totals.get(country, {}).get("events", 0)) for country in countries},
        "population": {}, "mortality": {}, "fertility": {}, "birth": {}, "bases": {},
    }
    for country in countries:
        for metric, payload, source, key in [
            ("population", population, "world-bank", "population"),
            ("mortality", health, "health", "mortality"),
            ("fertility", health, "health", "fertility"),
            ("birth", birth, "world-bank", "birth_rate"),
        ]:
            record = metric_value_for(payload, current_aliases(country, source), key)
            metric_values[metric][country] = record[1] if record else None
        row = context["locales"].get(country) or context["regional_context"][0]
        metric_values["bases"][country] = base_levels[row["status"]]
    maxima = {key: max((value for value in values.values() if value is not None), default=1) for key, values in metric_values.items() if key != "bases"}
    colors = {"conflict": OXBLOOD, "population": MANILA, "mortality": (39, 56, 73), "fertility": (75, 48, 69), "birth": OLIVE, "bases": (210, 210, 210)}
    metrics = list(colors)
    codes = {"Bahrain":"BHR", "Iran":"IRN", "Iraq":"IRQ", "Israel":"ISR", "Jordan":"JOR", "Kuwait":"KWT", "Lebanon":"LBN", "Oman":"OMN", "Qatar":"QAT", "Saudi Arabia":"SAU", "Sri Lanka":"LKA", "Syria":"SYR", "United Arab Emirates":"UAE"}
    west, east, south, north = spec["map_bounds"]
    plane_x, plane_y, plane_w, plane_h = 15, 66, 205, 105
    pdf.set_fill_color(*OCEAN); pdf.rect(plane_x, plane_y, plane_w, plane_h, "F")
    pdf.set_draw_color(126, 111, 55); pdf.set_line_width(0.22)
    def clipped_grid_line(intercept, slope):
        points = []
        for x in (0, plane_w):
            y = intercept + slope * x
            if 0 <= y <= plane_h:
                points.append((x, y))
        for y in (0, plane_h):
            x = (y - intercept) / slope
            if 0 <= x <= plane_w:
                points.append((x, y))
        if len(points) >= 2:
            pdf.line(plane_x + points[0][0], plane_y + points[0][1], plane_x + points[1][0], plane_y + points[1][1])
    for intercept in range(-45, int(plane_h + 46), 9):
        clipped_grid_line(intercept, 44 / plane_w)
        clipped_grid_line(intercept, -44 / plane_w)

    # Presentation offsets keep adjacent Gulf stacks readable while preserving
    # the broad west/east and north/south order of the observed field.
    layout = {
        "Syria": (74, 27), "Lebanon": (42, 39), "Israel": (32, 61),
        "Jordan": (65, 62), "Iraq": (102, 43), "Iran": (149, 30),
        "Kuwait": (119, 66), "Saudi Arabia": (88, 89),
        "Bahrain": (146, 79), "Qatar": (123, 93),
        "United Arab Emirates": (163, 94), "Oman": (191, 78),
        "Sri Lanka": (192, 96),
    }
    for country in sorted(countries, key=lambda name: centroids.get(name, (0, 0))[1], reverse=True):
        if country not in centroids: continue
        dx, dy = layout[country]
        px, py = plane_x + dx, plane_y + dy
        for metric_index, metric in enumerate(metrics):
            value = metric_values[metric].get(country)
            if value is None or value <= 0: continue
            blocks = int(value) if metric == "bases" else max(1, math.ceil(math.sqrt(value / maxima[metric]) * 6))
            bx = px + (metric_index - 2.5) * 2.1
            outline = metric == "bases" and country in context["former_only"]
            for block in range(blocks):
                iso_block(pdf, bx, py - block * 2.25, 1.25, colors[metric], outline=outline)
        pdf.set_xy(px - 6, py + 3); pdf.set_font("Helvetica", "B", 5.4); pdf.set_text_color(*PAPER); pdf.cell(12, 3, codes[country], align="C")
    pdf.set_xy(226, 64); pdf.set_font("Helvetica", "B", 7.2); pdf.set_text_color(*INK); pdf.cell(55, 4, "STACK KEY")
    legend = [("Conflict observations", "conflict"), ("Population", "population"), ("Mortality", "mortality"), ("Fertility", "fertility"), ("Crude birth rate", "birth"), ("U.S. basing context", "bases")]
    for index, (label, metric) in enumerate(legend):
        y = 74 + index * 12
        iso_block(pdf, 226, y + 2, 2, colors[metric], outline=metric == "bases")
        pdf.set_xy(232, y); pdf.set_font("Helvetica", "B" if metric == "bases" else "", 6.7); pdf.set_text_color(*INK); pdf.cell(49, 4, label)
    pdf.label(226, 150, "Basing stack")
    pdf.copy(226, 157, 57, "Relative relationship class only. White outline marks former-only footprint. No printed number is implied.", 6.7, MUTED, 3.8)
    pdf.set_fill_color(*SURFACE); pdf.rect(15, 177, 205, 18, "F")
    pdf.set_xy(20, 181); pdf.set_font("Helvetica", "", 7); pdf.set_text_color(*INK)
    pdf.multi_cell(195, 4, "Independent scales preserve visual comparison without adding unlike measures. Close locales are offset for legibility. QAT is strategic context outside the 12 UCDP event locales; its conflict stack is absent.")
    pdf.copy(226, 181, 57, "Source years remain those printed on the following precise comparison page.", 6.5, MUTED, 3.7)


def add_current_life_death(pdf: AtlasPDF, spec: dict, events: list[dict], health: dict, birth: dict, population: dict):
    pdf.section_page("Life and death", "Conflict period / latest available context", "The war inside unequal living fields", "Conflict values count candidate observations geocoded to each state during the observed interval. Population-health sources end before 2026, so their latest observations are shown with their actual years rather than projected into the conflict date.")
    totals = event_totals(events)
    countries = [row["name"] for row in spec["states"]]
    columns = [14, 105, 196]
    for x, country in zip(columns, countries):
        pdf.set_xy(x, 61); pdf.set_font("Helvetica", "B", 8.5); pdf.set_text_color(*(OXBLOOD if country == "Iran" else SLATE)); pdf.cell(87, 5, latin(country.upper()), align="C")
    metrics = []
    metrics.append(("Geocoded candidate observations", "28 Feb-30 Jul 2026", OXBLOOD, {country: (2026, float(totals.get(country, {}).get("events", 0))) for country in countries}))
    metrics.append(("Population", "latest source observation", MANILA, {country: metric_value_for(population, current_aliases(country, "world-bank"), "population") for country in countries}))
    metrics.append(("All-cause mortality", "deaths per 100,000", (39, 56, 73), {country: metric_value_for(health, current_aliases(country, "health"), "mortality") for country in countries}))
    metrics.append(("Total fertility", "births per woman", (75, 48, 69), {country: metric_value_for(health, current_aliases(country, "health"), "fertility") for country in countries}))
    metrics.append(("Crude birth rate", "live births per 1,000", OLIVE, {country: metric_value_for(birth, current_aliases(country, "world-bank"), "birth_rate") for country in countries}))
    for row_index, (label, unit, color, values) in enumerate(metrics):
        y = 72 + row_index * 20
        available = [record[1] for record in values.values() if record]
        maximum = max(available) if available else 1
        pdf.set_xy(14, y); pdf.set_font("Helvetica", "B", 7.5); pdf.set_text_color(*INK); pdf.cell(269, 4, latin(label.upper()), align="C")
        pdf.set_xy(14, y + 4); pdf.set_font("Helvetica", "", 6.3); pdf.set_text_color(*MUTED); pdf.cell(269, 3.5, latin(unit), align="C")
        for x, country in zip(columns, countries):
            record = values[country]
            pdf.set_fill_color(*SURFACE); pdf.rect(x + 4, y + 9, 79, 5, "F")
            if record:
                year, value = record; pdf.set_fill_color(*color); pdf.rect(x + 4, y + 9, 79 * value / maximum, 5, "F")
                value_text = f"{value:,.2f}".rstrip("0").rstrip(".")
                pdf.set_xy(x + 4, y + 14); pdf.set_font("Helvetica", "B", 6.8); pdf.set_text_color(*color); pdf.cell(79, 4, f"{value_text}  /  {year}", align="R")
            else:
                pdf.set_xy(x + 4, y + 14); pdf.set_font("Helvetica", "", 6.8); pdf.set_text_color(*MUTED); pdf.cell(79, 4, "NO LOADED OBSERVATION", align="R")
    pdf.label(14, 178, "Do not merge the scales")
    pdf.copy(14, 185, 269, "Candidate observations can overlap and are not added into casualty totals. Population is a count; mortality is a rate; fertility and crude birth rate are distinct birth measures. Bar length compares countries within one row only.", 8.2, MUTED, 4.6)


def add_current_nation(pdf: AtlasPDF, state: dict, events: list[dict], health: dict, birth: dict, population: dict, conditions: list[dict]):
    country, side = state["name"], state["side"]
    color = OXBLOOD if side == "A" else SLATE
    local = [event for event in events if event.get("network_location") == country]
    pdf.section_page("Nation field", f"UCDP side {side}", country, "Party role, event-location exposure, and population-health context remain separate. Event counts below mean records geocoded to this state, not a complete measure of attacks conducted, forces deployed, or national deaths.")
    pdf.set_fill_color(*color); pdf.rect(14, 59, 82, 39, "F")
    pdf.set_xy(20, 66); pdf.set_font("Helvetica", "B", 8); pdf.set_text_color(*PAPER); pdf.cell(0, 5, f"SIDE {side} / CANDIDATE LAYER")
    pdf.set_xy(20, 77); pdf.set_font("Times", "B", 16); pdf.cell(68, 8, f"{len(local)} observations")
    latest = next((row for row in reversed(conditions) if row["country"] == country), None)
    regime = latest["regime"]["name"] if latest else "No loaded V-Dem state row"
    regime_year = latest["year"] if latest else "-"
    pdf.label(105, 64, f"V-Dem {regime_year}")
    pdf.copy(105, 72, 78, regime, 9, INK, 5.2)
    pdf.label(197, 64, "Event-location boundary")
    pdf.copy(197, 72, 84, "No event location in the loaded interval." if not local else f"{len(local)} candidate observations are coded to this territory. Casualty totals are not computed because records may overlap.", 8.7, INK, 5)
    line_chart(pdf, 14, 111, 64, 70, current_series(health, country, "health", "mortality", 2010, 2023), "All-cause mortality", "per 100k", OCEAN)
    line_chart(pdf, 83, 111, 64, 70, current_series(health, country, "health", "fertility", 2010, 2023), "Total fertility", "births/woman", (75, 48, 69))
    line_chart(pdf, 152, 111, 64, 70, current_series(birth, country, "world-bank", "birth_rate", 2010, 2025), "Crude birth rate", "per 1,000", OLIVE)
    line_chart(pdf, 221, 111, 62, 70, current_series(population, country, "world-bank", "population", 2010, 2025), "Population", "people", CLAY)


def add_current_timeline(pdf: AtlasPDF, events: list[dict]):
    pdf.section_page("Temporal field", "Event sequence by locale", "The regional surface appears immediately", "Every equal-area mark is one candidate observation positioned by start date and grouped vertically by recorded locale. Blank periods remain blank.")
    totals = event_totals(events); ordered = sorted(totals, key=lambda name: (-totals[name]["events"], name))
    start = date.fromisoformat(min(event["date_start"] for event in events)); end = date.fromisoformat(max(event["date_start"] for event in events)); span = max(1, (end - start).days)
    x0, width = 72, 204
    for index, name in enumerate(ordered):
        y = 64 + index * 9.2
        pdf.set_xy(14, y - 2); size = fitted_text(pdf, name, 51, 7.2, 5.8); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(52, 4, latin(name), align="R")
        pdf.set_draw_color(204, 201, 186); pdf.set_line_width(0.25); pdf.line(x0, y, x0 + width, y)
        for event in (row for row in events if (row.get("network_location") or row["country"]) == name):
            px = x0 + (date.fromisoformat(event["date_start"]) - start).days / span * width
            radius = 0.9
            pdf.set_fill_color(*(OXBLOOD if name == "Iran" else CLAY)); pdf.ellipse(px - radius, y - radius, radius * 2, radius * 2, "F")
    for month in range(3, 8):
        point = date(2026, month, 1); px = x0 + (point - start).days / span * width
        pdf.set_xy(px - 10, 181); pdf.set_font("Helvetica", "B", 6.5); pdf.set_text_color(*MUTED); pdf.cell(20, 4, point.strftime("%b").upper(), align="C")
    pdf.label(14, 190, "Interpretive frontier")
    pdf.copy(14, 196, 269, "Temporal sequence can test retaliation and escalation accounts, but direction must be read from event-level actor and source records rather than inferred from locale alone.", 7.5, MUTED, 4)


def add_current_network_page(pdf: AtlasPDF, spec: dict, events: list[dict], conflict: dict):
    pdf.section_page("Conflict network", "Website topology / print field", "Parties, vulnerability field, locales, events", "The formal dyad remains at the core. GCC countries are rendered as a distributed vulnerability field, not as members of either side. Every candidate observation remains connected to its recorded territorial or maritime locale with equal node area.")
    result = draw_current_network(pdf, spec, events, conflict, 14, 57, 269, 129)
    pdf.label(14, 188, "Edge semantics")
    pdf.copy(14, 194, 269, "Party-to-locale lines retain the website relation: a side participant belongs to the dyad in which an event is recorded at that locale. They do not assert that every party acted at every location.", 7.5, MUTED, 4)
    return result


def add_current_network_analysis(pdf: AtlasPDF, nodes: list[list], edges: list[list], adjacency: dict, between: dict, events: list[dict]):
    labels = {node[0]: node[1] for node in nodes}; kinds = {node[0]: node[2] for node in nodes}
    structural = [node for node in adjacency if kinds[node] != "observation"]
    ranked_degree = sorted(structural, key=lambda node: (-len(adjacency[node]), labels[node]))[:10]
    ranked_between = sorted(structural, key=lambda node: (-between[node], labels[node]))[:10]
    n = len(nodes); unique_edges = len(edges); density = (2 * unique_edges / (n * (n - 1))) if n > 1 else 0
    pdf.section_page("Conflict network", "Barabasi diagnostics", "Degree, betweenness, and proportional structure", "Topology is calculated on the complete print graph, including all candidate-event leaves. Degree counts direct relations; normalized betweenness measures shortest-path brokerage. Neither statistic is replaced by a narrative assignment.")
    pdf.label(14, 62, "Highest structural degree", SLATE); pdf.label(178, 62, "Highest normalized betweenness", ORANGE)
    max_degree = max(len(adjacency[node]) for node in ranked_degree); max_between = max(between[node] for node in ranked_between) or 1
    for index, node in enumerate(ranked_degree):
        y = 72 + index * 9.2; value = len(adjacency[node])
        pdf.set_xy(14, y); size = fitted_text(pdf, labels[node], 49, 7.2, 5.2); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(49, 5, latin(labels[node]))
        pdf.set_fill_color(*SLATE); pdf.rect(65, y, 91 * value / max_degree, 5, "F"); pdf.set_xy(157, y); pdf.set_font("Helvetica", "B", 7); pdf.cell(13, 5, str(value), align="R")
    for index, node in enumerate(ranked_between):
        y = 72 + index * 9.2; value = between[node]
        pdf.set_xy(178, y); size = fitted_text(pdf, labels[node], 43, 7.2, 5.2); pdf.set_font("Helvetica", "", size); pdf.set_text_color(*INK); pdf.cell(43, 5, latin(labels[node]))
        pdf.set_fill_color(*ORANGE); pdf.rect(224, y, 44 * value / max_between, 5, "F"); pdf.set_xy(269, y); pdf.set_font("Helvetica", "B", 7); pdf.cell(14, 5, f"{value:.3f}", align="R")
    distribution = Counter(map(len, adjacency.values()))
    pdf.label(14, 168, "Complete graph")
    pdf.copy(14, 175, 269, f"{n} nodes / {unique_edges} edges / density {density:.4f}. Degree distribution: " + " / ".join(f"{degree}:{count}" for degree, count in sorted(distribution.items())), 7.2, MUTED, 4)
    pdf.copy(14, 188, 269, "Node size in the network: locale nodes follow observation count; observation nodes have equal area; other structural nodes follow degree. Casualty estimates remain inspectable on individual source records and are not aggregated.", 7.7, MUTED, 4.2)


def add_current_sources(pdf: AtlasPDF, spec: dict, events: list[dict]):
    pdf.section_page("Documentation", "Provenance and open frontier", "Sources / snapshots / limits", "This proof is generated from repository data. The conflict is current, but the print record is only current through its stated UCDP candidate-event boundary.")
    sources = list(spec["sources"].items())
    for index, (key, source) in enumerate(sources):
        column, row = index // 4, index % 4
        x, y = 14 + column * 136, 62 + row * 13
        domain = urlparse(source["url"]).netloc.removeprefix("www.")
        pdf.set_xy(x, y); pdf.set_font("Helvetica", "B", 7); pdf.set_text_color(*INK); pdf.cell(35, 4, latin(key.upper()))
        title = source["title"]
        size = fitted_text(pdf, title, 96, 6.5, 5.2); pdf.set_xy(x + 36, y); pdf.set_font("Helvetica", "", size); pdf.cell(96, 4, latin(title))
        pdf.set_xy(x + 36, y + 4); pdf.set_font("Helvetica", "", 5.8); pdf.set_text_color(*CLAY); pdf.cell(96, 3.5, latin(domain), link=source["url"])
    statuses = Counter(event["code_status"] for event in events); snapshots = Counter(event["source_id"] for event in events)
    pdf.label(14, 118, "Loaded candidate layer")
    pdf.copy(14, 126, 269, f"{len(events)} unique candidate observations / 28 February-30 July 2026 / no derived casualty total. Candidate records may overlap. Source snapshots: " + "; ".join(f"{key}: {value}" for key, value in sorted(snapshots.items())) + ". Coding status: " + "; ".join(f"{key}: {value}" for key, value in sorted(statuses.items())) + ".", 8.5, INK, 5)
    pdf.label(14, 153, "Revision path")
    pdf.copy(14, 161, 269, "Regenerate when a new candidate snapshot is deposited. Preserve event IDs, compare revisions, and update the observation boundary. Do not silently carry July values to the publication date or convert candidate coding into a final historical record.", 8.8, MUTED, 5.1)
    pdf.set_fill_color(*INK); pdf.rect(14, 184, 269, 12, "F")
    pdf.set_xy(19, 187); pdf.set_font("Helvetica", "", 7.7); pdf.set_text_color(*PAPER)
    pdf.cell(0, 5, "GENERATED FROM UCDP CANDIDATE EVENTS, V-DEM, IHME, WORLD BANK / UN, AND NATURAL EARTH")


def generate(key: str) -> Path:
    specs = json.loads(SPECS.read_text(encoding="utf-8"))
    if key not in specs:
        raise SystemExit(f"Unknown print War Map: {key}")
    spec = specs[key]
    atlas = build()
    conflict = next(item for item in atlas["conflicts"] if item["id"] == spec["conflict_id"])
    health = read_js(ROOT / "web/life-death-data.js", "window.LIFE_DEATH_METRICS=")
    birth = read_js(ROOT / "web/crude-birth-rate-data.js", "window.CRUDE_BIRTH_RATE_DATA=")
    population = read_js(ROOT / "web/population-data.js", "window.POPULATION_DATA=")
    pdf = AtlasPDF(orientation="L", unit="mm", format="A4")
    pdf.set_margins(14, 16, 14)
    pdf.set_auto_page_break(False)
    pdf.set_title(latin(spec["title"]))
    pdf.set_author("The War Maps Project / Sid J.A. Hubbard")
    pdf.set_subject(latin(f"War Map focal interval {spec['window_start']} through {spec['window_end']}"))
    if spec.get("template") == "current-regional":
        events = [
            event for event in atlas["events"]
            if event["conflict_id"] == spec["conflict_id"]
            and event["date_start"] <= spec["window_end"]
            and event["date_end"] >= spec["window_start"]
        ]
        pdf.footer_text = "IRAN REGIONAL FIELD  |  OBSERVED 28 FEB-30 JUL 2026  |  UCDP CANDIDATE"
        add_current_cover(pdf, spec, events)
        add_current_principle(pdf, spec)
        add_current_range(pdf, events)
        add_current_map(pdf, spec, events)
        add_locale_proportions(pdf, events)
        add_current_isometric_life_death(pdf, spec, events, health, birth, population)
        add_current_life_death(pdf, spec, events, health, birth, population)
        for state in spec["states"]:
            add_current_nation(pdf, state, events, health, birth, population, atlas["state_conditions"])
        add_current_timeline(pdf, events)
        nodes, edges, adjacency, between = add_current_network_page(pdf, spec, events, conflict)
        add_current_network_analysis(pdf, nodes, edges, adjacency, between, events)
        add_current_sources(pdf, spec, events)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        path = OUTPUT / f"war-map-{key}-proof.pdf"
        pdf.output(path)
        return path
    pdf.footer_text = "FALKLANDS / MALVINAS  |  FOCAL FIELD 18 MAY-13 JUNE 1982"
    add_cover(pdf, spec)
    add_principle(pdf, spec)
    add_range(pdf, spec)
    add_field(pdf, spec)
    add_losses(pdf, spec)
    add_life_death(pdf, spec, conflict, health, birth, population)
    add_nation(pdf, "Argentina", "A", conflict, health, birth, population, atlas["state_conditions"])
    add_nation(pdf, "United Kingdom", "B", conflict, health, birth, population, atlas["state_conditions"])
    add_demography(pdf, spec, health, birth)
    add_events(pdf, spec)
    adjacency, between = add_network(pdf, spec)
    add_network_analysis(pdf, spec, adjacency, between)
    add_sources(pdf, spec)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / f"war-map-{key}-prototype.pdf"
    pdf.output(path)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", default="falklands-1982", choices=sorted(json.loads(SPECS.read_text(encoding="utf-8")).keys()))
    args = parser.parse_args()
    print(generate(args.map))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
