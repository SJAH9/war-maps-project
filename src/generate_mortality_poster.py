"""One filled vector dot per reported death; no inferred status."""
from __future__ import annotations

import json
import math

from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.conflict_networks import ROOT, active_in, event_rows
from src.generate_network_print import fonts, frame, text, para, INK, MUTED, ORANGE

COLORS = {"civilian": "#b33230", "warfighter": "#386578", "unknown": "#8c8170"}
CODEBOOK = "https://ucdp.uu.se/downloads/candidateged/ucdp-candidate-codebook1.4.pdf"


def summarize(rows, year=2026):
    result = dict(year=year, total=0, civilian=0, warfighter=0, unknown=0,
                  events=[], sources=set(), dates=[])
    seen = set()
    for row in rows:
        if not active_in(row, year):
            continue
        if row["id"] in seen:
            raise ValueError("Duplicate event ID; use revision-reconciled event_rows")
        seen.add(row["id"])
        start, end = row["date_start"][:10], row["date_end"][:10]
        if start[:4] != str(year) or end[:4] != str(year):
            raise ValueError("Cross-year event cannot be wholly assigned to one mortality year")
        values = {}
        for field in ("best", "deaths_civilians", "deaths_a", "deaths_b", "deaths_unknown"):
            # Blank is not zero. Invalid totals must not become a pictogram.
            values[field] = int(row[field])
            if values[field] < 0:
                raise ValueError("Negative fatality estimate")
        if values["best"] != sum(values[k] for k in values if k != "best"):
            raise ValueError(f"Fatality categories do not reconcile for event {row['id']}")
        result["total"] += values["best"]
        result["civilian"] += values["deaths_civilians"]
        result["warfighter"] += values["deaths_a"] + values["deaths_b"]
        result["unknown"] += values["deaths_unknown"]
        result["events"].append(row["id"])
        result["sources"].add(row["_source"])
        result["dates"].extend((start, end))
    if not result["events"]:
        raise ValueError("No records for requested year")
    result["from"], result["through"] = min(result["dates"]), max(result.pop("dates"))
    result["sources"] = sorted(result["sources"])
    result["events"] = sorted(result["events"])
    result["codebook"] = (CODEBOOK if any("candidate" in s for s in result["sources"])
                          else "https://ucdp.uu.se/downloads/ged/ged261.pdf")
    result["interpretation"] = (
        "Sum of best estimates in latest-ID-reconciled observations, not verified unique people. "
        "Warfighter shorthand denotes deaths_a + deaths_b, not independently verified individual status. "
        "Unknown remains separate; civilian is a subset of total. Injuries are not included.")
    return result


def draw_dots(c, counts, x=48, top=1250, width=1200, height=960, capacity=None):
    total = sum(counts.values())
    if total == 0:
        return 0
    # Adapt to source growth while retaining one distinct vector mark per count.
    capacity = max(total, capacity or total)
    columns = max(1, math.ceil(math.sqrt(capacity*width/height)))
    rows = math.ceil(capacity/columns)
    pitch = min(width/columns, height/rows)
    # Diameter is 32% of spacing, leaving a clear gap even in dense regions.
    radius = pitch*.16
    offset = 0
    for category, count in counts.items():
        c.setFillColor(HexColor(COLORS[category]))
        path = c.beginPath()
        for index in range(offset, offset+count):
            row, col = divmod(index, columns)
            px, py = x+(col+.5)*pitch, top-(row+.5)*pitch
            path.circle(px,py,radius)
        c.drawPath(path,fill=1,stroke=0)
        offset += count
    return offset


def render(summary, out, capacity):
    out = out or ROOT/"outputs/print"
    out.mkdir(parents=True,exist_ok=True)
    year = summary["year"]
    fonts()
    path = out/f"war-maps-mortality-{year}.pdf"
    c = canvas.Canvas(str(path),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle(f"War Maps | {year} Reported Deaths | One Dot per Death")
    frame(c,1296,1728,1,"WAR MAPS / THE HUMAN COST / 18 x 24 IN")
    text(c,f"{year} / THE HUMAN COST",48,1638,19,ORANGE,True)
    text(c,"REPORTED FATAL CASUALTIES",48,1578,18,INK,True)
    text(c,f"{summary['total']:,}",43,1485,100,INK,True)
    candidate = any("candidate" in source for source in summary["sources"])
    coverage = ("January-August releases | Provisional, partial year" if candidate
                else "January-December | Reviewed GED 26.1 | Full calendar year")
    text(c,f"Deaths only | {coverage}",
         48,1450,14,MUTED)
    text(c,f"{summary['civilian']:,}",46,1356,70,HexColor(COLORS["civilian"]),True)
    text(c,"CIVILIAN DEATHS",355,1395,20,HexColor(COLORS["civilian"]),True)
    text(c,"Included in the total above, not additional deaths.",355,1367,13,MUTED)
    text(c,"ONE DOT = ONE REPORTED DEATH",48,1309,14,INK,True)
    for x,category,label in ((48,"civilian","Civilians"),(430,"warfighter","Warfighters / coded sides"),
                             (900,"unknown","Unknown status")):
        text(c,f"{label}: {summary[category]:,}",x,1280,13,HexColor(COLORS[category]),True)
    counts = {k:summary[k] for k in COLORS}
    drawn = draw_dots(c,counts,capacity=capacity)
    assert drawn == summary["total"]
    summary["dots_drawn"] = drawn
    summary["mark"] = "filled vector circle; diameter 32% of grid spacing"
    summary["shared_grid_capacity"] = capacity
    text(c,"EVERY MARK COUNTS. UNKNOWN DOES NOT MEAN COMBATANT.",48,245,15,INK,True)
    para(c,"Read left to right, top to bottom: civilian deaths in red, deaths attributed to the fighting "
         "sides in blue, then unknown status in grey-brown. Each dot represents one unit in "
         "the reported best estimates, not an identified individual. No scaling, rounding or sampling is used. "
         "The civilian count is a subset of the total; deaths are represented only once. "
         "The 2024, 2025 and 2026 posters share an identical dot scale; unused grid space is intentional.",
         48,219,1200,12)
    source_label = ("UCDP candidate observations, January-August releases" if candidate else
                    "UCDP reviewed GED 26.1")
    source_note = (f"Candidate reports remain provisional; distinct observations may overlap. "
                   f"Recorded date intervals extend through {summary['through']}. "
                   "This partial-year sum is not directly comparable to a full calendar year."
                   if candidate else
                   "These are full-year sums of reviewed event estimates, not a census of identified individuals. "
                   "Compare with caution: the 2026 poster covers only the loaded partial-year candidate releases.")
    para(c,f"Source: {source_label}; {len(summary['events']):,} distinct event IDs. "
         "Newer revisions replace matching IDs. Total = deaths_a + deaths_b + deaths_civilians + deaths_unknown. "
         "'Warfighters' is shorthand for source-coded side A/B deaths, not independently verified individual status. "
         + source_note + " Injuries and indirect deaths outside the source's scope are not counted.",
         48,135,1200,10)
    para(c,"Attribution: Uppsala Conflict Data Program (CC BY 4.0); Sundberg & Melander (2013). "
         "Definitions: "+summary["codebook"]+
         f". Exact totals, included event IDs and source releases accompany this PDF in war-maps-mortality-{year}.json.",
         48,66,1200,8)
    c.showPage(); c.save()
    (out/f"war-maps-mortality-{year}.json").write_text(
        json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{path}: {drawn:,} dots; {summary['civilian']:,} civilian deaths",flush=True)


def generate(out=None):
    # Stream the archive to bound memory. Shared scale is recomputed for the set.
    summaries = [summarize(event_rows(), year) for year in (2024,2025,2026)]
    capacity = max(s["total"] for s in summaries)
    for summary in summaries:
        render(summary,out,capacity)


if __name__ == "__main__":
    generate()
