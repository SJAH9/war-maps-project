"""Count-exact 2026 Russia-Ukraine mortality circle, in the War Maps print style."""
import hashlib
import json
import math
import csv
import io
import zipfile
from collections import Counter

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.generate_network_print import ROOT, fonts, frame, text, para, INK, MUTED, GRID
from src.generate_memorial_echoes import death_groups

SOURCE=ROOT/'data/curated/network-views/russia-ukraine-lattice-14.graphml'
SLUG='war-maps-russia-ukraine-deaths-2026-circle'


def circle_points(count):
    """Select exactly count nearest hex-lattice sites, ordered top to bottom."""
    radius=math.ceil(math.sqrt(count*math.sqrt(3)/(2*math.pi)))+3
    sites=[(col+.5*(row%2),row*math.sqrt(3)/2)
           for row in range(-2*radius,2*radius+1)
           for col in range(-radius,radius+1)]
    selected=sorted(sites,key=lambda p:(p[0]**2+p[1]**2,p[1],p[0]))[:count]
    return sorted(selected,key=lambda p:(-p[1],p[0]))


def source_rows(year):
    if year==2026:
        g=nx.read_graphml(SOURCE)
        return SOURCE,[json.loads(d['source_record']) for _,d in sorted(g.nodes(data=True)) if d.get('kind')=='event']
    source=ROOT/'data/raw/ged261-csv.zip'
    with zipfile.ZipFile(source) as z:
        name=next(n for n in z.namelist() if n.endswith('.csv'))
        rows=[r for r in csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig'))
              if int(r['year'])==year and r['conflict_name']=='Russia - Ukraine'
              and r['side_a']=='Government of Russia (Soviet Union)' and r['side_b']=='Government of Ukraine']
    return source,rows


def generate(year=2026):
    source,rows=source_rows(year);totals=Counter();records=[];seen=set()
    for r in rows:
        if int(r['year'])!=year:continue
        if r['id'] in seen:raise ValueError('Duplicate source event')
        seen.add(r['id']);groups=death_groups(r);totals.update(groups)
        totals['civilian']+=int(r['deaths_civilians'])
        totals['unknown']+=int(r['deaths_unknown'])
        records.append(r)
    uk=totals['ukrainian_side'];ru=totals['russian_side'];circle_count=uk+ru
    other=totals['unattributed'];total=circle_count+other
    if other!=totals['civilian']+totals['unknown']:raise ValueError('Unmapped side deaths')
    if total!=sum(int(r['best']) for r in records):raise ValueError('Totals do not reconcile')
    points=circle_points(circle_count)
    pitch=1100/(max(x for x,y in points)-min(x for x,y in points))
    points=[(648+x*pitch,955+y*pitch) for x,y in points]
    radius=pitch*.31
    out=ROOT/'outputs/print';out.mkdir(parents=True,exist_ok=True);fonts()
    slug=SLUG.replace('2026',str(year))
    pdf=out/(slug+'.pdf');c=canvas.Canvas(str(pdf),pagesize=(1296,1728),pageCompression=1,invariant=1)
    c.setTitle(f'Russia-Ukraine / {year} / One dot, one death')
    c.setAuthor('War Maps Project')
    frame(c,1296,1728,1,f'WAR MAPS / RUSSIA-UKRAINE / {year} / MORTALITY',compact_brand=True)
    text(c,f'RUSSIA-UKRAINE / {year}',48,1640,32,bold=True)
    text(c,f'{total:,} DEATHS',48,1570,53,bold=True)
    text(c,'ONE DOT / ONE DEATH',49,1538,14,MUTED)
    red=HexColor('#ac2529');black=HexColor('#000000');gray=HexColor('#777b75')
    for subset,color in ((points[:uk],black),(points[uk:],red)):
        c.setFillColor(color);p=c.beginPath()
        for x,y in subset:p.circle(x,y,radius)
        c.drawPath(p,fill=1,stroke=0)
    # Fixed dot size and pitch also apply to deaths outside the two-side circle.
    exterior=[]
    for count,start_x,top,columns in ((totals['civilian'],48,268,150),(totals['unknown'],1030,268,40)):
        positions=[(start_x+(i%columns)*pitch,top-(i//columns)*pitch) for i in range(count)]
        exterior.append(positions);c.setFillColor(gray);p=c.beginPath()
        for x,y in positions:p.circle(x,y,radius)
        c.drawPath(p,fill=1,stroke=0)
    for x,color,label,value in [(48,black,'UKRAINIAN SIDE',uk),(648,red,'RUSSIAN SIDE',ru)]:
        c.setFillColor(color);c.circle(x+6,366,5,fill=1,stroke=0)
        text(c,f'{label} / {value:,}',x+22,357,22,bold=True)
        text(c,f'{value/circle_count:.2%} OF THE {circle_count:,} DEATHS IN THE CIRCLE',x+22,333,10,MUTED)
    text(c,f'CIVILIANS / {totals["civilian"]:,}',48,294,19,bold=True)
    text(c,f'UNKNOWN SIDE / {totals["unknown"]:,}',1030,294,17,bold=True)
    c.setStrokeColor(GRID);c.line(48,165,1248,165)
    coverage='UCDP 2026 candidate event records, January-August 2026' if year==2026 else f'UCDP GED 26.1, January-December {year}'
    para(c,f'Source: {coverage}. Counts sum the source best, deaths_a, deaths_b, deaths_civilians and deaths_unknown fields. Side labels follow the source records.',48,145,1200,11,MUTED)
    para(c,'The circle contains recorded Russian-side and Ukrainian-side deaths. Civilian and unknown-side deaths appear outside the circle at the same dot size. All dots are individually drawn vectors.',48,88,1200,11,MUTED)
    c.showPage();c.save()
    audit=dict(year=year,source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
               total=total,circle_total=circle_count,counts=dict(totals),dot_radius_pt=radius,
               circle_points=points,ukrainian_point_range=[0,uk],russian_point_range=[uk,circle_count],
               civilian_points=exterior[0],unknown_points=exterior[1],records=records,
               rebuild=f'python -m src.generate_death_circle --year {year}')
    (out/(slug+'.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(pdf)


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--year',type=int,choices=(2024,2025,2026));args=p.parse_args()
    for year in ([args.year] if args.year else [2024,2025,2026]):generate(year)
