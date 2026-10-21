"""Complete event-incidence posters; no event sampling or synthetic links."""
from __future__ import annotations

import gzip
import json
import math

from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.conflict_networks import ROOT, active_in, event_rows, key
from src.generate_network_print import fonts, frame, text, para, INK, MUTED, ORANGE

RED = "#ba302b"
EVENT = "#7c827b"
SIDE = "#61743d"
NATION = "#378b96"


def mortality(row):
    """Best fatality estimate, never convert missing estimates to zero."""
    try:
        return float(row.get("best", ""))
    except (ValueError, TypeError):
        return None


def compile_events(rows, year=None):
    groups = {}
    for row in rows:
        if year is not None and not active_in(row, year):
            continue
        identity = key(row)
        group = groups.setdefault(identity, {
            "key": list(identity), "title": row.get("conflict_name") or str(identity),
            "events": [], "sides": set(), "nations": set()})
        # Nation is the recorded event country, NOT an inferred actor nationality.
        sides = sorted({row.get(field, "").strip() for field in ("side_a", "side_b")} - {""})
        country = row.get("country", "").strip()
        group["sides"].update(sides)
        if country:
            group["nations"].add(country)
        group["events"].append({
            "id": row["id"], "start": row["date_start"], "end": row.get("date_end"),
            "sides": sides, "nation": country or None,
            "best": mortality(row), "source": row["_source"]})
    for group in groups.values():
        group["sides"] = sorted(group["sides"])
        group["nations"] = sorted(group["nations"])
        group["events"].sort(key=lambda e: (e["start"], e["id"]))
    return sorted(groups.values(), key=lambda g: (-len(g["events"]), g["key"]))


def partition(groups, box):
    """Deterministic balanced spatial partition; every conflict gets a region."""
    if len(groups) == 1:
        return [(groups[0], box)]
    weights = [math.sqrt(len(g["events"])) + 3 for g in groups]
    half = sum(weights) / 2
    running = 0
    cut = 1
    for i, weight in enumerate(weights[:-1], 1):
        running += weight
        cut = i
        if running >= half:
            break
    fraction = sum(weights[:cut]) / sum(weights)
    x, y, w, h = box
    if w >= h:
        boxes = ((x, y, w*fraction, h), (x+w*fraction, y, w*(1-fraction), h))
    else:
        boxes = ((x, y, w, h*fraction), (x, y+h*fraction, w, h*(1-fraction)))
    return partition(groups[:cut], boxes[0]) + partition(groups[cut:], boxes[1])


def draw_cluster(c, group, box, rank, expanded=False):
    x, y, w, h = box
    cx, cy = x+w/2, y+h/2
    radius = max(1, min(w, h)/2-3)
    rx, ry = (max(1,w/2-12),max(1,h/2-12)) if expanded else (radius,radius)
    sides, nations = {}, {}
    for names, positions, offset in ((group["sides"], sides, 0),
                                      (group["nations"], nations, math.pi)):
        for i, name in enumerate(names):
            angle = offset + math.pi*(i+.5)/max(1, len(names))
            positions[name] = (cx+rx*math.cos(angle), cy+ry*math.sin(angle))
    locations = []
    count = len(group["events"])
    for i, event in enumerate(group["events"]):
        angle = i*math.pi*(3-math.sqrt(5))
        r = radius*.82*math.sqrt((i+.5)/count)
        locations.append((cx+r*rx/radius*math.cos(angle), cy+r*ry/radius*math.sin(angle)))
    # Every incidence edge is drawn, including the event-to-conflict relation.
    c.setStrokeColor(HexColor("#b8b5a8"))
    c.setLineWidth(.08)
    c.setStrokeAlpha(.15)
    path = c.beginPath()
    for event, (px, py) in zip(group["events"], locations):
        for qx, qy in [(cx, cy)] + [sides[s] for s in event["sides"]] + (
                [nations[event["nation"]]] if event["nation"] else []):
            path.moveTo(px, py)
            path.lineTo(qx, qy)
    c.drawPath(path)
    c.setStrokeAlpha(1)
    dot = max(.12, min(1.35, radius*.48/math.sqrt(count)))
    # Non-fatal / unknown first, fatal last so mortality remains visible.
    for fatal in (False, True):
        c.setFillColor(HexColor(RED if fatal else EVENT))
        path = c.beginPath()
        for event, (px, py) in zip(group["events"], locations):
            if (event["best"] is not None and event["best"] > 0) == fatal:
                path.circle(px, py, dot)
        c.drawPath(path, fill=1, stroke=0)
    size = min(2, max(.5, radius*.035))
    c.setFillColor(HexColor(SIDE))
    for px, py in sides.values():
        path = c.beginPath()
        path.moveTo(px, py+size); path.lineTo(px-size, py-size)
        path.lineTo(px+size, py-size); path.close()
        c.drawPath(path, fill=1, stroke=0)
    c.setFillColor(HexColor(NATION))
    for px, py in nations.values():
        c.rect(px-size, py-size, size*2, size*2, fill=1, stroke=0)
    c.setFillColor(INK)
    c.circle(cx, cy, size*1.3, fill=1, stroke=0)
    if rank <= 12 and not expanded:
        text(c, f"{rank:02}", x+3, y+h-11, 8, INK, True)


def render(groups, out, scope):
    filename = f"war-maps-event-networks-{scope}"
    total = sum(len(g["events"]) for g in groups)
    fatal = sum(e["best"] is not None and e["best"] > 0 for g in groups for e in g["events"])
    candidate = sum(e["source"].startswith("ucdp-candidate") for g in groups for e in g["events"])
    dates = [e["start"][:10] for g in groups for e in g["events"]]
    c = canvas.Canvas(str(out/(filename+".pdf")), pagesize=(1296,1728),
                      pageCompression=1, invariant=1)
    c.setTitle(f"War Maps | Complete Event Networks | {scope}")
    frame(c,1296,1728,1,"WAR MAPS / COMPLETE EVENT INCIDENCE / 18 x 24 IN")
    text(c,"THE EVENT CONSTELLATION",48,1640,18,ORANGE,True)
    text(c,"2026" if scope=="2026" else "ALL RECORDED YEARS",48,1586,38,INK,True)
    text(c,f"{total:,} EVENTS  /  {len(groups):,} CONFLICTS  /  {fatal:,} FATAL EVENTS",48,1544,18,INK,True)
    text(c,f"{min(dates)} to {max(dates)}  |  {candidate:,} candidate records  |  No event sampling",48,1514,12,MUTED)
    ranks = {tuple(g["key"]): j for j,g in enumerate(groups,1)}
    for g, box in partition(groups,(48,410,1200,1074)):
        # Spatial ordering differs from rank; register numbers follow event count.
        draw_cluster(c,g,box,ranks[tuple(g["key"])])
    text(c,"NODE KEY",48,382,12,ORANGE,True)
    para(c,"Black circle: conflict. Olive triangle: coded side. Teal square: event nation / country. "
         "Red dot: event with best fatality estimate > 0. Grey dot: zero or unknown best estimate. "
         "Thin grey lines connect every event to its conflict, recorded sides and country. "
         "Candidate and reviewed events use the same mortality colors.",48,365,1200,10)
    text(c,"LARGEST CONFLICT NETWORKS / NUMBERED IN THE FIELD",48,308,12,ORANGE,True)
    for i,g in enumerate(groups[:12]):
        col, row = divmod(i,4)
        para(c,f"{i+1:02}  {g['title']} / {len(g['events']):,} events",
             48+col*404,289-row*31,384,9)
    para(c,"READING THE STRUCTURE  Each constellation is a conflict-specific incidence network: repeated events "
         "converge on shared sides and countries. Red concentrations reveal where fatal observations cluster. "
         "Sides and nations are repeated within each conflict, not merged into global actors; countries describe "
         "event locations, not citizenship or belligerency. Area allocation balances event volume and visibility. "
         "Spiral positions order events chronologically; distance is not geography or a measure of causality. "
         "Dense regions require digital zoom; the companion compressed JSON retains every event and link endpoint.",
         48,148,1200,10)
    para(c,"Sources: UCDP GED 26.1 (1989-2025) and locally loaded UCDP candidate releases through August 2026. "
         "Latest candidate revision replaces duplicate event IDs. All-time means available event history, not all wars "
         "in history; annual-only records are not invented as events. Network incidence representation informed by "
         "Barabasi, Network Science, chapter 2 (networksciencebook.com). No scale-free or causal claim.",
         48,76,1200,8)
    c.showPage(); c.save()
    payload = {"format":"war-maps-event-incidence-1","scope":scope,
               "edge_rule":"Each event links to its conflict, each listed side, and its non-null nation; side/nation identities are conflict-scoped.",
               "event_count":total,"fatal_event_count":fatal,"candidate_count":candidate,
               "conflicts":groups}
    with (out/(filename+".json.gz")).open("wb") as target:
        with gzip.GzipFile(filename="",fileobj=target,mode="wb",mtime=0) as zipped:
            zipped.write(json.dumps(payload,ensure_ascii=False,separators=(",",":")).encode())
    print(f"{filename}: {total:,} events; {len(groups):,} conflicts",flush=True)


def render_large_five(groups, out):
    """Expand ranks 1-5 from the annual poster without changing their records."""
    selected=groups[:5]
    if not selected:
        raise ValueError('No 2026 event networks available')
    filename='maps-5-large-event-networks-2026'
    total=sum(len(g['events']) for g in selected)
    c=canvas.Canvas(str(out/(filename+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle('War Maps | Five Large Event Networks | 2026')
    frame(c,1296,1728,1,'WAR MAPS / FIVE LARGE EVENT NETWORKS / 18 x 24 IN')
    text(c,'FIVE LARGE EVENT NETWORKS',48,1640,25,ORANGE,True)
    text(c,'2026 / RANKS 1-5',48,1596,30,INK,True)
    text(c,f'{total:,} events / same records and ranks as the complete 2026 poster / no sampling within selected networks',48,1566,12,MUTED)
    ranks={tuple(g['key']):i for i,g in enumerate(selected,1)}
    for g,(x,y,w,h) in partition(selected,(48,190,1200,1350)):
        rank=ranks[tuple(g['key'])]
        para(c,f"{rank:02}  {g['title']} / {len(g['events']):,} events",x+10,y+h-12,w-20,12,INK)
        draw_cluster(c,g,(x+12,y+10,w-24,h-60),rank,expanded=True)
    text(c,'NODE KEY / HOW TO READ',48,164,11,ORANGE,True)
    para(c,'Black circle: conflict. Olive triangle: coded side. Teal square: event country. Red dot: event with best deaths > 0. '
         'Grey dot: zero or unknown deaths. Every event links to its conflict, sides and country. Each dot is one event, not one person.',48,147,1200,10)
    para(c,'Ranks follow event count, not mortality. Elliptical chronological spirals fill each panel; position is not geography or causality. '
         'Countries are event locations, not inferred belligerents. Candidate and reviewed records use the same colors.',48,111,1200,10)
    para(c,'Source: UCDP GED 26.1 and loaded candidate releases through August 2026; latest revision per event ID. '
         'Selection: networks 1-5 in war-maps-event-networks-2026. Companion JSON preserves every selected event and incidence endpoint.',48,75,1200,9)
    c.showPage();c.save()
    payload={'format':'war-maps-event-incidence-1','scope':'2026','selection':'Ranks 1-5 by event count from war-maps-event-networks-2026',
             'event_count':total,'conflicts':selected,
             'edge_rule':'Each event links to its conflict, each listed side, and its non-null nation; side/nation identities are conflict-scoped.'}
    with (out/(filename+'.json.gz')).open('wb') as target:
        with gzip.GzipFile(filename='',fileobj=target,mode='wb',mtime=0) as zipped:
            zipped.write(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode())
    print(f'{filename}: {total:,} events; {len(selected)} conflicts',flush=True)


def generate(out=None, large_five_only=False):
    out = out or ROOT/"outputs/print"
    out.mkdir(parents=True,exist_ok=True)
    fonts()
    if large_five_only:
        render_large_five(compile_events(event_rows(),2026),out)
        return
    for year, scope in ((2026,"2026"),(None,"all-time")):
        groups=compile_events(event_rows(),year)
        render(groups,out,scope)
        if year==2026:
            render_large_five(groups,out)


if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--large-five-only',action='store_true')
    generate(large_five_only=parser.parse_args().large_five_only)
