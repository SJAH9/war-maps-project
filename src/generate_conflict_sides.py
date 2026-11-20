"""US Letter Conflict Sides atlas: current-year spiral, then every conflict-year."""
import argparse
import json
import io
import math
from functools import lru_cache
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
from src.conflict_sides import ROOT, COLORS, build, write
from src.generate_death_circle import circle_points
from src.generate_network_print import fonts, PAPER, INK, MUTED, GRID, text, para, frame
from src.publication_brand import brand


def spiral_points(n):
    outer=math.sqrt(n/math.pi)
    for i in range(n):
        r=math.sqrt((n-i)/math.pi);angle=2*math.pi*(outer-r)
        yield math.sin(angle)*r,-math.cos(angle)*r,outer


@lru_cache(maxsize=16)
def sites(n):return circle_points(n) if n else []


def marks(c,points,r,color):
    # A zero-length round-capped stroke is a vector circle. Avoid a Form
    # invocation per death, which makes dense pages unnecessarily slow to open.
    c.saveState();c.setStrokeColor(HexColor(color));c.setLineCap(1);c.setLineWidth(r*2)
    c._code.extend(f'{x:.4f} {y:.4f} m {x:.4f} {y:.4f} l S' for x,y in points)
    c.restoreState()


def base(c,page):
    c.setFillColor(PAPER);c.rect(0,0,612,792,fill=1,stroke=0)
    brand(c,350,756,12)
    text(c,'CONFLICT SIDES / WAR MAPS',32,758,10,bold=True)
    text(c,f'{page} / ONE DOT, ONE RECORDED DEATH',32,22,7,MUTED)


def printable_years(m):
    return sorted((y for y,b in m['years'].items() if int(y)>2000 and b['total']>0),key=int,reverse=True)


def page_plan(b,title_size=30):
    named=sum(b['counts'][f] for f in 'abcd')
    outside=b['counts']['civilian']+b['counts']['unknown']
    promoted=named==0
    second=outside>named and not promoted
    population=b['total'] if second or promoted else named
    points=sites(population)
    span=max((2*math.hypot(x,y) for x,y in points),default=1)
    pitch=min((440 if second else 1060)/max(span,1),title_size*.7/.62)
    widths={'civilian':900,'unknown':210};xs={'civilian':48,'unknown':1030}
    columns={'civilian':150,'unknown':40}
    if not second and not promoted and outside:
        # Preserve the poster's exterior blocks, expanding their widths for larger totals.
        if max(math.ceil(b['counts'][f]/columns[f])*pitch for f in columns)>110:
            widths['civilian']=max(210,min(930,1140*b['counts']['civilian']/outside))
            widths['unknown']=1140-widths['civilian'];xs['unknown']=48+widths['civilian']+60
        for _ in range(4):
            columns={f:max(1,min(columns[f],int(widths[f]/pitch))) for f in columns}
            if max(math.ceil(b['counts'][f]/columns[f])*pitch for f in columns)<=110:break
            columns={f:max(1,int(widths[f]/pitch)) for f in columns}
            height=max(math.ceil(b['counts'][f]/columns[f])*pitch for f in columns)
            pitch*=min(1,110/max(height,1))
    return dict(named=named,outside=outside,promoted=promoted,second=second,population=population,pitch=pitch,columns=columns,xs=xs,title_size=title_size)


def detail_colors(counts):
    palette=dict(COLORS,civilian='#777b75',unknown='#777b75')
    smaller='a' if counts['a']<=counts['b'] else 'b'
    palette[smaller]='#000000'
    palette['b' if smaller=='a' else 'a']='#ac2529'
    return palette


def year_page(c,m,year,page):
    b=m['years'][str(year)];c.setFillColor(PAPER);c.rect(0,0,612,792,fill=1,stroke=0)
    c.saveState();s=792/1728;c.translate((612-1296*s)/2,0);c.scale(s,s)
    frame(c,1296,1728,page,f'WAR MAPS / CONFLICT SIDES / {year}',compact_brand=True)
    title_size=30
    title=simpleSplit(f"{m['title'].upper()} / {year}",'WMB',title_size,840)
    while len(title)>2 and title_size>12:
        title_size-=1;title=simpleSplit(f"{m['title'].upper()} / {year}",'WMB',title_size,840)
    for i,line in enumerate(title):text(c,line,48,1640-i*34,title_size,bold=True)
    text(c,f"{b['total']:,} DEATHS",48,1570-max(0,len(title)-1)*30,53,bold=True)
    text(c,'ONE DOT / ONE DEATH',49,1538-max(0,len(title)-1)*30,14,MUTED)
    plan=page_plan(b,title_size);pitch=plan['pitch'];n=plan['named'];outside=plan['outside']
    colors=detail_colors(b['counts'])
    def draw(points,cy,color):marks(c,((648+x*pitch,cy+y*pitch) for x,y in points),pitch*.31,color)
    if plan['promoted']:
        draw(sites(b['total']),965,colors['civilian'])
        text(c,'CIVILIANS' if not b['counts']['unknown'] else 'CIVILIANS + UNKNOWN',48,390,24,bold=True)
        text(c,f"CIVILIANS / {b['counts']['civilian']:,}",48,345,22,bold=True)
        text(c,f"UNKNOWN / {b['counts']['unknown']:,}",648,345,22,bold=True)
        explanation='Civilian and unknown deaths occupy the main circle. No named-side deaths are recorded on this page.'
    else:
        points=sites(n);offset=0;order=sorted('abcd',key=lambda side:(b['counts'][side],side))
        for side in order:
            count=b['counts'][side];draw(points[offset:offset+count],1200 if plan['second'] else 965,colors[side]);offset+=count
        present=[f for f in order if b['counts'][f] or b['labels'][f]]
        for i,side in enumerate(present):
            x=48+(i%2)*600;y=(940 if plan['second'] else 390)-(i//2)*95
            c.setFillColor(HexColor(colors[side]));c.circle(x+6,y+9,5,fill=1,stroke=0)
            text(c,f"SIDE {side.upper()} / {b['counts'][side]:,}",x+22,y,22,bold=True)
            label_size=13;label='; '.join(b['labels'][side]);lines=simpleSplit(label,'WM',label_size,550)
            while len(lines)>3 and label_size>10:
                label_size-=1;lines=simpleSplit(label,'WM',label_size,550)
            for j,line in enumerate(lines):text(c,line,x+22,y-24-j*(label_size+2),label_size,MUTED)
            text(c,f"{100*b['counts'][side]/n:.2f}% OF THE {n:,} DEATHS IN THE FIRST CIRCLE",x+22,y-30-len(lines)*(label_size+2),10,MUTED)
        if plan['second']:
            draw(sites(b['total'])[n:],580,colors['civilian'])
            text(c,f'CIVILIANS + UNKNOWN / {outside:,}',48,310,22,bold=True)
            text(c,f"CIVILIANS / {b['counts']['civilian']:,}",48,275,17,bold=True)
            text(c,f"UNKNOWN / {b['counts']['unknown']:,}",648,275,17,bold=True)
            text(c,f'{n:,} SIDE DEATHS ALREADY SHOWN ABOVE / EMPTY PORTION',48,235,14,MUTED)
            explanation='Second circle: all deaths. Only civilians + unknown are drawn; the empty portion represents side deaths already drawn above. Both circles use the same dot size.'
        else:
            for f in ['civilian','unknown']:
                x=plan['xs'][f];columns=plan['columns'][f]
                text(c,f"{f.upper()} / {b['counts'][f]:,}",x,280,17,bold=True)
                marks(c,((x+(i%columns)*pitch,254-(i//columns)*pitch) for i in range(b['counts'][f])),pitch*.31,colors[f])
            explanation='Named-side deaths form the circle, smallest side at the top. Civilian and unknown deaths appear outside it at the same dot size.'
    c.setStrokeColor(GRID);c.line(48,130,1248,130)
    para(c,'Source: '+', '.join(b['sources'])+f" / {b['events']:,} records. Categories sum to the source best estimate.",48,110,1200,11,MUTED)
    para(c,explanation,48,60,1200,11,MUTED)
    c.restoreState();c.showPage()
    return {k:plan[k] for k in ('named','outside','promoted','second','population','pitch','title_size')}


def print_spiral_colors(segments):
    # Keep casualty ordering and recorded side identities; only choose the
    # print palette so the greatest-loss opening segment has a black rim.
    palette=dict(COLORS)
    if segments:
        first=segments[0]['side']
        palette[first],palette['b']=palette['b'],palette[first]
    return palette


def overview_page(c,data):
    base(c,2);text(c,f"{data['year']} / THE SPIRAL",32,704,25,bold=True)
    text(c,f"{data['side_total']:,} named-side deaths / through {data['coverage_through']}",32,675,12)
    counts={f:sum(m['years'][str(data['year'])]['counts'][f] for m in data['conflicts']) for f in ('civilian','unknown')}
    pts=list(spiral_points(data['side_total']));scale=190/(pts[0][2] if pts else 1)
    total=sum(counts.values());left=max(120,min(380,500*counts['civilian']/max(total,1)))
    widths={'civilian':left,'unknown':500-left};xs={'civilian':32,'unknown':62+left}
    for _ in range(4):
        columns={f:max(1,int(widths[f]/scale)) for f in counts}
        height=max(math.ceil(counts[f]/columns[f])*scale for f in counts)
        if height<=150:break
        scale*=150/height
    palette=print_spiral_colors(data['segments'])
    for segment in data['segments']:
        marks(c,((306+x*scale,450-y*scale) for x,y,_ in pts[segment['start']:segment['end']]),scale*.32,palette[segment['side']])
    for i,side in enumerate('abcd'):
        x=100+i*110;c.setFillColor(HexColor(palette[side]));c.setStrokeColor(INK);c.circle(x,243,3,fill=1,stroke=1)
        text(c,'Side '+side.upper(),x+9,240,9)
    for f in counts:
        x=xs[f];columns=max(1,int(widths[f]/scale))
        text(c,f"{f.upper()} / {counts[f]:,}",x,212,10,bold=True)
        marks(c,((x+i%columns*scale,195-(i//columns)*scale) for i in range(counts[f])),scale*.32,'#777b75')
    c.showPage()


def generate(year=None,web_only=False):
    data=build(year);write(data)
    if web_only:return data
    fonts();out=ROOT/'outputs/print/war-maps-conflict-sides-atlas.pdf';out.parent.mkdir(exist_ok=True)
    buffer=io.BytesIO()
    c=canvas.Canvas(buffer,pagesize=(612,792),pageCompression=1,invariant=1)
    c.setTitle('War Maps / Conflict Sides / '+str(data['year']));c.setAuthor('The War Maps Project')
    base(c,1);text(c,'CONFLICT SIDES',32,680,35,bold=True)
    text(c,f"{data['year']} / {data['total']:,} DEATHS",32,632,24,bold=True)
    para(c,f"{len(data['conflicts']):,} conflicts with recorded activity in {data['year']}. Current-year coverage through {data['coverage_through']}. One dot represents one death.",32,590,540,12)
    para(c,'The opening spiral holds current-year named-side deaths in one clockwise line, from the outer top edge inward. It begins with the side with the greatest loss, shown in black, followed by its opposing side. Each conflict’s sides stay together; conflicts follow their largest side loss. Civilian and unknown deaths appear in separate blocks below the spiral.',32,506,540,12)
    para(c,'The following pages preserve the death-circle poster design: sides ordered from the fewest deaths at the top, with the smaller side black and the larger side red. Civilian-only pages use the main circle. The overview spiral has its own black-and-white side legend, with gray shades for additional sides. C and D are used only when recorded; the available UCDP records provide A and B.',32,402,540,12)
    para(c,'Uppsala Conflict Data Program / GED 26.1 and loaded candidate releases. Latest revisions replace earlier records with the same event ID. Annual conflict tables are not added to event death totals. All death fields reconcile to the source best estimate. This print atlas includes only years after 2000 (2001 onward) with at least one recorded death. Website history is unchanged.',32,270,540,11)
    para(c,'When civilian + unknown deaths exceed side deaths, a second circle is sized for all deaths; only civilian + unknown dots are drawn in it. Side deaths already drawn occupy its empty portion. Dot diameter never exceeds title text height.',32,170,540,10)
    para(c,'Use the PDF bookmarks to navigate conflicts. On the website, select any overview dot or conflict name to open its circle, with All years selected by default. Source data and source attribution: https://ucdp.uu.se/downloads/',32,90,540,10)
    c.linkURL('https://ucdp.uu.se/downloads/',(32,30,580,90));c.showPage()
    overview_page(c,data);page=3;index=[]
    for m in data['conflicts']:
        years=printable_years(m)
        if not years:continue
        index.append(dict(conflict=m['id'],title=m['title'],first_page=page,years=[]))
        for i,y in enumerate(years):
            bookmark=f"{m['id']}-{y}";c.bookmarkPage(bookmark)
            if i==0:c.addOutlineEntry(m['title'],bookmark,level=0,closed=True)
            c.addOutlineEntry(y,bookmark,level=1)
            index[-1]['years'].append(dict(year=int(y),page=page,total=m['years'][y]['total']))
            audit=year_page(c,m,y,page);index[-1]['years'][-1].update(audit);page+=1
    c.save()
    pending=out.with_suffix('.building.pdf');pending.write_bytes(buffer.getvalue());pending.replace(out)
    (out.with_suffix('.json')).write_text(json.dumps(dict(year=data['year'],coverage_through=data['coverage_through'],pages=page-1,total=data['total'],first_year=2001,exclude_zero_deaths=True,sources=data['sources'],index=index),ensure_ascii=False,indent=2)+'\n')
    print(out,page-1,'pages',flush=True);return data


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--year',type=int);p.add_argument('--web-only',action='store_true');args=p.parse_args()
    generate(args.year,args.web_only)
