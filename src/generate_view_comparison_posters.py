"""Rebuild the chosen overview and two-view hybrid from preserved GraphML cameras."""
import hashlib
import json
import math
from pathlib import Path

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from src.generate_viewport_poster import ROOT, COLORS, project
from src.generate_network_print import fonts, frame, text, para, INK, MUTED, ORANGE, PAPER

INPUT=ROOT/'data/curated/network-views'
FILES={'third-party-3':'russia-ukraine-third-party-3.graphml',
       'lattice-14':'russia-ukraine-lattice-14.graphml',
       'lattice-7':'russia-ukraine-lattice-7.graphml'}
ANCHORS=[('A','method:Drone','Drone'),
         ('B','place:Ukraine /  / Pokrovsk direction','Pokrovsk direction'),
         ('C','method:Shelling / artillery','Shelling / artillery'),
         ('D','date:2026-08-12','2026-08-12')]


def anchor_boxes(overview):
    return ([(62,1030),(1002,1330),(62,1245),(1002,1100)] if overview else
            [(55,500),(1002,526),(1002,295),(55,91)])


def draw_anchors(c,g,xy,overview):
    audit=[]
    for (letter,node,label),(lx,ly) in zip(ANCHORS,anchor_boxes(overview)):
        present=node in xy;kind=g.nodes[node]['kind'];colour=HexColor(COLORS[kind]);w,h=232,48
        if not present:
            audit.append(dict(letter=letter,id=node,label=label,visible=False,box=None))
            continue
        if present:
            x,y=xy[node];cx=lx+w/2;cy=ly+h/2
            # The leader is annotation, not an additional network edge.
            ex=lx+w if x>cx else lx;ey=min(ly+h-7,max(ly+7,y))
            c.setStrokeColor(PAPER);c.setLineWidth(3);c.line(x,y,ex,ey)
            c.setStrokeColor(colour);c.setLineWidth(.9);c.line(x,y,ex,ey)
            glyph(c,kind,x,y,12)
            text(c,letter,x-3.7,y-4,10,PAPER,True)
        c.setFillColor(PAPER);c.setStrokeColor(colour);c.setLineWidth(1)
        if not present:c.setDash(3,3)
        c.roundRect(lx,ly,w,h,3,fill=1,stroke=1);c.setDash()
        glyph(c,kind,lx+17,ly+29,9)
        text(c,letter,lx+13.5,ly+25,9,PAPER,True)
        text(c,label,lx+34,ly+26,13,INK,True)
        text(c,'ORIENTATION ANCHOR / '+letter if present else 'OFF-FRAME IN THIS DETAIL',lx+12,ly+10,8,MUTED)
        audit.append(dict(letter=letter,id=node,label=label,visible=present,box=[lx,ly,w,h]))
    return audit


def foreground_places(g,xy,limit=5):
    """Largest visible place hubs, with unique adjacent fatal-event counts."""
    candidates=[n for n in xy if g.nodes[n].get('kind')=='place']
    selected=sorted(candidates,key=lambda n:(-g.degree(n),n))[:limit]
    rows=[]
    for n in sorted(selected,key=lambda n:(-xy[n][1],n)):
        events={v for v in g[n] if g.nodes[v].get('kind')=='event' and g.nodes[v].get('fatal')}
        rows.append(dict(id=n,label=g.nodes[n].get('label',n).split(' / ')[-1],
                         fatal_events=len(events),visible_fatal_events=len(events & set(xy)),
                         event_ids=sorted(events)))
    return rows


def draw_foreground_places(c,g,xy,rows):
    colour=HexColor(COLORS['place']);x0=1002
    # Leaders terminate on real place nodes; numbered squares identify them.
    for i,row in enumerate(rows):
        x,y=xy[row['id']];ly=539-i*36
        c.setStrokeColor(PAPER);c.setLineWidth(2.5);c.line(x,y,x0-5,ly)
        c.setStrokeColor(colour);c.setLineWidth(.7);c.line(x,y,x0-5,ly)
        glyph(c,'place',x,y,10);text(c,str(i+1),x-3,y-3.5,9,PAPER,True)
    c.setFillColor(PAPER);c.rect(x0-2,366,244,216,fill=1,stroke=0)
    text(c,'PLACE HUBS / FATAL EVENTS',x0,567,10,colour,True)
    text(c,'Full graph / visible in this detail',x0,553,8,MUTED)
    for i,row in enumerate(rows):
        ly=539-i*36
        glyph(c,'place',x0+7,ly-1,7);text(c,str(i+1),x0+4.5,ly-4,7,PAPER,True)
        size=min(11,207/max(1,stringWidth(row['label'],'WMB',11))*11)
        text(c,row['label'],x0+21,ly-3,size,INK,True)
        text(c,f"{row['fatal_events']:,} fatal events / {row['visible_fatal_events']:,} visible",x0+21,ly-16,9,MUTED)


def glyph(c,kind,x,y,r,color=None,opacity=1):
    c.setFillColor(HexColor(color or COLORS.get(kind,'#96998b')));c.setStrokeColor(PAPER);c.setLineWidth(.35)
    c.setFillAlpha(opacity);c.setStrokeAlpha(opacity)
    if kind=='place':c.rect(x-r,y-r,2*r,2*r,fill=1,stroke=1)
    elif kind in ('date','method'):
        p=c.beginPath();p.moveTo(x,y+r)
        if kind=='method':p.lineTo(x+r,y);p.lineTo(x,y-r);p.lineTo(x-r,y)
        else:p.lineTo(x-r,y-r);p.lineTo(x+r,y-r)
        p.close();c.drawPath(p,fill=1,stroke=1)
    else:c.circle(x,y,r,fill=1,stroke=1)


def draw_graph(c,g,box,subdued=False,anchors=False):
    view=json.loads(g.graph['viewport']);xy,depth=project(g,view,box)
    hidden={n for n in g if len(set(g[n])-{n})/max(1,len(g)-1)>.6} if view.get('hideHighDegreeLinks') else set()
    edges=[(a,b,d) for a,b,d in g.edges(data=True) if a in xy and b in xy and a not in hidden and b not in hidden]
    c.saveState();c.setStrokeAlpha(.12 if subdued else .20)
    maximum=max(float(d.get('weight',1)) for _,_,d in edges)
    for a,b,d in edges:
        kind=d.get('evidence','place');c.setStrokeColor(HexColor(COLORS.get(kind,'#7d918b')))
        c.setStrokeAlpha(.12 if subdued else .20)
        c.setLineWidth(.22+.55*float(d.get('weight',1))/maximum)
        c.setDash(2,2) if kind=='method' else c.setDash()
        c.line(*xy[a],*xy[b])
    c.setDash();c.setStrokeAlpha(1);c.setFillAlpha(.65 if subdued else 1)
    scale=.68 if subdued else .9
    radii={n:scale*(2.3 if g.nodes[n].get('kind')=='event' else 3.4+min(13,math.sqrt(g.degree(n)))) for n in xy}
    for n in sorted(xy,key=lambda n:-depth[n]):
        d=g.nodes[n];color='#96998b' if d.get('kind')=='event' and not d.get('fatal') else None
        glyph(c,d.get('kind'),*xy[n],radii[n],color,.65 if subdued else 1)
    c.setFillAlpha(1);c.setStrokeAlpha(1)
    occupied=[(xy[n][0]-r,xy[n][1]-r,xy[n][0]+r,xy[n][1]+r) for n,r in radii.items()];labeled=[]
    place_rows=foreground_places(g,xy) if anchors and not subdued else []
    if place_rows:occupied.append((995,366,1248,582))
    if anchors:occupied.extend((x-3,y-3,x+235,y+51) for x,y in anchor_boxes(subdued))
    # Prioritize exact-day labels near visually dense fatal-event points.
    fatal_xy=[xy[n] for n in xy if g.nodes[n].get('kind')=='event' and g.nodes[n].get('fatal')]
    date_density={n:sum((x-xy[n][0])**2+(y-xy[n][1])**2<=65**2 for x,y in fatal_xy)
                  for n in xy if g.nodes[n].get('kind')=='date'} if anchors else {}
    dense_dates=set(sorted(date_density,key=lambda n:(-date_density[n],n))[:14])
    priority=sorted(xy,key=lambda n:(0 if n in dense_dates else 1 if g.nodes[n].get('kind')=='method' else 2,
                                   -date_density.get(n,0) if n in dense_dates else -float(g.nodes[n].get('betweenness',0)),-g.degree(n),n))
    left,bottom,width,height=box
    for n in priority:
        if n in {row['id'] for row in place_rows}:continue
        if anchors and n in {v[1] for v in ANCHORS}:continue
        d=g.nodes[n];kind=d.get('kind')
        if kind=='event':continue
        # Dates are contextual, not allowed to crowd out places and methods.
        if kind=='date' and len(labeled)>45 and n not in dense_dates:continue
        label=str(d.get('label',n));label=label.split(' / ')[-1] if kind=='place' else label
        if len(label)>38:label=label[:35]+'...'
        size=9 if kind=='method' or n in dense_dates else 7.5;tw=stringWidth(label,'WM',size);x,y=xy[n];r=radii[n]
        locations=[(x+r+3,y-3),(x-tw-r-3,y-3),(x-tw/2,y+r+4),(x-tw/2,y-r-12)]
        if n in dense_dates:
            locations.extend((x+dist*math.cos(a)-tw/2,y+dist*math.sin(a)-3)
                             for dist in (25,40,60,80,100,130,160,200) for a in [i*math.pi/8 for i in range(16)])
        for lx,ly in locations:
            b=(lx-2,ly-2,lx+tw+2,ly+size+2)
            if b[0]<left or b[2]>left+width or b[1]<bottom or b[3]>bottom+height:continue
            if any(not(b[2]<o[0] or b[0]>o[2] or b[3]<o[1] or b[1]>o[3]) for o in occupied):continue
            if n in dense_dates:
                c.setStrokeColor(HexColor(COLORS['date']));c.setLineWidth(.65)
                c.line(x,y,min(lx+tw,max(lx,x)),ly+size/2)
            c.setFillColor(PAPER);c.rect(b[0],b[1],b[2]-b[0],b[3]-b[1],fill=1,stroke=0)
            text(c,label,lx,ly,size,INK);occupied.append(b);labeled.append(n);break
    orientation=draw_anchors(c,g,xy,subdued) if anchors else []
    if place_rows:draw_foreground_places(c,g,xy,place_rows)
    c.restoreState()
    return dict(drawn_nodes=len(xy),drawn_edges=len(edges),cropped_nodes=sorted(set(g)-set(xy)),labels=labeled,viewport=view,projected_positions=xy,orientation_anchors=orientation,foreground_place_totals=place_rows,dense_date_labels=[n for n in labeled if n in dense_dates])


def key(c,y):
    for i,(kind,label,color) in enumerate([('event','Fatal event',None),('event','Zero / unknown deaths','#96998b'),('place','Shared place',None),('date','Exact day',None),('method','Headline method',None)]):
        x=58+i*240;glyph(c,kind,x,y,5.5,color);text(c,label,x+14,y-3,10)
    c.setStrokeColor(HexColor(COLORS['place']));c.setLineWidth(.8);c.line(52,y-25,84,y-25);text(c,'Place / day incidence',94,y-28,9)
    c.setStrokeColor(HexColor(COLORS['method']));c.setDash(2,2);c.line(355,y-25,387,y-25);c.setDash();text(c,'Method-term connections derived by War Maps',397,y-28,9)
    text(c,'Node size: number of connections. Layout: saved 3D views.',820,y-28,9,MUTED)


def findings(g):
    def components_without(kind):
        h=g.copy();h.remove_nodes_from([n for n,d in g.nodes(data=True) if d.get('kind')==kind])
        return sum(any(h.nodes[n].get('kind')=='event' for n in part) for part in nx.connected_components(h))
    return {'all':components_without(None),'without_date':components_without('date'),'without_method':components_without('method')}


def interpretation(c,top,g,stats):
    records=[json.loads(d['source_record']) for _,d in g.nodes(data=True) if d.get('kind')=='event']
    fatal=sum(int(r['best'])>0 for r in records)
    deaths=sum(int(r['best']) for r in records)
    civilians=sum(int(r['deaths_civilians']) for r in records)
    unknown=sum(int(r['deaths_unknown']) for r in records)
    columns=[
      (f'{fatal:,} FATAL EVENTS / {deaths:,} DEATHS',
       f"UCDP records {len(records):,} events in this network. The death total includes {civilians:,} civilian deaths and {unknown:,} deaths coded unknown. Totals sum the UCDP best field. Event start dates span January 1-August 31, 2026; six event intervals end September 1."),
      ('PLACES, DAYS AND SHARED CONNECTIONS',
       f"The events connect through 245 shared place nodes, 243 exact-day nodes and six method-term nodes. The network has {stats['all']} connected components containing events. Removing date nodes produces {stats['without_date']} components; removing method nodes produces {stats['without_method']}."),
      ('DRONE / SHELLING / POKROVSK',
       f"Drone connects {g.degree('method:Drone')} events; Shelling / artillery connects {g.degree('method:Shelling / artillery')}. Pokrovsk direction connects {g.degree('place:Ukraine /  / Pokrovsk direction')} events and ranks first in weighted betweenness, measuring its position on shortest paths through the network. Government affiliations remain in the event records; the graph connects events through shared attributes.")]
    for i,(heading,body) in enumerate(columns):
        x=48+i*408;text(c,heading,x,top,10,ORANGE,True);para(c,body,x,top-12,384,10.5)


def event_scope(g):
    records=[json.loads(d['source_record']) for _,d in g.nodes(data=True) if d.get('kind')=='event']
    return dict(event_count=len(records),start=min(r['date_start'][:10] for r in records),
                latest_start=max(r['date_start'][:10] for r in records),
                end=max((r.get('date_end') or r['date_start'])[:10] for r in records),
                sources=sorted({r.get('_source','') for r in records}),
                conflicts=sorted({r.get('conflict_name','') for r in records}))


def generate(out=None,hybrid_only=False):
    out=Path(out or ROOT/'outputs/print');out.mkdir(parents=True,exist_ok=True);fonts()
    graphs={k:nx.read_graphml(INPUT/name) for k,name in FILES.items()}
    g=graphs['third-party-3'];stats=findings(g);scope=event_scope(g)
    for h in graphs.values():
        if set(h)!=set(g) or {frozenset(e) for e in h.edges()}!={frozenset(e) for e in g.edges()}:raise ValueError('Views must share the same underlying graph')
    for hybrid in (False,True):
        if hybrid_only and not hybrid:continue
        slug='maps-event-hubs-russia-ukraine-2026-'+('lattice-hybrid' if hybrid else 'third-party-3')
        c=canvas.Canvas(str(out/(slug+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
        title='2026 / TWO VIEWS / ONE EVENT NETWORK /' if hybrid else 'HUBS, BRIDGES & SHARED ATTRIBUTES'
        c.setTitle('War Maps / Russia - Ukraine / '+title)
        frame(c,1296,1728,1,'WAR MAPS / SAVED NETWORK VIEWS / 18 x 24 IN')
        text(c,'RUSSIA - UKRAINE',48,1640,28,INK,True);text(c,title,48,1598,20,ORANGE,True)
        text(c,f"{scope['event_count']:,} events / {len(g):,} nodes / {g.number_of_edges():,} source links / loaded 2026 records",48,1564,12)
        panels={}
        if hybrid:
            text(c,'01 / LATTICE (14) / OVERVIEW',48,1525,11,ORANGE,True)
            panels['lattice-14']=draw_graph(c,graphs['lattice-14'],(48,925,1200,580),subdued=True,anchors=True)
            text(c,'2,786 nodes / 4,557 links shown; 2 nodes outside the saved camera',48,909,10,MUTED)
            c.setStrokeColor(ORANGE);c.setLineWidth(.6);c.line(48,886,1248,886)
            interpretation(c,863,g,stats)
            key(c,724)
            para(c,'READ THE TWO VIEWS: A / Drone, C / Shelling-artillery and D / 2026-08-12 identify matching nodes. Date labels locate exact-day connections. The numbered place list gives fatal-event totals for each hub, followed by the number visible in the foreground. Label leaders point to their nodes. The overview shows 2,786 nodes and 4,557 links; the foreground shows 1,958 nodes and 2,934 links from the same network.',48,674,1200,10)
            c.setStrokeColor(ORANGE);c.line(48,628,1248,628)
            text(c,'02 / LATTICE (7) / FOREGROUND DETAIL',48,603,11,ORANGE,True)
            panels['lattice-7']=draw_graph(c,graphs['lattice-7'],(48,77,1200,505),anchors=True)
        else:
            panels['third-party-3']=draw_graph(c,g,(48,383,1200,1142))
            text(c,'THIRD-PARTY (3) / 2,780 nodes / 4,555 links shown / 8 off-screen nodes cropped',48,362,11,ORANGE,True)
            key(c,333);interpretation(c,273,g,stats)
            para(c,'Saved camera projection, uniformly fitted to the poster; no new network layout. Node size follows original degree. Weighted betweenness uses distance = 1/IGF, with IGF = ln(N/feature event count). The browser layout name is not a claim that the arrangement optimizes betweenness. Callouts describe the full graph, not just the cropped view.',48,124,1200,10)
        para(c,'Source: Uppsala Conflict Data Program (UCDP), candidate event releases through August 2026. Event records and their source attribution are preserved in GraphML. War Maps derives method-term nodes from the source_headline field. Rebuild: python -m src.generate_view_comparison_posters',48,63,1200,8)
        c.showPage();c.save()
        audit={'panels':panels,'event_scope':scope,'findings_full_graph':stats,'source_graph_nodes':len(g),'source_graph_edges':g.number_of_edges(),
               'inputs':{k:{'path':str((INPUT/FILES[k]).relative_to(ROOT)),'sha256':hashlib.sha256((INPUT/FILES[k]).read_bytes()).hexdigest()} for k in panels}}
        (out/(slug+'.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
        print(slug,{k:(p['drawn_nodes'],p['drawn_edges'],len(p['labels'])) for k,p in panels.items()},flush=True)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--hybrid-only',action='store_true')
    generate(hybrid_only=parser.parse_args().hybrid_only)
