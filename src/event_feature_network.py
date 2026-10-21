"""Government-free event/feature incidence with inverse graph frequency."""
import math
import re
from collections import defaultdict

import networkx as nx

from src.generate_event_hubs import METHODS
from src.generate_event_network_print import mortality


def export_graphml(audit,path):
    """Portable typed attributes, with no renderer-specific object values."""
    import json
    graph=nx.Graph()
    graph.graph.update(title=audit['title'],weighting=audit['weighting'],
                       betweenness_method=audit['betweenness_method'])
    records={'event:'+r['id']:r for r in audit['events']}
    for node in audit['nodes']:
        attrs={k:v for k,v in node.items() if k!='id'}
        if node['id'] in records:
            row=records[node['id']]
            attrs.update(date=row['date_start'][:10],source_record=json.dumps(row,ensure_ascii=False))
        graph.add_node(node['id'],**attrs)
    for edge in audit['edges']:
        graph.add_edge(edge['source'],edge['target'],**{k:v for k,v in edge.items() if k not in ('source','target')})
    # NetworkX's XML writer emits Python True/False; GraphML uses lowercase.
    import xml.etree.ElementTree as ET
    root=ET.fromstring('\n'.join(nx.generate_graphml(graph)))
    ns={'g':'http://graphml.graphdrawing.org/xmlns'}
    boolean_keys={key.attrib['id'] for key in root.findall('g:key',ns)
                  if key.attrib.get('attr.type')=='boolean'}
    for item in root.findall('.//g:data',ns):
        if item.attrib.get('key') in boolean_keys:
            item.text=item.text.lower()
    ET.register_namespace('',ns['g'])
    ET.ElementTree(root).write(path,encoding='utf-8',xml_declaration=True)


def build(rows):
    rows=sorted(rows,key=lambda r:r['id']);n=len(rows)
    g=nx.Graph();features=defaultdict(set);meta={};records=[]
    for r in rows:
        eid='event:'+r['id']
        g.add_node(eid,kind='event',label=r['id']+' / '+r['date_start'][:10],fatal=(mortality(r) or 0)>0)
        place=' / '.join(r.get(k,'').strip() for k in ('country','adm_1','where_coordinates'))
        values=[]
        if r.get('where_coordinates','').strip():values.append(('place',place))
        start=r['date_start'][:10];end=(r.get('date_end') or r['date_start'])[:10]
        if start==end and str(r.get('date_prec'))=='1':values.append(('date',start))
        tags=[name for name,pattern in METHODS.items() if re.search(pattern,r.get('source_headline',''),re.I)]
        values.extend(('method',tag) for tag in tags)
        # Governments retained only as record provenance, never as graph nodes.
        for kind,value in values:
            fid=kind+':'+value;features[fid].add(eid);meta[fid]=(kind,value)
        records.append(dict(r,headline_method_indicators=tags))
    suppressed=[]
    for fid,events in sorted(features.items()):
        df=len(events);kind,label=meta[fid]
        if df/n>.70:
            suppressed.append(dict(id=fid,reason='feature occurs in >70% of event records',frequency=df));continue
        # Singleton features cannot connect two observations; retain in raw record.
        if df<2:continue
        igf=math.log(n/df)
        g.add_node(fid,kind=kind,label=label,frequency=df,igf=igf)
        for eid in sorted(events):g.add_edge(eid,fid,weight=igf,distance=1/igf,evidence=kind)
    # Fixed-point removal, preserving every event as an observation even if isolated.
    while len(g)>1:
        hubs=[v for v in g if g.degree(v)/(len(g)-1)>.70]
        if not hubs:break
        for v in hubs:
            suppressed.append(dict(id=v,reason='degree >70% of remaining nodes',degree=g.degree(v)))
            if g.nodes[v]['kind']=='event':g.remove_edges_from(list(g.edges(v)))
            else:g.remove_node(v)
    # Exact weighted shortest paths, calculated after all hub removal.
    centrality=nx.betweenness_centrality(g,weight='distance',normalized=True)
    for v in g:g.nodes[v].update(degree=g.degree(v),degree_centrality=g.degree(v)/max(1,len(g)-1),betweenness=centrality[v])
    return g,records,suppressed


def positions(g,box):
    from src.generate_event_network_print import partition
    parts=sorted(nx.connected_components(g),key=lambda c:(-len(c),min(c)))
    # Reserve a separate strip for isolates, so hundreds of small components
    # never collapse into an artificial global connected network.
    connected=[p for p in parts if len(p)>1];isolates=[next(iter(p)) for p in parts if len(p)==1]
    x,y,w,h=box;strip=min(h*.22,math.ceil(len(isolates)/45)*18+28) if isolates else 0
    xy={};tiles=[]
    if connected:
        dummy=[{'events':[None]*len(p),'part':p} for p in connected]
        tiles=partition(dummy,(x,y+strip,w,h-strip))
    for item,(bx,by,bw,bh) in tiles:
        nodes=sorted(item['part']);sub=g.subgraph(nodes)
        # Compute force positions only on feature hubs, then place events at
        # barycentres of their actual neighbors with deterministic local jitter.
        features=[v for v in nodes if sub.nodes[v]['kind']!='event']
        hub=nx.Graph();hub.add_nodes_from(features)
        for v in nodes:
            if sub.nodes[v]['kind']!='event':continue
            ns=sorted(sub[v])
            for i,a in enumerate(ns):
                for b in ns[i+1:]:
                    strength=min(sub[v][a]['weight'],sub[v][b]['weight'])
                    hub.add_edge(a,b,weight=hub.get_edge_data(a,b,{}).get('weight',0)+strength)
        if len(hub)>1:
            coords=nx.drawing.layout._fruchterman_reingold(nx.to_numpy_array(hub,weight='weight'),iterations=70,seed=2026)
            # Independent axis scaling uses the full available poster field.
            lo=coords.min(axis=0);span=coords.max(axis=0)-lo
            hp={v:(bx+22+(float(p[0])-lo[0])/max(.001,span[0])*(bw-44),by+22+(float(p[1])-lo[1])/max(.001,span[1])*(bh-44)) for v,p in zip(hub,coords)}
        else:hp={v:(bx+bw/2,by+bh/2) for v in hub}
        xy.update(hp)
        buckets=defaultdict(list)
        for v in nodes:
            if sub.nodes[v]['kind']=='event':buckets[tuple(sorted(sub[v]))].append(v)
        for ns,events in buckets.items():
            total=sum(sub[events[0]][v]['weight'] for v in ns)
            cx=sum(hp[v][0]*sub[events[0]][v]['weight'] for v in ns)/total
            cy=sum(hp[v][1]*sub[events[0]][v]['weight'] for v in ns)/total
            for i,v in enumerate(events):
                a=i*math.pi*(3-math.sqrt(5));r=8+min(48,5*math.sqrt(len(events)))*math.sqrt((i+.5)/len(events))
                xy[v]=(min(bx+bw-8,max(bx+8,cx+r*math.cos(a))),min(by+bh-8,max(by+8,cy+r*math.sin(a))))
    for i,v in enumerate(isolates):xy[v]=(x+12+(i%45)*(w-24)/44,y+14+(i//45)*18)
    return xy,parts


def render(rows,out,selection):
    import gzip,json
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import HexColor
    from src.generate_network_print import frame,text,para,INK,MUTED,ORANGE,PAPER
    from reportlab.pdfbase.pdfmetrics import stringWidth
    g,records,suppressed=build(rows);xy,parts=positions(g,(48,340,1200,1180))
    slug='maps-event-hubs-russia-ukraine-2026'
    c=canvas.Canvas(str(out/(slug+'.pdf')),pagesize=(1296,1728),pageCompression=1,invariant=1)
    frame(c,1296,1728,1,'WAR MAPS / GOVERNMENT-FREE EVENT RELATIONSHIPS / 18 x 24 IN')
    text(c,'RUSSIA - UKRAINE',48,1640,28,INK,True)
    text(c,'BEYOND THE GOVERNMENT HUBS',48,1598,21,ORANGE,True)
    isolated=list(nx.isolates(g))
    text(c,f'{len(records):,} events / {len(g):,} nodes / {len(parts):,} components / {len(isolated):,} isolated events',48,1564,13)
    colors={'event':'#b8312c','place':'#3c8994','date':'#65783f','method':'#8c65a1'}
    def glyph(kind,x,y,r,color=None):
        c.setFillColor(HexColor(color or colors[kind]));c.setStrokeColor(PAPER);c.setLineWidth(.5)
        if kind=='place':c.rect(x-r,y-r,2*r,2*r,fill=1,stroke=1)
        elif kind in ('date','method'):
            p=c.beginPath();p.moveTo(x,y+r)
            if kind=='method':p.lineTo(x+r,y);p.lineTo(x,y-r);p.lineTo(x-r,y)
            else:p.lineTo(x-r,y-r);p.lineTo(x+r,y-r)
            p.close();c.drawPath(p,fill=1,stroke=1)
        else:c.circle(x,y,r,fill=1,stroke=1)
    maxweight=max((d['weight'] for _,_,d in g.edges(data=True)),default=1)
    c.setStrokeAlpha(.20)
    for a,b,d in g.edges(data=True):
        c.setStrokeColor(HexColor(colors[d['evidence']]))
        c.setLineWidth(.25+.8*d['weight']/maxweight)
        if d['evidence']=='method':c.setDash(2,2)
        else:c.setDash()
        c.line(*xy[a],*xy[b])
    c.setStrokeAlpha(1);c.setDash()
    radii={v:(2.7 if d['kind']=='event' else 4+min(17,math.sqrt(d['degree']))) for v,d in g.nodes(data=True)}
    for v in sorted(g,key=lambda v:g.degree(v)):
        d=g.nodes[v];color='#96998b' if d['kind']=='event' and not d['fatal'] else None
        glyph(d['kind'],*xy[v],radii[v],color)
    # Place labels directly, testing against earlier labels and all large hubs.
    occupied=[(xy[v][0]-r,xy[v][1]-r,xy[v][0]+r,xy[v][1]+r) for v,r in radii.items()];labeled=[]
    priorities=sorted(g,key=lambda v:(g.nodes[v]['kind']=='event',-g.nodes[v]['betweenness'],-g.degree(v),v))
    for v in priorities:
        d=g.nodes[v]
        if d['kind']=='event' and g.degree(v)>0:continue
        label=d['label']
        if d['kind']=='place':label=label.split(' / ')[-1]
        if d['kind']=='event':label=d['label'].split(' / ')[0]
        label=label[:38];size=10 if d['kind']=='method' else 8
        width=stringWidth(label,'WM',size);x,y=xy[v];r=radii[v]
        for lx,ly in [(x+r+3,y-3),(x-width-r-3,y-3),(x-width/2,y+r+4),(x-width/2,y-r-12)]:
            box=(lx-2,ly-2,lx+width+2,ly+size+2)
            if box[0]<48 or box[2]>1248 or box[1]<340 or box[3]>1520:continue
            if any(not(box[2]<b[0] or box[0]>b[2] or box[3]<b[1] or box[1]>b[3]) for b in occupied):continue
            c.setFillColor(PAPER);c.rect(box[0],box[1],box[2]-box[0],box[3]-box[1],fill=1,stroke=0)
            text(c,label,lx,ly,size,INK);occupied.append(box);labeled.append(v);break
    # Pictorial legend: precisely the same glyph function as the graph.
    text(c,'NODE & EDGE KEY',48,313,12,ORANGE,True)
    entries=[('event','Fatal event',None),('event','Zero / unknown deaths','#96998b'),('place','Shared recorded place',None),('date','Exact recorded day',None),('method','Headline method term',None)]
    for i,(kind,label,color) in enumerate(entries):
        x=60+i*240;glyph(kind,x,288,6,color);text(c,label,x+14,284,10)
    c.setStrokeColor(HexColor('#3c8994'));c.setLineWidth(1);c.line(50,259,90,259);text(c,'Recorded place/date incidence',100,255,9)
    c.setStrokeColor(HexColor('#8c65a1'));c.setDash(2,2);c.line(390,259,430,259);c.setDash();text(c,'Headline-derived method incidence (not confirmed weapon use)',440,255,9)
    text(c,'SIZE = DEGREE / LINKS WEIGHTED BY INVERSE GRAPH FREQUENCY',48,230,11,ORANGE,True)
    para(c,'Every event remains. The Russian and Ukrainian government nodes are absent; their original side fields remain in the data. Shared features connect events through intermediate nodes. Singleton attributes and missing values do not create hubs. Separate components float independently; bottom-strip dots are isolated events, not discarded records.',48,213,1200,10)
    para(c,'Binary node frequency per event; IGF = ln(N / feature event count). Rare features have stronger links; repeated features are downweighted. Features present in >70% of events are suppressed, then any node linked to >70% of remaining nodes is unlinked. Exact weighted betweenness uses distance = 1/IGF. Similarity and shared dates do not establish causality, coordination or retaliation.',48,164,1200,10)
    leaders=sorted(g,key=lambda v:(-g.nodes[v]['betweenness'],v))[:3]
    para(c,'Highest weighted betweenness: '+'; '.join(f"{g.nodes[v]['label']} ({g.nodes[v]['betweenness']:.4f})" for v in leaders)+'. All degrees, centralities, labels and evidence are preserved in the companion JSON.',48,113,1200,9)
    para(c,'Sources: UCDP GED 26.1 / loaded candidate records through August 2026. '+selection+' Method terms are literal headline matches, not validated weapon classifications. No geography or power-law inference from layout.',48,66,1200,8)
    c.showPage();c.save()
    audit={'title':'Russia - Ukraine / government-free relationships','selection':selection,
           'weighting':'Binary event feature frequency; IGF=ln(N/df); distance=1/IGF',
           'suppressed':suppressed,'excluded_side_nodes':['Government of Russia (Soviet Union)','Government of Ukraine'],
           'betweenness_method':'exact weighted all-source calculation','components':len(parts),'isolates':len(isolated),
           'direct_labels':labeled,'events':records,'nodes':[dict(id=v,**d) for v,d in g.nodes(data=True)],
           'edges':[dict(source=a,target=b,**d) for a,b,d in g.edges(data=True)]}
    with (out/(slug+'.json.gz')).open('wb') as f:
        with gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0) as z:z.write(json.dumps(audit,ensure_ascii=False).encode())
    export_graphml(audit,out/(slug+'.graphml'))
    print(f'{slug}: {len(records)} events; {len(parts)} components; {len(isolated)} isolates; {len(labeled)} direct labels',flush=True)
