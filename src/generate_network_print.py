"""Print-only network atlas and posters. Run: python -m src.generate_network_print."""
from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from xml.sax.saxutils import escape

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from src.build_atlas import build
from src.conflict_networks import ROOT, compile_networks, serializable, top_five, top_ten_mortality

PAPER = HexColor("#f4f1e4")
INK = HexColor("#191b18")
MUTED = HexColor("#5c6058")
GRID = HexColor("#c9c7b8")
ORANGE = HexColor("#d36524")
KINDS = {"Government actor": "#ae4e36", "Other / group-coded actor": "#67753d",
         "Civilian category": "#9a759e", "Geographic theatre": "#418b91"}


def fonts():
    import reportlab
    fallback = Path(reportlab.__file__).parent / "fonts"
    regular = next((p for p in [Path("/Library/Fonts/Arial Unicode.ttf"),
                   Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if p.exists()),
                   fallback / "Vera.ttf")
    bold = next((p for p in [Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")] if p.exists()),
                fallback / "VeraBd.ttf")
    pdfmetrics.registerFont(TTFont("WM", str(regular)))
    pdfmetrics.registerFont(TTFont("WMB", str(bold)))
    pdfmetrics.registerFontFamily("WM", normal="WM", bold="WMB", italic="WM", boldItalic="WMB")


def text(c, s, x, y, size=10, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont("WMB" if bold else "WM", size)
    c.drawString(x, y, str(s))


def para(c, s, x, top, width, size=10, color=INK):
    p = Paragraph(escape(s), ParagraphStyle("wm", fontName="WM", fontSize=size,
                  leading=size * 1.4, textColor=color))
    _, h = p.wrap(width, 10000)
    p.drawOn(c, x, top - h)
    return top - h


def compass(c, x, y, r):
    # Twelve cuboctahedron vertices: permutations of (+/-1,+/-1,0).
    pts = sorted({(a, b, 0) for a in (-1, 1) for b in (-1, 1)} |
                 {(a, 0, b) for a in (-1, 1) for b in (-1, 1)} |
                 {(0, a, b) for a in (-1, 1) for b in (-1, 1)})
    projected = [(x + r * (.77*a - .46*b), y + r * (.3*a + .5*b + .77*d))
                 for a, b, d in pts]
    c.setStrokeColor(MUTED)
    c.setLineWidth(.5)
    for i, p in enumerate(pts):
        for j in range(i):
            if sum((p[k]-pts[j][k])**2 for k in range(3)) == 2:
                c.line(*projected[i], *projected[j])
    c.setStrokeColor(ORANGE)
    for px, py in projected:
        c.line(x, y, px, py)
    text(c, "N", x-3, y+r*1.5, max(7, r*.27), bold=True)
    c.line(x, y+r*1.3, x, y+r*.8)


def frame(c, w, h, page, series, compact_brand=False):
    c.setFillColor(PAPER); c.rect(0, 0, w, h, fill=1, stroke=0)
    m = 48 if w > 700 else 32
    scale = w / 612
    if compact_brand:
        text(c, "WAR MAPS", w-m-236, h-m-20, 25, bold=True)
        text(c, "THE STRUCTURE OF CONFLICT", w-m-236, h-m-37, 8.5, MUTED)
        compass(c, w-m-23, h-m-24, 17)
    else:
        text(c, "WAR MAPS", w-m-146*scale, h-m-10, 15*scale, bold=True)
        text(c, "THE STRUCTURE OF CONFLICT", w-m-146*scale, h-m-24*scale, 6.4*scale, MUTED)
        compass(c, w-m-18*scale, h-m-20*scale, 13*scale)
    c.setStrokeColor(GRID); c.line(m, 32, w-m, 32)
    text(c, series, m, 19, 8, MUTED)
    text(c, str(page), w-m-20, 19, 8, MUTED)


def positions(m):
    g = m["graph"]
    # Fixed seed, sorted graph, unweighted layout (event abundance not attraction).
    ordered = nx.Graph()
    ordered.add_nodes_from(sorted(g))
    ordered.add_edges_from(sorted(g.edges()))
    return nx.spring_layout(ordered, seed=2026, iterations=100, weight=None,
                            method="force")


def draw_graph(c, m, box, pos, labels=8, poster=False):
    x, y, w, h = box
    g = m["graph"]
    minx, maxx = min(p[0] for p in pos.values()), max(p[0] for p in pos.values())
    miny, maxy = min(p[1] for p in pos.values()), max(p[1] for p in pos.values())
    xy = {n: (x+24+(p[0]-minx)/max(.001,maxx-minx)*(w-48),
              y+24+(p[1]-miny)/max(.001,maxy-miny)*(h-48)) for n,p in pos.items()}
    c.setStrokeColor(GRID)
    for a,b,e in g.edges(data=True):
        annual_only = not any(k in e["counts"] for k in ("coded sides", "event incidence"))
        c.setDash(2, 2) if annual_only else c.setDash()
        c.setLineWidth(min(2 if poster else 1, .25+.13*math.log1p(sum(e["counts"].values()))))
        c.line(*xy[a], *xy[b])
    c.setDash()
    for n in sorted(g, key=lambda n:g.degree(n)):
        px,py=xy[n]; kind=g.nodes[n]["kind"]
        r=(2.8 if poster else 1.7)+math.sqrt(g.degree(n))*(1.5 if poster else .6)
        c.setFillColor(HexColor(KINDS[kind])); c.setStrokeColor(PAPER); c.setLineWidth(.7)
        if kind=="Geographic theatre":
            c.rect(px-r,py-r,2*r,2*r,fill=1,stroke=1)
        else:
            c.circle(px,py,r,fill=1,stroke=1)
    # Keyed labels in non-overlapping margin register instead of overprinted names.
    for i,n in enumerate(m["top_degree"][:labels]):
        px,py=xy[n]
        c.setFillColor(INK); c.circle(px,py,7 if poster else 5,stroke=0,fill=1)
        c.setFillColor(PAPER); c.setFont("WMB",8 if poster else 6)
        c.drawCentredString(px,py-2.6 if poster else py-2,str(i+1))


def legend(c, m, x, y, width, size):
    for kind in KINDS:
        if not any(d["kind"]==kind for _,d in m["graph"].nodes(data=True)):
            continue
        c.setFillColor(HexColor(KINDS[kind]))
        if kind=="Geographic theatre": c.rect(x,y-3,7,7,fill=1,stroke=0)
        else: c.circle(x+3.5,y+.5,3.5,fill=1,stroke=0)
        text(c,kind,x+14,y-2,size)
        y-=size*1.9
    return para(c,"Node area grows with degree. Link width grows logarithmically with record count. "
                "Solid: event incidence or coded sides. Dashed: annual-only relations.",x,y-5,width,size,MUTED)


def narrative(m):
    g=m["graph"]; hub=m["top_degree"][0]; bridge=m["top_bridge"][0]
    deg=g.degree(hub); share=100*deg/max(1,len(g)-1)
    return (
        f"The network places {len(g):,} coded actors and geographic theatres in one relational field. "
        f"{g.nodes[hub]['label']} reaches {deg:,} distinct neighbours ({share:.1f}% of the other nodes). "
        "A chronological ledger repeats these names; the graph makes their shared neighbourhoods visible. "
        f"There are {m['components']} connected component(s) and {len(m['articulations'])} articulation node(s): "
        "removing an articulation and its edges disconnects part of this recorded network, not necessarily the real conflict. "
        f"The highest unweighted betweenness belongs to {g.nodes[bridge]['label']} "
        f"({m['centrality'][bridge]:.3f}; {m['centrality_method']}). This measures shortest-path brokerage "
        "in the encoded actor-theatre relationships, not command, responsibility, transport routes or military leverage. "
        f"The record spans {min(m['years'])}-{max(m['years'])}; {m['annual']:,} annual records complement "
        f"{m['events']:,} event observations. Repeated reporting, theatre aggregation and source coverage shape the hubs. "
        "No causal direction, power law or preferential attachment has been established."
    )


def degree_chart(c,m,x,y,w,h,size):
    hist=Counter(dict(m["graph"].degree()).values())
    maxk=max(hist); maxv=max(hist.values())
    c.setStrokeColor(GRID);c.line(x,y,x+w,y);c.line(x,y,x,y+h)
    for k,v in sorted(hist.items()):
        px=x+w*math.log1p(k)/math.log1p(maxk)
        py=y+h*v/maxv
        c.setStrokeColor(ORANGE);c.setLineWidth(2);c.line(px,y,px,py)
    text(c,"Degree: 0",x,y-17,size,MUTED)
    text(c,str(maxk),x+w-25,y-17,size,MUTED)
    text(c,f"Nodes: 0-{maxv}; horizontal log(1+k)",x,y+h+10,size,MUTED)


def timeline(c,m,x,y,w,h,size):
    years=m["event_years"];lo,hi=min(m["years"]),max(m["years"])
    step=w/(hi-lo+1);mx=max(years.values())
    c.setFillColor(HexColor("#418b91"))
    for yr,v in years.items():c.rect(x+(yr-lo)*step,y,max(.5,step*.75),h*v/mx,fill=1,stroke=0)
    for yr in m["years"]:
        if yr not in years:
            c.setFillColor(ORANGE);c.circle(x+(yr-lo+.4)*step,y+2,2,fill=1,stroke=0)
    text(c,str(lo),x,y-17,size,MUTED);text(c,str(hi),x+w-30,y-17,size,MUTED)
    text(c,f"Events/year, max {mx:,}. Orange dots: annual-only years.",x,y+h+10,size,MUTED)


def render_networks(models,out,ranked_only=False):
    fonts();out.mkdir(parents=True,exist_ok=True)
    posters=top_ten_mortality(models)
    if len(posters)!=10:raise ValueError("Fewer than ten networks")
    pos_cache={}
    path=out/"war-maps-conflict-networks-top-10-mortality.pdf"
    c=canvas.Canvas(str(path),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle("War Maps | Conflict Networks | Top Ten by Mortality")
    for i,m in enumerate(posters,1):
        print(f"Poster {i}: {m['title']}",flush=True)
        frame(c,1296,1728,i,"WAR MAPS / NETWORK SCIENCE / 18 x 24 IN")
        text(c,f"MORTALITY RANK / {i:02d} OF 10",48,1640,15,ORANGE,True)
        para(c,m["title"],48,1598,830,32)
        text(c,f"{min(m['years'])}-{max(m['years'])}  /  UCDP {m['key'][1]}  /  violence type {m['key'][0]}",
             48,1490,14,MUTED)
        g=m["graph"]
        text(c,f"{len(g):,} NODES     {g.number_of_edges():,} LINKS     {m['events']:,} EVENTS",
             48,1445,22,bold=True)
        pos=positions(m);pos_cache[tuple(m["key"])]=pos
        draw_graph(c,m,(48,690,890,715),pos,poster=True)
        text(c,"READING THE FIELD",970,1375,13,ORANGE,True)
        yy=legend(c,m,970,1340,265,11)
        text(c,"DEGREE HUBS / KEY",970,yy-30,13,ORANGE,True)
        yy-=55
        for j,n in enumerate(m["top_degree"],1):
            yy=para(c,f"{j:02d}  {g.nodes[n]['label']}  /  degree {g.degree(n)}",
                    970,yy,265,11)-12
        para(c,f"Reported deaths (best): {m['deaths_best']:,.0f}. "
             f"Unknown estimates: {m['deaths_unknown']:,} events. "
             "Ranked by summed best fatality estimates across all available event years, "
             "including latest candidate revisions. Annual totals are not added again. "
             "No completeness threshold. Candidate observations are provisional and distinct IDs can "
             "contain overlapping reports; this sum is not a verified unique-person death toll.",
             970,yy-20,265,10,MUTED)
        text(c,"01 / DEGREE DISTRIBUTION",48,640,14,ORANGE,True)
        degree_chart(c,m,48,460,520,130,11)
        text(c,"02 / RECORDED HISTORY",690,640,14,ORANGE,True)
        timeline(c,m,690,460,550,130,11)
        text(c,"03 / WHAT THE NETWORK MAKES VISIBLE",48,375,14,ORANGE,True)
        para(c,narrative(m),48,345,1190,15)
        para(c,"Sources: "+", ".join(sorted(m["sources"]))+
             ". Reviewed GED: 1989-2025; annual state-based coding: 1946-2025; candidate events: Jan-Aug 2026. "
             "Geographic theatres aggregate by country + recorded first-level subdivision; no subdivision is invented. "
             "All recorded years retained, not a claim of complete lifetime coverage. "
             "Method: Barabasi, Network Science, chapters 2 and 4 (networksciencebook.com). "
             "Exact nodes and edges: companion conflict-network-register.json. Source snapshots: War Ephemeris recovery attachment.",
             48,125,1190,10,MUTED)
        c.showPage()
    c.save()
    if ranked_only:
        return
    path=out/"war-maps-conflict-networks-2026.pdf"
    c=canvas.Canvas(str(path),pagesize=(612,792),pageCompression=1,invariant=1)
    c.setTitle("War Maps | Conflicts Active in 2026 | Full Recorded Networks")
    active = [m for m in models if m["active_2026"]]
    for i,m in enumerate(active,1):
        if i%50==0:print(f"Atlas {i}/{len(active)}",flush=True)
        frame(c,612,792,i,"WAR MAPS / ACTIVE IN 2026 / FULL RECORDED HISTORY")
        text(c,f"CONFLICT {m['key'][1]} / TYPE {m['key'][0]}",32,745,9,ORANGE,True)
        para(c,m["title"],32,715,548,17)
        text(c,f"{min(m['years'])}-{max(m['years'])}  |  {m['events']:,} events + {m['annual']:,} annual records  |  "
             f"{len(m['graph'])} nodes / {m['graph'].number_of_edges()} links",32,650,9,MUTED)
        pos=pos_cache.get(tuple(m["key"]))
        if pos is None:pos=positions(m)
        draw_graph(c,m,(32,335,370,300),pos,labels=4)
        yy=legend(c,m,420,620,160,8)
        for j,n in enumerate(m["top_degree"][:4],1):
            yy=para(c,f"{j}. {m['graph'].nodes[n]['label']} (degree {m['graph'].degree(n)})",
                    420,yy-12,160,8)
        # Concise per-conflict finding, with full definitions in poster/ephemeris.
        para(c,narrative(m),32,310,548,9)
        para(c,"Sources: "+", ".join(sorted(m["sources"]))+
             ". Eligibility: a recorded interval overlaps 2026; current boundary August 31. "
             "All available years included (GED from 1989, annual coding from 1946). "
             "Theatres = country + subdivision. Solid/dashed links are event/annual records, not causal arrows. "
             "Sparse conflicts are retained; unlabelled nodes remain in the graph and recovery register.",
             32,100,548,7.5,MUTED)
        c.showPage()
    c.save()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--networks-only",action="store_true")
    parser.add_argument("--ranked-only",action="store_true")
    args=parser.parse_args()
    data=build()
    models=compile_networks(data)
    out=ROOT/"outputs/print"
    out.mkdir(parents=True,exist_ok=True)
    register={"method_version":1,"active_year":2026,"candidate_boundary":data["coverage"]["candidate_through"],
              "top_ten_mortality":[m["key"] for m in top_ten_mortality(models)],
              "mortality_ranking":[{"key":m["key"],"title":m["title"],"deaths_best":m["deaths_best"],
                                   "deaths_unknown":m["deaths_unknown"]}
                                  for m in top_ten_mortality(models)],
              "top_five":[m["key"] for m in top_five(models)],
              "ranking_population":"All locally recorded GED conflicts, not restricted to 2026",
              "ranking":[{k:m[k] for k in ("key","title","events","complete","completeness","score","eligible","active_2026")}
                         for m in sorted(models,key=lambda m:(-m["score"],m["key"]))],
              "networks":[serializable(m) for m in models if "centrality" in m]}
    (out/"conflict-network-register.json").write_text(json.dumps(register,ensure_ascii=False,separators=(",",":"))+"\n")
    render_networks(models,out,args.ranked_only)
    if args.ranked_only:
        return
    from src.generate_event_network_print import generate as generate_events
    generate_events(out)
    from src.generate_event_hubs import generate as generate_hubs
    generate_hubs(out)
    from src.generate_viewport_poster import DEFAULT as saved_view, generate as generate_viewport
    if saved_view.exists():
        generate_viewport(saved_view,out)
    from src.generate_view_comparison_posters import INPUT as view_inputs, FILES as view_files, generate as generate_view_posters
    if all((view_inputs/name).exists() for name in view_files.values()):
        generate_view_posters(out)
    from src.generate_mortality_poster import generate as generate_mortality
    generate_mortality(out)
    from src.generate_war_networks import generate as generate_war_networks
    generate_war_networks(out)
    if not args.networks_only:
        from src.generate_war_ephemeris import generate
        generate(data,register,out)
    print(f"Complete: {sum(m['active_2026'] for m in models)} active-in-2026 networks; "
          f"{len(models)} conflicts evaluated for posters",flush=True)


if __name__=="__main__":
    main()
