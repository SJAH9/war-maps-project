"""One countable white square per recorded death; translated subset echoes."""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.generate_network_print import fonts, text, para
from src.generate_viewport_poster import ROOT, project

SLUG='war-maps-memorial-incomplete-echoes'
SOURCE=ROOT/'data/curated/network-views/russia-ukraine-lattice-14.graphml'


def death_groups(record):
    groups=Counter()
    for side in ('a','b'):
        name=record.get('side_'+side,'')
        category={'Government of Russia (Soviet Union)':'russian_side',
                  'Government of Ukraine':'ukrainian_side'}.get(name,'unattributed')
        groups[category]+=int(record.get('deaths_'+side,0))
    groups['unattributed']+=int(record.get('deaths_civilians',0))+int(record.get('deaths_unknown',0))
    if any(v<0 for v in groups.values()) or sum(groups.values())!=int(record['best']):
        raise ValueError('Death categories do not reconcile with best estimate')
    return groups


def build_points(g):
    view=json.loads(g.graph['viewport'])
    # Widen the saved frustum to retain every event; preserve its perspective.
    view=dict(view,zoom=.01)
    xy,_=project(g,view,(0,0,800,700))
    events=sorted((n,d) for n,d in g.nodes(data=True) if d.get('kind')=='event')
    if any(n not in xy for n,d in events):raise ValueError('A death-bearing event is behind the camera')
    offsets=sorted(((x,y) for x in range(-160,161) for y in range(-160,161)),
                   key=lambda p:(p[0]*p[0]+p[1]*p[1],p))
    occupied=set();points=[];totals=Counter();records=[]
    for n,d in events:
        record=json.loads(d['source_record']);groups=death_groups(record);totals.update(groups)
        categories=[kind for kind in ('russian_side','ukrainian_side','unattributed') for _ in range(groups[kind])]
        start=len(points);cx,cy=(round(v/2) for v in xy[n]);i=0
        for dx,dy in offsets:
            if i==len(categories):break
            cell=(cx+dx,cy+dy)
            if cell in occupied:continue
            occupied.add(cell);points.append((cell[0]*2,cell[1]*2,categories[i]));i+=1
        if i!=len(categories):raise ValueError('Memorial packing capacity exceeded')
        records.append(dict(node=n,record_id=record['id'],counts=dict(groups),point_range=[start,len(points)]))
    xs=[p[0] for p in points];ys=[p[1] for p in points]
    scale=min(830/(max(xs)-min(xs)+1),710/(max(ys)-min(ys)+1))
    cx=(max(xs)+min(xs))/2;cy=(max(ys)+min(ys))/2
    points=[(648+(x-cx)*scale,970+(y-cy)*scale,k) for x,y,k in points]
    return points,.7*scale,dict(totals),records


def generate(out=None):
    out=Path(out or ROOT/'outputs/print');out.mkdir(parents=True,exist_ok=True);fonts()
    g=nx.read_graphml(SOURCE);points,size,totals,records=build_points(g)
    layers=[('russian_side',(-140,195),'#650e1b'),('ukrainian_side',(140,-195),'#000000'),('all',(0,0),'#ffffff')]
    c=canvas.Canvas(str(out/(SLUG+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle('Incomplete Echoes / War Maps Memorial Study')
    c.setAuthor('Sid J. A. Hubbard; AI-assisted composition and rendering with OpenAI Codex')
    c.setFillColor(HexColor('#808b90'));c.rect(0,0,1296,1728,fill=1,stroke=0)
    ink=HexColor('#202d36');muted=HexColor('#303f48');light=HexColor('#e1ded3')
    text(c,'THE WAR MAPS PROJECT',62,1662,12,ink,True)
    text(c,'MEMORIAL STUDY / RUSSIA - UKRAINE / LOADED 2026 RECORDS',62,1640,9,ink)
    text(c,'02',1193,1657,24,ink)
    text(c,'INCOMPLETE ECHOES',62,1570,43,ink,True)
    text(c,'One human total. Two partial repetitions.',65,1538,15,light)
    counts={}
    for kind,(dx,dy),colour in layers:
        c.setFillColor(HexColor(colour));path=c.beginPath();count=0
        for x,y,k in points:
            if kind!='all' and k not in (kind,'unattributed'):continue
            path.rect(x+dx-size/2,y+dy-size/2,size,size);count+=1
        c.drawPath(path,fill=1,stroke=0);counts[kind]=count
    text(c,f"{len(points):,}",62,340,58,light,True)
    text(c,'WHITE POINTS / ONE PER RECORDED DEATH',65,316,12,ink,True)
    para(c,'The white cloud is complete only within these records. It is not a claim to count every life lost. Each point is one unit of the source best estimate, not an identified individual. The red and black clouds repeat subsets of those same points; they are not additional deaths.',65,292,710,11,ink)
    para(c,f"DARK RED / {totals.get('russian_side',0):,} Russian-side deaths\nBLACK / {totals.get('ukrainian_side',0):,} Ukrainian-side deaths\nBOTH ECHOES / {totals.get('unattributed',0):,} unattributed deaths\nConflict side is not nationality. Civilians without side attribution remain unattributed.",835,338,395,11,ink)
    para(c,'Reading the repetition: the same point coordinates are translated up-left in dark red and down-right in black. Unattributed deaths appear in both echoes, once in white. Only memorial points use pure white, pure black or red. All marks are vector squares, separated within each cloud; zoom in to resolve individuals.',65,210,1165,10,ink)
    para(c,'Source: preserved UCDP GED 26.1 / candidate records through August 2026. Event estimates are retained without independent verification. Saved lattice (14) perspective, widened to include all events; individual points packed around event positions. Artistic displacement, not geography or a new network-science result.',65,153,720,9,muted)
    para(c,'Concept & saved viewpoint: Sid J. A. Hubbard.\nAI-assisted composition & rendering: OpenAI Codex.\n18 x 24 IN / VECTOR MEMORIAL',835,153,395,9,muted)
    text(c,'No mark contains the life it touches.',65,66,13,light)
    c.showPage();c.save()
    audit=dict(title='Incomplete Echoes',source=str(SOURCE.relative_to(ROOT)),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               counts=totals,drawn_points=counts,square_size_pt=size,layers=layers,points=points,records=records,
               rebuild='python -m src.generate_memorial_echoes',note='Echoes duplicate subsets, not additional deaths. Unattributed includes civilians. White drawn last to keep every white point unobscured.')
    (out/(SLUG+'.json')).write_text(json.dumps(audit,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(dict(pdf=str(out/(SLUG+'.pdf')),counts=totals,drawn_points=counts)))


if __name__=='__main__':generate()
