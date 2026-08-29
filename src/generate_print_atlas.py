#!/usr/bin/env python3
"""Generate self-configuring compact or archival War Maps volumes."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from fpdf import FPDF

from src.build_atlas import ROOT, build

GEOMETRY = ROOT / "data/raw/ne_110m_admin_0_countries.geojson"
OUTPUT = ROOT / "outputs/print"
SIZES = {"brief", "standard", "archive"}


def latin(value: object) -> str:
    return str(value).encode("latin-1", "replace").decode("latin-1")


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def departure_text(enclosure: dict) -> str:
    value = enclosure.get("departure", {})
    return value.get("statement", "") if isinstance(value, dict) else str(value)


class WarPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(44, 47, 44)
        self.cell(0, 6, "THE WAR MAPS PROJECT", border="B")
        self.ln(10)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(100, 104, 99)
        self.cell(0, 5, f"Uppsala + V-Dem + prompted NCM projection   |   {self.page_no()}", align="C")

    def section(self, title: str, kicker: str = ""):
        if kicker:
            self.set_font("Helvetica", "B", 7)
            self.set_text_color(180, 35, 47)
            self.cell(0, 5, latin(kicker.upper()))
            self.ln(6)
        self.set_font("Times", "B", 24)
        self.set_text_color(24, 26, 24)
        self.multi_cell(0, 10, latin(title))
        self.ln(3)

    def paragraph(self, text: str, size: int = 9):
        self.set_font("Helvetica", "", size)
        self.set_text_color(50, 53, 50)
        self.multi_cell(0, 5, latin(text))
        self.ln(2)


def project(lon: float, lat: float, x: float, y: float, w: float, h: float) -> tuple[float, float]:
    return x + (lon + 180) / 360 * w, y + (90 - lat) / 180 * h


def draw_geometry(pdf: WarPDF, conflict: dict, events: list[dict], x: float, y: float, w: float, h: float):
    geometry = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    highlighted = set(conflict["plot_locations"])
    aliases = {"United States of America": "United States of America", "Russia": "Russia"}
    pdf.set_fill_color(237, 239, 234)
    pdf.rect(x, y, w, h, "F")
    for lon in range(-120, 180, 60):
        px, _ = project(lon, 0, x, y, w, h)
        pdf.set_draw_color(212, 214, 207)
        pdf.line(px, y, px, y + h)
    for lat in (-60, -30, 0, 30, 60):
        _, py = project(0, lat, x, y, w, h)
        pdf.line(x, py, x + w, py)
    for feature in geometry["features"]:
        name = feature.get("properties", {}).get("ADMIN", "")
        shape = feature.get("geometry") or {}
        polygons = shape.get("coordinates", [])
        if shape.get("type") == "Polygon":
            polygons = [polygons]
        pdf.set_fill_color(*(180, 35, 47) if aliases.get(name, name) in highlighted else (199, 202, 194))
        pdf.set_draw_color(246, 245, 239)
        for polygon in polygons:
            if not polygon:
                continue
            ring = polygon[0]
            points = [project(float(point[0]), float(point[1]), x, y, w, h) for point in ring]
            if len(points) > 2:
                pdf.polygon(points, style="DF")
    pdf.set_fill_color(20, 133, 126)
    for event in events:
        if event["longitude"] is None or event["latitude"] is None:
            continue
        px, py = project(event["longitude"], event["latitude"], x, y, w, h)
        pdf.ellipse(px - 1.2, py - 1.2, 2.4, 2.4, "F")


def matching_conditions(data: dict, conflict: dict) -> list[dict]:
    aliases = {"Iran": "Iran", "Israel": "Israel", "United States of America": "United States of America", "Russia (Soviet Union)": "Russia", "Cambodia (Kampuchea)": "Cambodia", "DR Congo (Zaire)": "Democratic Republic of the Congo"}
    year = min(conflict["last_active_year"], 2024)
    wanted = {aliases.get(name, name) for name in conflict["locations"]}
    return [item for item in data["state_conditions"] if item["year"] == year and item["country"] in wanted]


def add_cover(pdf: WarPDF, conflict: dict, events: list[dict], size: str):
    pdf.add_page()
    pdf.set_fill_color(25, 27, 25)
    pdf.rect(0, 0, 210, 72, "F")
    pdf.set_xy(16, 15)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(238, 180, 88)
    pdf.cell(0, 6, "THE WAR MAPS PROJECT")
    pdf.set_xy(16, 27)
    pdf.set_font("Times", "B", 28)
    pdf.set_text_color(248, 247, 240)
    pdf.multi_cell(178, 11, latin(conflict["title"]))
    pdf.set_xy(16, 61)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(0, 5, latin(f"{size.upper()} VOLUME  |  {conflict['first_active_year']}-{conflict['last_active_year']}  |  {conflict['source_id']}"))
    draw_geometry(pdf, conflict, events, 12, 82, 186, 93)
    pdf.set_xy(16, 184)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(24, 26, 24)
    pdf.cell(0, 6, latin(f"{len(conflict['years_active'])} conflict-years   {len(events)} candidate events   {conflict['type']}"))
    pdf.set_xy(16, 197)
    pdf.set_font("Times", "", 14)
    pdf.multi_cell(178, 7, latin("A map of observations and causal enclosures. It does not require symmetry among parties and does not assign truth flags."))
    pdf.set_xy(16, 240)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(180, 35, 47)
    pdf.cell(0, 5, "CURRENT FINAL FRONTIER")
    pdf.set_xy(16, 247)
    pdf.set_font("Helvetica", "", 9)
    frontier = conflict["enclosure"]["frontier_questions"][0]
    pdf.multi_cell(178, 5, latin(frontier))


def add_record(pdf: WarPDF, conflict: dict, rows: list[dict]):
    pdf.add_page()
    pdf.section("Conflict record", "Observed field")
    pdf.paragraph(f"Outer enclosure: {departure_text(conflict['enclosure']['outer'])}")
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(35, 6, "SIDE A")
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(150, 6, latin("; ".join(conflict["parties_a"])))
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(35, 6, "SIDE B")
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(150, 6, latin("; ".join(conflict["parties_b"])))
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(35, 6, "WAR PARTNERS")
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(150, 6, latin("; ".join(conflict["secondary_parties"]) or "No secondary party is encoded in this conflict record."))
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(22, 6, "YEAR")
    pdf.cell(22, 6, "INTENSITY")
    pdf.cell(72, 6, "SIDE A")
    pdf.cell(72, 6, "SIDE B")
    pdf.ln(6)
    for row in rows[-30:]:
        pdf.set_font("Helvetica", "", 7)
        pdf.cell(22, 5, str(row["year"]))
        pdf.cell(22, 5, str(row["intensity"]))
        pdf.cell(72, 5, latin(row["side_a"][:42]))
        pdf.cell(72, 5, latin(row["side_b"][:42]))
        pdf.ln(5)


def add_economy(pdf: WarPDF, data: dict, conflict: dict):
    pdf.add_page()
    pdf.section("Atlas of War Economies", "Prompted causal projection")
    pdf.paragraph("This page does not import an outside economic or trade stream. It opens the war economy from Uppsala participation and V-Dem state conditions, then carries the user's question inward toward decision makers, durable beneficiaries, partners, and trade relations.")
    for item in matching_conditions(data, conflict):
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(23, 124, 120)
        pdf.cell(0, 7, latin(f"{item['country']} | V-Dem {item['year']}"))
        pdf.ln(8)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(45, 48, 45)
        for key, value in item["conditions"].items():
            pdf.cell(38, 5, latin(key))
            pdf.cell(20, 5, "NA" if value is None else f"{value:.2f}")
            pdf.ln(5)
        pdf.ln(3)
    projection = data["prompted_projections"][0]["enclosure"]
    pdf.set_y(max(pdf.get_y(), 185))
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(180, 35, 47)
    pdf.cell(0, 6, "TRADE AND BENEFIT PROJECTION")
    pdf.ln(8)
    pdf.paragraph(departure_text(projection))
    for question in projection["frontier_questions"]:
        pdf.set_font("Helvetica", "", 8)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 5, latin(f"[ ] {question}"))


def add_enclosure(pdf: WarPDF, data: dict, conflict: dict):
    pdf.add_page()
    pdf.section("Causal flow", "Outer enclosure inward")
    enclosure = conflict["enclosure"]
    for label, value in (("OUTER E", departure_text(enclosure["outer"])), ("DEPARTURE", departure_text(enclosure)), ("INNER E", departure_text(enclosure["inner"]))):
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(180, 35, 47)
        pdf.cell(0, 5, label)
        pdf.ln(6)
        pdf.paragraph(value, 9)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(189, 120, 32)
    pdf.cell(0, 6, "FINAL FRONTIER")
    pdf.ln(8)
    for question in enclosure["frontier_questions"]:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 6, latin(f"- {question}"))
    claims = [claim for claim in data["claims"] if claim["conflict_id"] in (None, conflict["id"])]
    if claims:
        pdf.ln(8)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(0, 6, "PROMPTS AND CLAIMS AT THIS ADDRESS")
        pdf.ln(8)
        for claim in claims:
            pdf.paragraph(claim["claim"], 8)


def add_projection_branches(pdf: WarPDF, data: dict, conflict: dict):
    branches = [item for item in data["prompted_projections"] if item.get("projection_id") and item.get("conflict_id") == conflict["id"]]
    for branch in branches:
        pdf.add_page()
        pdf.section(branch["branch_class"].replace("_", " ").title(), "War behind the public chronology")
        pdf.paragraph(branch["prompt"], 11)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(180, 35, 47)
        pdf.cell(0, 5, "BRANCH POINT")
        pdf.ln(6)
        pdf.paragraph(branch["branch_point"], 9)
        enclosure = branch["enclosure"]
        for label, node in (("OUTER E / SOURCE CONDITIONS", enclosure["outer"]), ("SPECIFIED DEPARTURE", enclosure), ("INNER E / CONSEQUENCES AND CONSUMER", enclosure["inner"])):
            pdf.set_font("Helvetica", "B", 7)
            pdf.set_text_color(23, 124, 120)
            pdf.cell(0, 5, label)
            pdf.ln(6)
            pdf.paragraph(departure_text(node), 8)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(189, 120, 32)
        pdf.cell(0, 5, "REPEATABLE TRACES AND JOIN ADDRESS")
        pdf.ln(7)
        departure_record = enclosure["departure"]
        pdf.paragraph("Measurements: " + "; ".join(departure_record["measurements"]), 8)
        pdf.paragraph("Join keys: " + "; ".join(departure_record["join_keys"]), 8)
        pdf.paragraph("Participants at this depth: " + "; ".join(branch["participants"]), 8)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(180, 35, 47)
        pdf.cell(0, 5, "NEXT ENCLOSURE QUESTIONS")
        pdf.ln(7)
        for question in enclosure["frontier_questions"]:
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "", 8)
            pdf.multi_cell(0, 5, latin(f"[ ] {question}"))


def add_event_archive(pdf: WarPDF, events: list[dict]):
    for offset in range(0, len(events), 32):
        pdf.add_page()
        pdf.section("Event archive", f"Candidate observations {offset + 1}-{min(offset + 32, len(events))}")
        for event in events[offset:offset + 32]:
            pdf.set_font("Helvetica", "B", 7)
            pdf.cell(24, 5, latin(event["date_start"]))
            pdf.set_font("Helvetica", "", 7)
            pdf.cell(78, 5, latin((event["place"] or event["country"])[:46]))
            pdf.cell(40, 5, latin(event["code_status"][:22]))
            pdf.cell(30, 5, latin(f"fatalities {event['fatalities']['low']}/{event['fatalities']['best']}/{event['fatalities']['high']}"))
            pdf.ln(5)


def generate(conflict_id: str, size: str) -> Path:
    data = build()
    conflict = next((item for item in data["conflicts"] if item["id"] == conflict_id), None)
    if not conflict:
        raise SystemExit(f"Unknown conflict: {conflict_id}")
    rows = [row for row in data["conflict_years"] if row["conflict_id"] == conflict_id]
    events = [event for event in data["events"] if event["conflict_id"] == conflict_id]
    pdf = WarPDF(format="A4")
    pdf.set_auto_page_break(True, margin=16)
    pdf.set_title(latin(f"The War Maps Project: {conflict['title']}"))
    pdf.set_author("The War Maps Project / Sid J.A. Hubbard")
    add_cover(pdf, conflict, events, size)
    add_record(pdf, conflict, rows)
    if size in {"standard", "archive"}:
        add_economy(pdf, data, conflict)
        add_enclosure(pdf, data, conflict)
        add_projection_branches(pdf, data, conflict)
    if size == "archive":
        add_event_archive(pdf, events)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / f"war-maps-{slug(conflict_id)}-{size}.pdf"
    pdf.output(path)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--conflict", default="ucdp-candidate-16905")
    parser.add_argument("--size", choices=sorted(SIZES), default="standard")
    args = parser.parse_args()
    path = generate(args.conflict, args.size)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
