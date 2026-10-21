"""Observed side / place / date-interval networks, with auditable centralities."""
import gzip
import json
import math
import re
from collections import Counter

import networkx as nx
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

from src.conflict_networks import ROOT, event_rows, active_in, key
from src.generate_event_network_print import compile_events, mortality
from src.generate_network_print import fonts, frame, text, para, INK, MUTED, ORANGE, PAPER

METHODS={'Drone':r'\b(?:drone|uav)s?\b','Missile':r'\bmissiles?\b',
         'Airstrike':r'\b(?:airstrikes?|air strikes?|aerial bombardment)\b',
         'Shelling / artillery':r'\b(?:shelling|artillery|mortar)s?\b',
         'Shooting':r'\b(?:shooting|shot|gunfire)\b','Explosion / bombing':r'\b(?:explosion|bombing|bomb)s?\b'}


def model(rows):
    g=nx.Graph();records=[];places={};counts=Counter()
    for row in sorted(rows,key=lambda r:r['id']):
        country=row.get('country','').strip()
        location=' / '.join(v for v in (country,row.get('adm_1','').strip(),row.get('where_coordinates','').strip()) if v)
        location=location or 'Unspecified location'
        # Preserve source precision; no coordinate snapping or inferred day.
        p='place:'+location
        interval=row['date_start'][:10]+' / '+(row.get('date_end') or row['date_start'])[:10]
        d='interval:'+json.dumps([location,interval,row.get('where_prec',''),row.get('date_prec','')])
        g.add_node(p,kind='place',label=location)
        if d not in g:g.add_node(d,kind='interval',label=location+' / '+interval,events=0,fatal=False)
        g.nodes[d]['events']+=1;g.nodes[d]['fatal'] |= (mortality(row) or 0)>0
        places[d]=p
        sides=sorted({row.get(f,'').strip() for f in ('side_a','side_b')} - {''})
        endpoints=[p]
        for side in sides:
            n='side:'+side
            g.add_node(n,kind='side',label=side);endpoints.append(n)
        for n in endpoints:
            if not g.has_edge(d,n):g.add_edge(d,n,events=0)
            g[d][n]['events']+=1
        headline=row.get('source_headline','')
        tags=[name for name,pattern in METHODS.items() if re.search(pattern,headline,re.I)]
        counts.update(tags or ['No matched term'])
        records.append(dict(row,graph_interval_node=d,headline_method_indicators=tags))
    between=nx.betweenness_centrality(g,normalized=True,weight=None)
    degree=nx.degree_centrality(g)
    for n in g:g.nodes[n].update(degree=g.degree(n),degree_centrality=degree[n],betweenness=between[n])
    return dict(graph=g,records=records,places=places,methods=dict(counts),
                betweenness_method='exact all-source calculation')


def layout(m):
    g=m['graph'];h=nx.Graph()
    for n in sorted(g):
        if g.nodes[n]['kind']!='interval':h.add_node(n)
    for d,p in m['places'].items():
        for n in g[d]:
            if g.nodes[n]['kind']=='side':h.add_edge(n,p)
    # Dense deterministic solver avoids an optional SciPy runtime dependency.
    coords=nx.drawing.layout._fruchterman_reingold(nx.to_numpy_array(h,weight=None),iterations=60,seed=2026)
    coords=nx.rescale_layout(coords)
    pos=dict(zip(h,coords))
    # Scale the hub projection, then distribute all interval nodes around places.
    xy={n:(648+float(v[0])*510,1050+float(v[1])*430) for n,v in pos.items()}
    sides=sorted(n for n in h if g.nodes[n]['kind']=='side')
    for i,a in enumerate(sides):
        for b in sides[i+1:]:
            ax,ay=xy[a];bx,by=xy[b]
            if math.hypot(ax-bx,ay-by)<70:
                mx,my=(ax+bx)/2,(ay+by)/2
                xy[a]=(mx-48,my);xy[b]=(mx+48,my)
    for p in sorted(set(m['places'].values())):
        ds=sorted(d for d in g[p] if g.nodes[d]['kind']=='interval')
        for i,d in enumerate(ds):
            angle=i*math.pi*(3-math.sqrt(5));radius=8+min(54,7*math.sqrt(len(ds)))*math.sqrt((i+.5)/len(ds))
            xy[d]=(xy[p][0]+radius*math.cos(angle),xy[p][1]+radius*math.sin(angle))
    return xy


def render(m,title,slug,out,selection):
    g=m['graph'];xy=layout(m)
    c=canvas.Canvas(str(out/(slug+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
    frame(c,1296,1728,1,'WAR MAPS / EVENT HUBS / 2026 / 18 x 24 IN')
    text(c,'HUBS, SIDES & EVENT STRUCTURE',48,1640,20,ORANGE,True)
    text(c,title,48,1595,29,INK,True)
    text(c,f"{len(m['records']):,} events / {len(g):,} nodes / {g.number_of_edges():,} links / loaded 2026 records",48,1563,13,MUTED)
    ranked=sorted(g,key=lambda n:(-g.nodes[n]['betweenness'],-g.degree(n),n))
    labels=ranked[:8];numbers={n:i for i,n in enumerate(labels,1)}
    c.setStrokeColor(HexColor('#7d918b'));c.setStrokeAlpha(.22);c.setLineWidth(.32)
    for a,b in g.edges():c.line(*xy[a],*xy[b])
    c.setStrokeAlpha(1)
    for n in sorted(g,key=lambda n:g.degree(n)):
        d=g.nodes[n];x,y=xy[n];r=1.7+min(23,1.2*math.sqrt(g.degree(n)))
        color='#687742' if d['kind']=='side' else '#3c8994' if d['kind']=='place' else '#b8312c' if d['fatal'] else '#959889'
        c.setFillColor(HexColor(color));c.setStrokeColor(ORANGE);c.setLineWidth(.25+4*math.sqrt(d['betweenness']))
        if d['kind']=='place':c.rect(x-r,y-r,2*r,2*r,fill=1,stroke=1)
        elif d['kind']=='side':
            p=c.beginPath();p.moveTo(x,y+r);p.lineTo(x-r,y-r);p.lineTo(x+r,y-r);p.close();c.drawPath(p,fill=1,stroke=1)
        else:c.circle(x,y,r,fill=1,stroke=1)
        if n in numbers:
            c.setFillColor(PAPER);c.circle(x,y,7,fill=1,stroke=0)
            text(c,numbers[n],x-3,y-3,8,INK,True)
    text(c,'NETWORK KEY',48,570,12,ORANGE,True)
    para(c,'Olive triangle: coded side. Teal square: recorded place. Small circle: place + date interval (precision retained). Red: at least one fatal event in that interval. Node size grows with degree; orange border grows with betweenness. Numbers identify the eight highest-betweenness nodes below. Layout is not a map.',48,551,1200,10)
    text(c,'HUB REGISTER / DEGREE / NORMALIZED DEGREE / BETWEENNESS',48,500,11,ORANGE,True)
    for i,n in enumerate(labels):
        d=g.nodes[n];label=d['label']
        if len(label)>92:label=label[:89]+'...'
        text(c,f"{i+1:02} {label}",48,480-i*18,9)
        text(c,f"{d['degree']:>5}    {d['degree_centrality']:.4f}    {d['betweenness']:.4f}",810,480-i*18,9)
    # Empirical degree distribution (log-log), not a power-law fit.
    freq=Counter(dict(g.degree()).values());x0,y0,w,h=1030,362,205,120
    c.setStrokeColor(MUTED);c.setLineWidth(.5);c.line(x0,y0,x0+w,y0);c.line(x0,y0,x0,y0+h)
    for k,count in sorted(freq.items()):
        x=x0+math.log10(max(1,k))/max(1,math.log10(max(freq)))*w
        y=y0+math.log10(count)/max(1,math.log10(max(freq.values())))*h
        c.setFillColor(ORANGE);c.circle(x,y,2.5,fill=1,stroke=0)
    text(c,'degree k (log)',x0+45,y0-15,8);text(c,'node count (log)',x0,y0+h+8,8)
    text(c,'1',x0-3,y0-8,6);text(c,str(max(freq)),x0+w-15,y0-8,6)
    text(c,str(max(freq.values())),x0-24,y0+h-3,6)
    text(c,'SIDES / SOURCE-HEADLINE METHOD INDICATORS',48,310,11,ORANGE,True)
    side_names=sorted(d['label'] for _,d in g.nodes(data=True) if d['kind']=='side')
    y=para(c,'Sides: '+'; '.join(side_names)+'.',48,293,1200,10)
    y=para(c,'Headline terms (nonexclusive event counts): '+'; '.join(f'{k}: {v:,}' for k,v in sorted(m['methods'].items()))+'. No structured weapon/method field exists in these inputs; a headline mention is not a confirmed method assignment.',48,y-8,1200,10)
    y=para(c,f"READING HUB INFLUENCE  Degree counts distinct neighbors; degree centrality = degree/(N-1). Betweenness measures the fraction of shortest paths passing through a node ({m['betweenness_method']}, unweighted, undirected). Sides connect to their recorded place/interval nodes; place hubs connect repeated intervals. Centrality reflects this data model, not command, responsibility or causal influence. No scale-free claim; small-node overlap can require zoom.",48,y-10,1200,9)
    leader=ranked[0];d=g.nodes[leader]
    para(c,f"WHAT THE GRAPH REVEALS  {d['label']} connects to {d['degree']:,} distinct neighbors and has normalized betweenness {d['betweenness']:.4f}. Large side hubs expose repeated participation across dates and places; teal hubs reveal geographic recurrence. Shared locations can connect otherwise separate coded sides, but that connection does not establish coordination or an alliance.",48,y-12,1200,10)
    para(c,'Source: UCDP GED 26.1 and candidate releases through August 2026; latest event ID revision retained. '+selection+' All event rows, precision, source headlines, endpoints and node metrics are in the companion JSON. Method: observed incidence network; Barabasi, Network Science, graph measures.',48,76,1200,8)
    c.showPage();c.save()
    audit={'title':title,'selection':selection,'betweenness_method':m['betweenness_method'],
           'edge_rule':'Each location/date-interval node connects to its coded sides and recorded place. No motive or causal edges.',
           'methods':m['methods'],'events':m['records'],'nodes':[dict(id=n,**d) for n,d in g.nodes(data=True)],
           'edges':[dict(source=a,target=b,**d) for a,b,d in g.edges(data=True)]}
    with (out/(slug+'.json.gz')).open('wb') as f:
        with gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0) as z:z.write(json.dumps(audit,ensure_ascii=False).encode())
    print(slug,len(m['records']),len(g),flush=True)


def generate(out=None,russia_only=False):
    out=out or ROOT/'outputs/print';out.mkdir(parents=True,exist_ok=True);fonts()
    rows=[r for r in event_rows() if active_in(r,2026)]
    groups=compile_events(rows,2026)
    # Stable conflict IDs: do not silently change subjects when rankings change.
    specs=[('Russia - Ukraine',{('1','13243')},'russia-ukraine'),
           ('Palestine + Southern Lebanon',{('1','234'),('1','426')},'palestine-southern-lebanon')]
    excluded=[g for g in groups if tuple(g['key']) in {('2','107'),('2','35')}]
    for title,keys,slug in specs:
        if russia_only and slug!='russia-ukraine':continue
        selected=[r for r in rows if key(r) in keys]
        sides={r.get(f,'') for r in selected for f in ('side_a','side_b')} - {'','Civilians'}
        # Only explicit shared coded sides justify including records from 02/05.
        extra=[r for r in rows if key(r) in {tuple(g['key']) for g in excluded}
               and any(r.get(f,'') in sides for f in ('side_a','side_b'))]
        selected+=extra
        selection=f"Conflict IDs: {', '.join('/'.join(k) for k in sorted(keys))}. {len(extra)} additional records from original ranks 02/05 share an exact coded side; all others excluded."
        if slug=='russia-ukraine':
            from src.event_feature_network import render as render_features
            render_features(selected,out,selection)
        else:
            render(model(selected),title,'maps-event-hubs-'+slug+'-2026',out,selection)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--russia-only',action='store_true')
    generate(russia_only=parser.parse_args().russia_only)
