"""Vector poster from saved GraphML world coordinates and camera, without re-layout."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import networkx as nx
import numpy as np
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from src.generate_network_print import fonts, frame, text, para, INK, ORANGE, PAPER

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT/'data/curated/network-views/russia-ukraine-barabasi.graphml'
SLUG = 'maps-event-hubs-russia-ukraine-2026-saved-view'
COLORS = {'event':'#b8312c', 'place':'#3c8994', 'date':'#65783f', 'method':'#8c65a1'}


def project(graph, view, box):
    """Three.js camera quaternion is camera-to-world; invert for perspective."""
    q = np.asarray(view['quaternion'], dtype=float)
    if q.shape != (4,) or not np.isfinite(q).all() or np.linalg.norm(q) < 1e-12:
        raise ValueError('Invalid camera quaternion')
    x,y,z,w = q/np.linalg.norm(q)
    rotation = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                         [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                         [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    camera = np.asarray(view['position'], dtype=float)
    fov=float(view.get('fov',50)); zoom=float(view.get('zoom',1))
    if not 0 < fov < 180 or zoom <= 0:
        raise ValueError('Invalid camera field of view or zoom')
    focal=zoom/math.tan(math.radians(fov)/2)
    projected={}; depths={};aspect=float(view.get('width',1600))/float(view.get('height',990))
    for node, attrs in graph.nodes(data=True):
        point=np.array([float(attrs[k]) for k in ('x','y','z')])
        local=rotation.T@(point-camera)
        if not np.isfinite(local).all():
            raise ValueError(f'Node {node} has invalid coordinates')
        if local[2] >= -1e-6:continue
        depth=-float(local[2]);depths[node]=depth
        point=(float(local[0])*focal/depth,float(local[1])*focal/depth)
        if abs(point[0])<=aspect and abs(point[1])<=1:projected[node]=point
    if not projected:raise ValueError('No nodes in the saved camera viewport')
    # Fit the viewport-retained extent uniformly, without stretching or re-layout.
    left,bottom,width,height=box
    xs,ys=zip(*projected.values());spanx=max(max(xs)-min(xs),1e-9);spany=max(max(ys)-min(ys),1e-9)
    scale=min((width-36)/spanx,(height-36)/spany)
    cx=(max(xs)+min(xs))/2;cy=(max(ys)+min(ys))/2
    xy={n:(left+width/2+(p[0]-cx)*scale,bottom+height/2+(p[1]-cy)*scale) for n,p in projected.items()}
    return xy,depths


def generate(source=DEFAULT, out=None):
    source=Path(source);out=Path(out or ROOT/'outputs/print');out.mkdir(parents=True,exist_ok=True)
    graph=nx.read_graphml(source);view=json.loads(graph.graph['viewport'])
    xy,depth=project(graph,view,(48,330,1200,1198))
    cropped=set(graph)-set(xy);hidden=set()
    if view.get('hideHighDegreeLinks'):
        hidden={n for n in graph if len(set(graph.neighbors(n))-{n})/max(1,len(graph)-1)>.6}
    edges=[(a,b,d) for a,b,d in graph.edges(data=True) if a not in hidden and b not in hidden and a in xy and b in xy]
    visible=nx.Graph();visible.add_nodes_from(xy);visible.add_edges_from((a,b) for a,b,_ in edges)
    fonts();path=out/(SLUG+'.pdf');c=canvas.Canvas(str(path),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle('Russia - Ukraine / Saved Barabasi View / War Maps')
    frame(c,1296,1728,1,'WAR MAPS / SAVED VIEWPORT / 18 x 24 IN')
    text(c,'RUSSIA - UKRAINE',48,1640,28,INK,True)
    text(c,'YOUR VIEW / HUBS & EVENT RELATIONSHIPS',48,1598,21,ORANGE,True)
    events=sum(d.get('kind')=='event' for _,d in graph.nodes(data=True))
    text(c,f'{len(xy):,} visible nodes / {len(edges):,} drawn links / {len(cropped):,} off-screen nodes cropped / full graph: {len(graph):,} nodes',48,1564,13)

    def glyph(kind,x,y,r,color=None):
        c.setFillColor(HexColor(color or COLORS.get(kind,'#96998b')));c.setStrokeColor(PAPER);c.setLineWidth(.45)
        if kind=='place':c.rect(x-r,y-r,2*r,2*r,fill=1,stroke=1)
        elif kind in ('date','method'):
            p=c.beginPath();p.moveTo(x,y+r)
            if kind=='method':p.lineTo(x+r,y);p.lineTo(x,y-r);p.lineTo(x-r,y)
            else:p.lineTo(x-r,y-r);p.lineTo(x+r,y-r)
            p.close();c.drawPath(p,fill=1,stroke=1)
        else:c.circle(x,y,r,fill=1,stroke=1)

    maxweight=max((float(d.get('weight',1)) for _,_,d in edges),default=1)
    c.setStrokeAlpha(.23)
    for a,b,d in edges:
        kind=d.get('evidence','place');c.setStrokeColor(HexColor(COLORS.get(kind,'#7d918b')))
        c.setLineWidth(.3+.65*float(d.get('weight',1))/maxweight)
        c.setDash(2,2) if kind=='method' else c.setDash()
        c.line(*xy[a],*xy[b])
    c.setStrokeAlpha(1);c.setDash()
    radii={n:(2.5 if d.get('kind')=='event' else 4+min(14,math.sqrt(float(d.get('degree',graph.degree(n)))))) for n,d in graph.nodes(data=True) if n in xy}
    for n in sorted(xy,key=lambda n:-depth[n]):
        d=graph.nodes[n];color='#96998b' if d.get('kind')=='event' and not d.get('fatal') else None
        glyph(d.get('kind'),*xy[n],radii[n],color)
    occupied=[(xy[n][0]-r,xy[n][1]-r,xy[n][0]+r,xy[n][1]+r) for n,r in radii.items()]
    labeled=[]
    if view.get('showLabels',True):
        priority=sorted(xy,key=lambda n:(graph.nodes[n].get('kind')=='event',-float(graph.nodes[n].get('betweenness',0)),-graph.degree(n),n))
        for n in priority:
            d=graph.nodes[n];kind=d.get('kind')
            if kind=='event' and visible.degree(n):continue
            label=str(d.get('label',n)).split(' / ')[-1] if kind=='place' else str(d.get('label',n))
            if len(label)>43:label=label[:40]+'...'
            size=10 if kind=='method' else 8;tw=stringWidth(label,'WM',size);x,y=xy[n];r=radii[n]
            for lx,ly in [(x+r+3,y-3),(x-tw-r-3,y-3),(x-tw/2,y+r+4),(x-tw/2,y-r-12)]:
                b=(lx-2,ly-2,lx+tw+2,ly+size+2)
                if b[0]<48 or b[2]>1248 or b[1]<330 or b[3]>1528:continue
                if any(not(b[2]<o[0] or b[0]>o[2] or b[3]<o[1] or b[1]>o[3]) for o in occupied):continue
                c.setFillColor(PAPER);c.rect(b[0],b[1],b[2]-b[0],b[3]-b[1],fill=1,stroke=0)
                text(c,label,lx,ly,size,INK);occupied.append(b);labeled.append(n);break
    text(c,'NODE & EDGE KEY',48,309,12,ORANGE,True)
    for i,(kind,label,color) in enumerate([('event','Fatal event',None),('event','Zero / unknown deaths','#96998b'),('place','Shared recorded place',None),('date','Exact recorded day',None),('method','Headline method term',None)]):
        x=60+i*240;glyph(kind,x,283,6,color);text(c,label,x+14,279,10)
    c.setStrokeColor(HexColor(COLORS['place']));c.setLineWidth(1);c.line(50,257,90,257);text(c,'Place / date incidence',100,253,9)
    c.setStrokeColor(HexColor(COLORS['method']));c.setDash(2,2);c.line(390,257,430,257);c.setDash();text(c,'Headline method incidence - not verified weapon use',440,253,9)
    text(c,'SAVED 3D POSITIONS / CAMERA-PROJECTED / NO NEW LAYOUT',48,226,11,ORANGE,True)
    para(c,'This is your saved Barabasi view projected through its camera quaternion and perspective, cropped to the saved screen bounds, then uniformly fitted to the print area. Off-screen nodes and their incident links are omitted from this poster only. Relative projected geometry is preserved; glyphs and collision-safe labels use the print design. Size follows original degree.',48,209,1200,10)
    para(c,f'The network reveals shared places, exact days and headline method terms linking otherwise separate event records. Major method hubs connect observations across places. Proximity is a layout result, not geography. Links do not establish coordination, causality or retaliation. {len(hidden)} hubs hidden by the saved >60% filter; {len(cropped)} nodes outside the camera crop. Red circles mark fatal events.',48,157,1200,10)
    para(c,'Government hubs are absent. Source attributes and centralities remain in the companion GraphML. Weighted links use inverse graph frequency, ln(N/feature event count). This hub-focused view does not test or establish a power-law degree distribution. Labels do not replace the full source records.',48,105,1200,9)
    para(c,'Sources: UCDP GED 26.1 / loaded candidate records through August 2026; source-record attribution retained per event in GraphML. Saved view: russia-ukraine-barabasi.graphml. Rebuild: python -m src.generate_viewport_poster',48,58,1200,8)
    c.showPage();c.save()
    companion=out/(SLUG+'.graphml')
    if source.resolve()!=companion.resolve():shutil.copyfile(source,companion)
    audit={'source':str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'viewport':view,'nodes':len(graph),'edges':graph.number_of_edges(),'drawn_nodes':len(xy),'drawn_edges':len(edges),'cropped_nodes':sorted(cropped),'hidden_hubs':sorted(hidden),'direct_labels':labeled,'projection':'camera inverse quaternion + perspective; saved viewport crop + uniform fit; no re-layout','projected_positions':xy}
    (out/(SLUG+'.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(f'{path}: {len(xy)} drawn nodes; {len(edges)} links; {len(labeled)} direct labels')
    return path


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--graphml',type=Path,default=DEFAULT);parser.add_argument('--out',type=Path)
    args=parser.parse_args();generate(args.graphml,args.out)
