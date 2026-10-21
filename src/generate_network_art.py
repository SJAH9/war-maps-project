"""Afterimages: a curated, reproducible composition of human-selected GraphML views.

This is an artwork, not an independently derived network-science layout.
"""
import hashlib
import json
import math
from pathlib import Path

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.generate_viewport_poster import project, ROOT
from src.generate_network_print import fonts, text, para

SLUG='war-maps-afterimages-art-poster'
INPUT=ROOT/'data/curated/network-views'
LAYERS=[
    dict(file='russia-ukraine-lattice-14.graphml',name='Lattice (14)',angle=-18,box=(-40,865,1376,720),ink='#d6ac78'),
    dict(file='russia-ukraine-lattice-7.graphml',name='Lattice (7)',angle=12,box=(-65,570,1426,650),ink='#83c6c3'),
    dict(file='russia-ukraine-third-party-3.graphml',name='Third-party (3)',angle=68,box=(-35,325,1366,660),ink='#a0a7e0'),
]


def transformed(graph,view,layer):
    xy,_=project(graph,view,(0,0,1200,1200))
    a=math.radians(layer['angle']);co,si=math.cos(a),math.sin(a)
    rotated={n:(co*x-si*y,si*x+co*y) for n,(x,y) in xy.items()}
    xs,ys=zip(*rotated.values());left,bottom,width,height=layer['box']
    scale=min(width/(max(xs)-min(xs)),height/(max(ys)-min(ys)))
    cx=(max(xs)+min(xs))/2;cy=(max(ys)+min(ys))/2
    return {n:(left+width/2+(p[0]-cx)*scale,bottom+height/2+(p[1]-cy)*scale) for n,p in rotated.items()}


def memorial_points(graph,layers):
    """Place one 300-dpi square per death along existing event-edge textures."""
    occupied=set();points=[];records=[];pitch=.48
    offsets=sorted(((x,y) for x in range(-100,101) for y in range(-100,101)),key=lambda p:(p[0]**2+p[1]**2,p))
    segments=[]
    for layer in layers:
        xy=layer['art_positions']
        for a,b in sorted(graph.edges()):
            if a in xy and b in xy:segments.append((xy[a],xy[b]))
    for node,d in sorted(graph.nodes(data=True)):
        if d.get('kind')!='event':continue
        r=json.loads(d['source_record']);count=int(r['best'])
        if count<0:raise ValueError('Negative death count')
        if not count:continue
        start=len(points)
        phase=int(hashlib.sha256(node.encode()).hexdigest()[:8],16)/2**32
        for i in range(count):
            index=len(points)
            a,b=segments[int(((index+1)*.7548776662466927)%1*len(segments))]
            t=(phase+(i+1)*.6180339887498949)%1
            x=a[0]+t*(b[0]-a[0]);y=a[1]+t*(b[1]-a[1])
            cx=round(min(1294,max(2,x))/pitch);cy=round(min(1588,max(302,y))/pitch)
            for dx,dy in offsets:
                cell=(cx+dx,cy+dy);px,py=cell[0]*pitch,cell[1]*pitch
                if cell not in occupied and 1<px<1295 and 301<py<1589:
                    occupied.add(cell);points.append((px,py));break
            else:raise ValueError('No separated memorial slot available')
        records.append(dict(node=node,source_id=r['id'],deaths=count,point_range=[start,len(points)]))
    return dict(points=points,records=records,count=len(points),square_size_pt=.24,
                note='One square per unit of source best death estimate, once across all views. Distributed across original edge textures, not assigned to event positions; a collective memorial, not a mortality density map.')


def edge_counts(graph):
    from src.generate_memorial_echoes import death_groups
    counts=[death_groups(json.loads(d['source_record'])) for _,d in graph.nodes(data=True) if d.get('kind')=='event']
    return dict(ukrainian_side_deaths=sum(r.get('ukrainian_side',0) for r in counts),
                russian_side_deaths=sum(r.get('russian_side',0) for r in counts))


def border_cells(red_count,black_count):
    red=[]
    for inset in (3,5):
        left,top=inset,inset;right,bottom=5399-inset,7199-inset
        red.extend((x,top) for x in range(left,right+1))
        red.extend((right,y) for y in range(top+1,bottom+1))
        red.extend((x,bottom) for x in range(right-1,left-1,-1))
        red.extend((left,y) for y in range(bottom-1,top,-1))
    cap=red_count-len(red)
    if cap<0 or 4+black_count+cap>=7195:raise ValueError('Counts do not fit this border design')
    black=[(4,y) for y in range(4,4+black_count)]
    red.extend((4,y) for y in range(4+black_count,4+black_count+cap))
    return red,black,cap


def needle_cells():
    # Center the odd-length run to within half a raster cell on the page.
    # All marks remain distinct cells; the divider is restored uninterrupted.
    black=[(x,4) for x in range(27,5372)]
    red=[(x,4) for x in list(range(14,27))+list(range(5372,5385))]
    red.append((2700,7195))
    shaft=[(x,458) for x in range(258,5142)]
    return black,shaft,red


def cloud_echoes(graph,memorial):
    """Translate recorded-side subsets without changing the memorial geometry."""
    from src.generate_memorial_echoes import death_groups
    indices={'russian_side':[],'ukrainian_side':[]}
    for record in memorial['records']:
        groups=death_groups(json.loads(graph.nodes[record['node']]['source_record']))
        start,end=record['point_range']
        if sum(groups.values())!=end-start:raise ValueError('Memorial range does not match source')
        for side in ('russian_side','ukrainian_side'):
            indices[side].extend(range(start,start+groups[side]))
            start+=groups[side]
    # Half-grid translations keep these pixel squares from covering white ones.
    return [dict(side=side,colour=colour,offset_pt=offset,count=len(indices[side]),
                 source_point_indices=indices[side])
            for side,colour,offset in [('russian_side','#ff32da',(.24,-12)),
                                       ('ukrainian_side','#20cbd4',(0,4.56))]]


def generate(out=None,memorial=False,nation_pixels=False,edge_pixels=False,double_border=False,needle=False,pixels_only=False,echoes=False):
    if echoes:pixels_only=True
    if pixels_only:needle=True
    if needle:double_border=True
    memorial=memorial or nation_pixels or edge_pixels or double_border
    if edge_pixels or double_border:nation_pixels=False
    if double_border:edge_pixels=False
    out=Path(out or ROOT/'outputs/print');out.mkdir(parents=True,exist_ok=True);fonts()
    slug=SLUG+('-white-memorial' if memorial else '')
    if nation_pixels:slug+='-two-nations'
    if edge_pixels:slug+='-top-pixel-strip'
    if double_border:slug+='-double-border'
    if needle:slug+='-deco-needle'
    if pixels_only:slug+='-pixels-only'
    if echoes:slug+='-side-echoes'
    c=canvas.Canvas(str(out/(slug+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle('Afterimages / A War Maps View Study')
    c.setAuthor('Sid J. A. Hubbard; AI-assisted composition and rendering with OpenAI Codex')
    c.setSubject('Curated artwork from three saved views of the same recorded conflict-event network; not a causal or geographic map')
    # A restrained ink ground; no invented graph marks or decorative connections.
    background='#000000' if echoes else '#080f18'
    c.setFillColor(HexColor(background));c.rect(0,0,1296,1728,fill=1,stroke=0)
    pale=HexColor('#e7e6dc');muted=HexColor('#a1aaa9')
    text(c,'THE WAR MAPS PROJECT',62,1662,12,pale,True)
    text(c,'A HUMAN / MACHINE VIEW STUDY',62,1640,8,muted)
    text(c,'01',1193,1657,24,pale)
    if not needle:
        c.setStrokeColor(HexColor('#4a595d'));c.setLineWidth(.5);c.line(62,1618,1234,1618)
    audits=[]
    c.saveState();clip=c.beginPath();clip.rect(0,300,1296,1290);c.clipPath(clip,stroke=0,fill=0)
    baseline=None
    for layer in LAYERS:
        source=INPUT/layer['file'];g=nx.read_graphml(source);view=json.loads(g.graph['viewport'])
        signature=(set(g),{frozenset(e) for e in g.edges()})
        if baseline is None:baseline=signature
        elif signature!=baseline:raise ValueError('Art layers must be views of the same underlying graph')
        xy=transformed(g,view,layer)
        hidden={n for n in g if len(set(g[n])-{n})/max(1,len(g)-1)>.6} if view.get('hideHighDegreeLinks') else set()
        edges=[(a,b,d) for a,b,d in g.edges(data=True) if a in xy and b in xy and a not in hidden and b not in hidden]
        maxweight=max(float(d.get('weight',1)) for _,_,d in edges)
        # Every line is an original edge. Overlaid layers share no new edges.
        c.setStrokeColor(HexColor(layer['ink']));c.setStrokeAlpha(0 if pixels_only else .19)
        for a,b,d in edges:
            c.setLineWidth(.18+.34*float(d.get('weight',1))/maxweight)
            c.line(*xy[a],*xy[b])
        c.setFillColor(HexColor(layer['ink']));c.setFillAlpha(0 if pixels_only else .66)
        for n,(x,y) in xy.items():
            kind=g.nodes[n].get('kind');radius=.6 if kind=='event' else .85+min(2.8,math.sqrt(g.degree(n))*.15)
            c.circle(x,y,radius,fill=1,stroke=0)
        audits.append(dict(**layer,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                           source_path=str(source.relative_to(ROOT)),camera=view,projected_nodes=len(xy),
                           drawn_edges=len(edges),cropped_nodes=sorted(set(g)-set(xy)),
                           hidden_hubs=sorted(hidden),art_positions=xy))
    c.restoreState()
    memorial_audit=memorial_points(g,audits) if memorial else None
    echo_audit=cloud_echoes(g,memorial_audit) if echoes else None
    if echo_audit:
        for echo in echo_audit:
            c.saveState();c.setFillAlpha(1);c.setFillColor(HexColor(echo['colour']));p=c.beginPath()
            dx,dy=echo['offset_pt']
            for index in echo['source_point_indices']:
                x,y=memorial_audit['points'][index]
                p.rect(x+dx-.12,y+dy-.12,.24,.24)
            c.drawPath(p,fill=1,stroke=0);c.restoreState()
    if memorial_audit:
        c.saveState();c.setFillAlpha(1);c.setFillColor(HexColor('#ffffff'));p=c.beginPath()
        for x,y in memorial_audit['points']:p.rect(x-.12,y-.12,.24,.24)
        c.drawPath(p,fill=1,stroke=0);c.restoreState()
    nation_marks=[]
    if nation_pixels:
        occupied={(round(x/.48),round(y/.48)) for x,y in memorial_audit['points']}
        for nation,colour,target in [('Russia','#8f1825',(600,1200)),('Ukraine','#000000',(630,1190))]:
            cx,cy=(round(v/.48) for v in target)
            offsets=sorted(((x,y) for x in range(-100,101) for y in range(-100,101)),key=lambda p:(p[0]**2+p[1]**2,p))
            cell=next((cx+dx,cy+dy) for dx,dy in offsets if all((cx+dx+ox,cy+dy+oy) not in occupied for ox in range(-3,4) for oy in range(-3,4)))
            occupied.add(cell);x,y=(v*.48 for v in cell)
            c.saveState();c.setFillAlpha(1);c.setFillColor(HexColor(colour));c.rect(x-1.2,y-1.2,2.4,2.4,fill=1,stroke=0);c.restoreState()
            nation_marks.append(dict(nation=nation,colour=colour,x=x,y=y,size_pt=2.4,meaning='Symbolic nation mark, not an additional death'))
    text(c,'A F T E R I M A G E S',58,235,55,pale,True)
    text(c,'No mark contains the life it touches.',62,202,15,HexColor('#c7c9c5'))
    c.setStrokeColor(HexColor('#4a595d'));c.setLineWidth(.5);c.line(62,178,1234,178)
    caption=(f"{memorial_audit['count']:,} pure-white squares, one for each death in the UCDP event records. Each death appears once across the three views. The memorial follows the original network textures. Counts sum the UCDP best field." if memorial else 'Three perspectives on one Russia-Ukraine event network. Nodes represent recorded events and shared attributes. The artwork layers three saved views of the same network.')
    para(c,caption,62,159,700,9,muted)
    para(c,'Visual exploration & saved viewpoints: Sid J. A. Hubbard.\nAI-assisted composition & rendering: OpenAI Codex.\nSource data: UCDP GED 26.1 / loaded candidate records through August 2026; record-level attribution retained in GraphML.',815,159,419,9,muted)
    text(c,'CURATED DATA ART / LATTICE (14) + LATTICE (7) + THIRD-PARTY (3)',62,62,8,muted)
    text(c,'18 x 24 IN / VECTOR EDITION',1028,62,8,muted)
    edge_audit=None
    if edge_pixels:
        counts=edge_counts(g);size=.24
        columns=5400;cursor=0
        edge_audit=dict(counts=counts,pixel_size_pt=size,pixel_reference_dpi=300,columns=columns,order='left to right, top to bottom; red then black',runs=[])
        for key,colour in [('russian_side_deaths','#8f1825'),('ukrainian_side_deaths','#000000')]:
            count=counts[key]
            c.saveState();c.setFillAlpha(1);c.setFillColor(HexColor(colour));p=c.beginPath()
            for i in range(cursor,cursor+count):
                row,col=divmod(i,columns)
                p.rect(col*size,1728-(row+1)*size,size,size)
            c.drawPath(p,fill=1,stroke=0);c.restoreState()
            edge_audit['runs'].append(dict(metric=key,count=count,colour=colour,start_index=cursor,end_index=cursor+count))
            cursor+=count
        edge_audit['rows']=math.ceil(cursor/columns)
        text(c,f"TOP PIXELS / {counts['russian_side_deaths']:,} Russian-side deaths in red, then {counts['ukrainian_side_deaths']:,} Ukrainian-side deaths in black / one pixel per death",62,88,8,muted)
    if double_border:
        counts=edge_counts(g);red,black,cap=border_cells(counts['russian_side_deaths'],counts['ukrainian_side_deaths'])
        if needle:
            black,shaft,tip=needle_cells()
            if len(black)!=counts['ukrainian_side_deaths'] or len(tip)!=cap:raise ValueError('Needle geometry requires the preserved source counts')
            red=red[:-cap]+tip
            c.saveState();c.setFillColor(pale);p=c.beginPath()
            for x,y in shaft:p.rect(x*.24,1728-(y+1)*.24,.24,.24)
            c.drawPath(p,fill=1,stroke=0);c.restoreState()
        for cells,colour in [(red,'#8f1825'),(black,'#000000')]:
            if echoes and colour=='#000000':continue
            c.saveState();c.setFillAlpha(1);c.setFillColor(HexColor(colour));p=c.beginPath()
            for x,y in cells:p.rect(x*.24,1728-(y+1)*.24,.24,.24)
            c.drawPath(p,fill=1,stroke=0);c.restoreState()
        edge_audit=dict(counts=counts,pixel_size_pt=.24,pixel_reference_dpi=300,insets_px=[3,5],
                        black_column_px=4,black_start_row_px=4,black_end_row_px=3+len(black),
                        red_cap_pixels=cap,red_cap_start_row_px=4+len(black),
                        red_pixels=len(red),black_pixels=len(black))
        if needle:
            edge_audit=dict(counts=counts,pixel_size_pt=.24,pixel_reference_dpi=300,insets_px=[3,5],
                            red_border_pixels=50328,red_tip_pixels=tip,black_needle_pixels=black,
                            decorative_shaft_pixels=shaft,shaft_colour='#e7e6dc',red_pixels=len(red),black_pixels=len(black))
        if not needle:
            text(c,f"BORDER / {len(red):,} Russian-side deaths in red / {len(black):,} Ukrainian-side deaths in black / one pixel per death",62,88,8,muted)
    c.showPage();c.save()
    audit={'title':'Afterimages','classification':'Curated data artwork, not a scientific network layout',
           'authorship':{'visual_exploration':'Sid J. A. Hubbard','composition_rendering':'AI-assisted with OpenAI Codex'},
           'source_nodes':len(baseline[0]),'source_edges':len(baseline[1]),'layers':audits,
           'disclosure':'Same graph repeated. Camera crops plus artistic rotation, scaling, colour and compositing. No new edges. Additional art-area clipping disclosed by page bounds.',
           'rebuild':'python -m src.generate_network_art'+(' --needle' if needle else ' --double-border' if double_border else ' --edge-pixels' if edge_pixels else ' --nation-pixels' if nation_pixels else ' --memorial' if memorial else '')}
    if memorial_audit:audit['memorial']=memorial_audit
    if pixels_only:
        audit['network_graphs_visible']=False
        audit['rebuild']='python -m src.generate_network_art --pixels-only'
    if echo_audit:
        audit['background']=background
        audit['side_echoes']=echo_audit
        audit['rebuild']='python -m src.generate_network_art --echoes'
        edge_audit['black_frame_pixels_visible']=False
    if nation_marks:audit['nation_pixels']=nation_marks
    if edge_audit:audit['edge_pixels']=edge_audit
    (out/(slug+'.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(out/(slug+'.pdf'))


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--memorial',action='store_true')
    parser.add_argument('--nation-pixels',action='store_true');parser.add_argument('--edge-pixels',action='store_true');parser.add_argument('--double-border',action='store_true');parser.add_argument('--needle',action='store_true');parser.add_argument('--pixels-only',action='store_true');parser.add_argument('--echoes',action='store_true');args=parser.parse_args()
    generate(memorial=args.memorial,nation_pixels=args.nation_pixels,edge_pixels=args.edge_pixels,double_border=args.double_border,needle=args.needle,pixels_only=args.pixels_only,echoes=args.echoes)
