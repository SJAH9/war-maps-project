"""Reproducible Letter report: network structure, event chronology and injury data.

No event is excluded for lacking a statement of motive. Temporal edges are
inferences under explicit rules, not findings of intent or legal responsibility.
"""
from __future__ import annotations
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from datetime import date
from itertools import combinations

import networkx as nx
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from src.conflict_networks import ROOT, active_in, event_rows
from src.generate_network_print import fonts, frame, text, para, INK, MUTED, GRID, ORANGE
from src.import_health_dashboard import RAW, normalize

OUT = ROOT / "outputs/print"
FEATURES = ("density", "centralization", "clustering", "giant_share", "core_share")
PALETTE = ["#3c7d86", "#b65b44", "#797447", "#806b95", "#45745b", "#ab8243"]
RED = HexColor("#b33230")
BLUE = HexColor("#386578")


def metrics(g):
    n, m = len(g), g.number_of_edges()
    deg = dict(g.degree())
    central = sum(max(deg.values(), default=0)-d for d in deg.values()) / max(1, (n-1)*(n-2))
    core = nx.core_number(g) if n else {}
    communities = list(nx.community.greedy_modularity_communities(g, weight=None)) if m else [{v} for v in g]
    return {"nodes": n, "edges": m, "density": nx.density(g), "centralization": central,
            "clustering": nx.average_clustering(g) if n else 0,
            "giant_share": max(map(len, nx.connected_components(g)), default=0)/max(1,n),
            "core_share": sum(k >= 2 for k in core.values())/max(1,n),
            "components": nx.number_connected_components(g), "communities": len(communities),
            "modularity": nx.community.modularity(g, communities, weight=None) if m else 0,
            "degree": deg, "community_nodes": [sorted(c) for c in communities]}


def node_name(name, country):
    return "Civilians / " + country if name.strip().lower() == "civilians" else name.strip()


def country_networks(rows):
    groups = {}
    for r in rows:
        country = r['country']
        g = groups.setdefault(country, {"graph": nx.Graph(), "region": r.get('region','Unknown'), "event_ids": []})
        g['event_ids'].append(r['id'])
        a,b = [node_name(r.get(k,''),country) for k in ('side_a','side_b')]
        if not a or not b or a == b:
            continue
        graph=g['graph']
        if not graph.has_edge(a,b):graph.add_edge(a,b,events=0,event_ids=[])
        graph[a][b]['events']+=1;graph[a][b]['event_ids'].append(r['id'])
    for c,g in groups.items():
        g['metrics']=metrics(g['graph'])
        no_civ=g['graph'].copy(); no_civ.remove_nodes_from([n for n in no_civ if n.startswith('Civilians / ')])
        g['without_civilian_category']=metrics(no_civ)
    return groups


def similarity(a,b):
    return sum(abs(a[k]-b[k]) for k in FEATURES)/len(FEATURES)


def select_pairs(groups):
    eligible=sorted(c for c,g in groups.items() if len(g['graph'])>=8 and g['graph'].number_of_edges()>=8 and len(g['event_ids'])>=30)
    candidates=[]
    for a,b in combinations(eligible,2):
        if groups[a]['region']==groups[b]['region']:continue
        candidates.append((similarity(groups[a]['metrics'],groups[b]['metrics']),a,b))
    used=set();selected=[]
    for distance,a,b in sorted(candidates):
        if a in used or b in used:continue
        selected.append({'a':a,'b':b,'distance':distance,
                         'without_civilian_distance':similarity(groups[a]['without_civilian_category'],groups[b]['without_civilian_category'])})
        used.update((a,b))
        if len(selected)==3:break
    return selected,eligible,len(candidates)


def temporal_links(events, window=7):
    """Strict interval order with shared coded side; retain unlinked/uncertain nodes."""
    edges=[]
    for a,b in combinations(events,2):
        for left,right in ((a,b),(b,a)):
            gap=(date.fromisoformat(right['start'])-date.fromisoformat(left['end'])).days
            if 0 < gap <= window and set(left['sides']) & set(right['sides']):
                edges.append({'source':left['id'],'target':right['id'],'gap_days':gap,
                              'same_country':left['country']==right['country'],
                              'basis':'strict interval chronology + shared coded side',
                              'interpretation':'response-compatible timing, not confirmed retaliation'})
    return edges


def temporal_stats(events,edges):
    g=nx.DiGraph();g.add_nodes_from(e['id'] for e in events);g.add_edges_from((e['source'],e['target']) for e in edges)
    observed=sum(e['same_country'] for e in edges)/max(1,len(edges))
    rng=random.Random(20261020);countries=[e['country'] for e in events];ids=[e['id'] for e in events];null=[]
    for _ in range(199):
        labels=countries[:];rng.shuffle(labels);mapping=dict(zip(ids,labels))
        null.append(sum(mapping[e['source']]==mapping[e['target']] for e in edges)/max(1,len(edges)))
    null.sort()
    return {'edges':len(edges),'nodes':len(g),'isolates':len(list(nx.isolates(g))),
            'weak_components':nx.number_weakly_connected_components(g),
            'same_country_share':observed,'country_shuffle_mean':sum(null)/len(null),
            'country_shuffle_95_interval':[null[4],null[194]],
            'descriptive_upper_tail_fraction':(1+sum(v>=observed for v in null))/200,
            'note':'199 country-label shuffles preserve dates, edges and location marginals. Descriptive, selected-conflict comparison, not causal proof.'}


def compile_report(rows):
    rows=[r for r in rows if active_in(r,2026)]
    groups=country_networks(rows);pairs,eligible,comparisons=select_pairs(groups)
    focal=[]
    for r in rows:
        if str(r['type_of_violence'])!='1' or str(r['conflict_new_id'])!='16905':continue
        focal.append({'id':r['id'],'start':r['date_start'][:10],'end':r['date_end'][:10],
            'country':r['country'],'sides':[r['side_a'],r['side_b']],
            'deaths':int(r['best']) if r.get('best') else None,
            'civilian_deaths':int(r['deaths_civilians']) if r.get('deaths_civilians') else None,
            'source':r['_source'],'source_article':r.get('source_article',''),
            'headline':r.get('source_headline',''),'source_original':r.get('source_original','')})
    focal.sort(key=lambda e:(e['start'],e['id']))
    windows={str(w):temporal_links(focal,w) for w in (1,3,7,14)}
    stats={w:temporal_stats(focal,edges) for w,edges in windows.items()}
    health=normalize(json.loads(RAW.read_text()))
    statement=json.loads((ROOT/'data/curated/war-network-statements.json').read_text())
    countries={c:{'region':g['region'],'event_ids':g['event_ids'],'metrics':g['metrics'],
                   'without_civilian_category':g['without_civilian_category'],
                   'edges':[dict(source=a,target=b,**v) for a,b,v in g['graph'].edges(data=True)]}
               for c,g in groups.items()}
    audit={'scope':'Loaded 2026 UCDP event intervals; all source-coded events retained regardless of motive statements',
           'source_boundary':'Reviewed GED 26.1 plus candidate releases January-August 2026; not current/live coverage',
           'events':len(rows),'countries':countries,'pairs':pairs,'eligible':eligible,'cross_region_pairs_compared':comparisons,
           'similarity_features':list(FEATURES),'focal':focal,'temporal_edges':windows,'temporal_statistics':stats,
           'statements':statement,'injury_graph':health['graphs'],
           'health_latest':health['latest'], 'health_source_url':health['url'],
           'health_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest()}
    return audit,groups,health


class Report:
    def __init__(self,path):
        fonts();self.c=canvas.Canvas(str(path),pagesize=(612,792),pageCompression=1,invariant=1)
        self.c.setTitle('War Networks | Structure, chronology and human cost')
        self.c.setAuthor('The War Maps Project');self.page=0

    def new(self,kicker,title,subtitle=''):
        if self.page:self.c.showPage()
        self.page+=1;frame(self.c,612,792,self.page,'WAR NETWORKS / REPRODUCIBLE ANALYSIS')
        text(self.c,kicker.upper(),32,744,9,ORANGE,True)
        text(self.c,title,32,690,24,INK,True)
        if subtitle:para(self.c,subtitle,32,674,548,10,MUTED)

    def p(self,s,y=630,size=10):return para(self.c,s,32,y,548,size)

    def graph(self,g,box,communities=None,numbered=True):
        x,y,w,h=box
        ordered=nx.Graph();ordered.add_nodes_from(sorted(g));ordered.add_edges_from(sorted(g.edges()))
        parts=sorted(nx.connected_components(ordered),key=lambda part:(-len(part),sorted(part)))
        cols=math.ceil(math.sqrt(len(parts)*w/h));rows=math.ceil(len(parts)/cols)
        pos={}
        for i,part in enumerate(parts):
            local=nx.spring_layout(ordered.subgraph(sorted(part)),seed=2026,weight=None,iterations=120,method='force')
            for n,p in local.items():
                pos[n]=(x+(i%cols+.5)*w/cols+p[0]*w/cols*.36,
                        y+h-(i//cols+.5)*h/rows+p[1]*h/rows*.36)
        membership={n:i for i,part in enumerate(communities or [list(g)]) for n in part}
        def xy(n):return pos[n]
        c=self.c;c.setStrokeColor(GRID);c.setLineWidth(.65)
        for a,b in g.edges():c.line(*xy(a),*xy(b))
        ranked=sorted(g,key=lambda n:(-g.degree(n),n))[:4]
        for n in sorted(g,key=lambda n:g.degree(n)):
            px,py=xy(n);c.setFillColor(HexColor(PALETTE[membership.get(n,0)%len(PALETTE)]))
            r=2.5+1.4*math.sqrt(g.degree(n));c.circle(px,py,r,fill=1,stroke=0)
            if numbered and n in ranked:
                c.setFillColor(HexColor('#ffffff'));c.setFont('WMB',7);c.drawCentredString(px,py-2.3,str(ranked.index(n)+1))
        return ranked

    def table(self,headers,rows,y,widths,size=8):
        x=32;c=self.c;total=sum(widths)
        c.setFillColor(HexColor('#e6e3d6'));c.rect(x,y-21,total,21,fill=1,stroke=0)
        left=x
        for head,w in zip(headers,widths):text(c,head,left+5,y-14,size,INK,True);left+=w
        y-=23
        for row in rows:
            heights=[];left=x
            from reportlab.platypus import Paragraph
            from reportlab.lib.styles import ParagraphStyle
            from xml.sax.saxutils import escape
            paragraphs=[]
            for value,w in zip(row,widths):
                p=Paragraph(escape(str(value)),ParagraphStyle('cell',fontName='WM',fontSize=size,leading=size*1.3,textColor=INK))
                _,h=p.wrap(w-10,1000);paragraphs.append((p,left+5,h));heights.append(h);left+=w
            height=max(heights)+10
            if y-height<42:raise ValueError('Table overflow on page '+str(self.page))
            for p,left,h in paragraphs:p.drawOn(c,left,y-5-h)
            c.setStrokeColor(GRID);c.setLineWidth(.3);c.line(x,y-height,x+total,y-height);y-=height
        return y

    def finish(self):self.c.showPage();self.c.save()


def render(a,groups,health,path):
    r=Report(path);c=r.c;f=a['focal'];pairs=a['pairs']
    r.new('01 / Evidence in relation','War Networks','Structural echoes across regions / US-Iran-Israel event chronology / injuries and deaths as separate measures')
    r.p('A graph reveals repeated counterparts, concentrated connections and the spread of recorded events across places. It does not require an actor to disclose a motive before the event can be connected to others.',620,12)
    # Large community-colored observed network, not a synthetic BA illustration.
    example=max(a['eligible'],key=lambda n:groups[n]['metrics']['nodes']);m=groups[example]['metrics']
    r.graph(groups[example]['graph'],(45,280,520,265),m['community_nodes'],numbered=False)
    text(c,example.upper()+' / OBSERVED CODED-SIDE GRAPH',32,267,10,ORANGE,True)
    r.p(f"{a['events']:,} loaded event records active in 2026. {len(a['eligible'])} country graphs meet comparison criteria. {a['cross_region_pairs_compared']} cross-region pairs screened. All {len(f)} focal conflict records retained, including those without motive statements.",245)
    r.p('Reading key: nodes are defined per figure; links are observed coding or explicitly derived relations. Force-directed layouts, degree-scaled nodes and community colors follow network-science visualization practice, not a claim that conflicts follow a Barabasi-Albert growth law.',167)
    r.p('Coverage warning: UCDP candidate releases run through August 2026. Health Cluster figures have a separate October reporting boundary. This report is not a live account of all attacks or casualties.',94,9)

    r.new('02 / Method','What the graph measures','Barabasi-informed network analysis, with measurement boundaries made explicit')
    y=r.table(['Measure','Definition / reading'],[
        ['Country graph','One node per exact coded side name; civilians scoped to the event country. Edge = opposed sides in at least one loaded 2026 event. Undirected; side A/B is not attacker/defender.'],
        ['Degree / centralization','Degree counts distinct counterpart nodes. Freeman centralization = sum(max degree - degree) / ((n-1)(n-2)). High values describe a hub-dominated coding pattern, not command authority.'],
        ['Clustering / 2-core','Mean local clustering measures connected neighbor triangles. 2-core share counts nodes remaining after recursively removing degree <2. These describe topology, not political solidarity.'],
        ['Components / communities','Largest-component share counts reachable nodes. Greedy modularity communities use unweighted undirected edges. Colors are algorithmic groups, not alliances.'],
        ['Cross-region similarity','Mean absolute difference of density, centralization, mean clustering, largest-component share and 2-core share (all 0-1). Minimum 8 nodes, 8 edges, 30 events; different UCDP macroregions.'],
        ['Selection and sensitivity','Rank every eligible cross-region pair, choose three lowest distances without reusing countries. Recalculate distance without the civilian-category node. Exploratory screening, not a significance test.'],
        ['Chronology','Every focal record stays. Directed links require shared coded side and strictly non-overlapping event intervals separated by <= window days. Windows 1, 3, 7 and 14 expose parameter dependence.'],
        ['Not established','No fitted power law, preferential-attachment mechanism, causal retaliation probability, intent, culpability or full population completeness is claimed.'],
    ],635,[135,413],9)
    r.p('Methods references: A.-L. Barabasi, Network Science, chapters 2 (graph measures), 4-5 (degree distributions and growth), 9 (communities). Implementation: NetworkX; all seeds and edge rules are fixed in the generator.',y-18,9)

    for index,pair in enumerate(pairs,3):
        left,right=pair['a'],pair['b'];ga,gb=groups[left],groups[right];ma,mb=ga['metrics'],gb['metrics']
        r.new(f'{index:02} / Structural comparison',left+' / '+right if len(left+right)<34 else 'A shared network configuration',
              f"{left} ({ga['region']}) and {right} ({gb['region']}) / same projection, different settings")
        ranka=r.graph(ga['graph'],(32,385,260,230),ma['community_nodes']);rankb=r.graph(gb['graph'],(320,385,260,230),mb['community_nodes'])
        text(c,left,32,610,12,INK,True);text(c,right,320,610,12,INK,True)
        y=r.table(['Metric',left,right],[['Events',len(ga['event_ids']),len(gb['event_ids'])],['Nodes / links',f"{ma['nodes']} / {ma['edges']}",f"{mb['nodes']} / {mb['edges']}"],*[[name.replace('_',' ').title(),f'{ma[name]:.3f}',f'{mb[name]:.3f}'] for name in FEATURES]],373,[220,164,164],8)
        y=r.p(f"Structural distance {pair['distance']:.3f} (0 = identical selected statistics); without civilian categories {pair['without_civilian_distance']:.3f}. Similarity is about counterpart concentration and connectivity, not shared causes, tactics or moral equivalence.",y-14,9)
        y=r.p('Node area grows with degree; colors mark modularity communities. Numbered high-degree nodes: '+left+': '+'; '.join(f'{i+1} {n}' for i,n in enumerate(ranka))+'. '+right+': '+'; '.join(f'{i+1} {n}' for i,n in enumerate(rankb))+'.',y-12,8)
        if y<45:raise ValueError('Pair page overflow')

    r.new('06 / Focal network','One coded dyad, many places','US-Iran-Israel / UCDP conflict 16905 / observed event-incidence network')
    g=nx.Graph();countries=Counter(e['country'] for e in f)
    for e in f:
        n='event:'+e['id'];g.add_node(n,kind='event')
        for name in e['sides']:g.add_edge(n,'side:'+name)
        g.add_edge(n,'place:'+e['country'])
    # Explicit three-layer layout keeps all events visible and shared-side compression clear.
    sides=sorted({s for e in f for s in e['sides']});places=sorted(countries)
    pos={};
    for i,s in enumerate(sides):pos['side:'+s]=(85,520-i*160)
    for i,p in enumerate(places):pos['place:'+p]=(470,605-i*22)
    for i,e in enumerate(f):pos['event:'+e['id']]=(240+(i%6)*22,610-(i//6)*13)
    c.setStrokeColor(GRID);c.setLineWidth(.22)
    for x,y in g.edges():c.line(*pos[x],*pos[y])
    for n,(x,y) in pos.items():
        event=n.startswith('event:');c.setFillColor(RED if event else BLUE);c.circle(x,y,2 if event else 5,fill=1,stroke=0)
        if n.startswith('place:'):text(c,n[6:],480,y-2,7)
    para(c,'Iran',32,550,135,11,INK);para(c,'Israel + United States (joint source-coded side)',32,350,155,10,INK)
    y=r.p(f"{len(f)} event nodes; {len(sides)} exact coded-side nodes; {len(places)} event-country nodes. Each event connects to both coded sides and its recorded country. Red dots are event records, not one death each. The group-coded Israel/US side is not split into invented bilateral event assignments.",284)
    y=r.p(f"{countries.get('Iran',0)} records are located in Iran; {len(f)-countries.get('Iran',0)} are elsewhere. The event-country layer exposes a distributed footprint that a two-node confrontation graph hides. Country location is not evidence that the host government participated or was a target.",y-16)
    r.p('Every focal event has the same two coded sides. Actor centrality here is therefore largely imposed by the source schema. It cannot identify which government initiated each strike or exercised operational control. The appendix retains every ID and date interval; detailed sources remain in the companion JSON.',y-16)

    r.new('07 / Time-expanded network','Chronology without a motive gate','All focal events / 7-day strict interval links / grouped by recorded event country')
    start=min(date.fromisoformat(e['start']) for e in f);end=max(date.fromisoformat(e['end']) for e in f);span=max(1,(end-start).days)
    places=sorted(countries,key=lambda p:(-countries[p],p));coords={};stack=Counter()
    for e in f:
        k=(e['country'],e['start']);j=stack[k];stack[k]+=1
        coords[e['id']]=(140+(date.fromisoformat(e['start'])-start).days/span*425,610-places.index(e['country'])*22-(j%4)*3)
    c.setStrokeAlpha(.12);c.setLineWidth(.3);c.setStrokeColor(BLUE)
    for edge in a['temporal_edges']['7']:c.line(*coords[edge['source']],*coords[edge['target']])
    c.setStrokeAlpha(1)
    for p in places:
        y=610-places.index(p)*22;text(c,p,32,y-2,7);c.setStrokeColor(GRID);c.line(138,y-8,570,y-8)
    for e in f:
        x,y=coords[e['id']];xend=140+(date.fromisoformat(e['end'])-start).days/span*425
        c.setStrokeColor(RED);c.setLineWidth(.7);c.line(x,y,xend,y)
        c.setFillColor(RED);c.circle(x,y,1.6+min(2,math.log1p(e['deaths'] or 0)*.25),fill=1,stroke=0)
    text(c,start.isoformat(),140,315,8);text(c,end.isoformat(),500,315,8)
    st=a['temporal_statistics']['7']
    y=r.p(f"{st['edges']:,} directed candidate connections under the 7-day rule; time runs left to right. Horizontal red strokes show uncertain multi-day intervals. Same-day or overlapping intervals receive no invented internal order. Every node remains visible, including {st['isolates']} with no strict-time links.",285)
    y=r.p('The dense strands indicate temporally adjacent records with a shared coded counterpart, not a demonstrated chain of retaliation. A plausible response can occur on the same day or across overlapping intervals: such events stay in the figure even when this conservative directed rule cannot order them.',y-15)
    r.p('Timing-based links survive missing, preventive, disputed or explicitly denied motives. A denial would be recorded as a statement annotation, not used to erase the event. Host-country shifts describe geographic spread; they do not identify the direction of attack.',y-15)

    r.new('08 / Sensitivity','Does the pattern survive the rule?','Window choice and a location-label null model')
    y=r.table(['Window','Links','Isolates','Same-place share','Shuffle mean'],[
        [w+' days',s['edges'],s['isolates'],f"{s['same_country_share']:.3f}",f"{s['country_shuffle_mean']:.3f}"]
        for w,s in a['temporal_statistics'].items()],625,[85,100,85,145,133],10)
    st=a['temporal_statistics']['7'];lo,hi=st['country_shuffle_95_interval']
    y=r.p(f"At 7 days, same-country links account for {st['same_country_share']:.1%}. The 199 seeded country-label shuffles average {st['country_shuffle_mean']:.1%}, with a central 95% empirical interval of {lo:.1%}-{hi:.1%}. Dates, actor links and the number of events in each country remain fixed.",y-25,11)
    y=r.p('The observed share falls inside the shuffled interval: this rule supplies no clear evidence of additional same-country concentration beyond location prevalence. That does not rule out responses across borders. Neither this comparison nor temporal proximity establishes retaliatory intent; the selected conflict and windows are exploratory.',y-20)
    # Bar comparison of observed versus shuffled geography.
    for i,(label,value) in enumerate([('Observed',st['same_country_share']),('Shuffle mean',st['country_shuffle_mean'])]):
        yy=y-50-i*47;text(c,label,32,yy+3,10);c.setFillColor(RED if i==0 else BLUE);c.rect(160,yy,value*350,15,fill=1,stroke=0);text(c,f'{value:.1%}',520,yy+3,9)
    r.p('Why not call this scale-free? The focal actor graph has just two coded nodes. Even larger country graphs contain only dozens of actors and reflect collection rules. A visually prominent hub is not evidence of a power-law tail or preferential attachment. No synthetic Barabasi-Albert edges are mixed into the evidence.',y-160)

    r.new('09 / Statements alongside events','A response pattern is not a confession','Statements add interpretation; they do not authorize event inclusion')
    episodes=a['statements']['episodes']
    yy=615
    for e in episodes:
        c.setFillColor(ORANGE);c.circle(42,yy-5,4,fill=1,stroke=0)
        text(c,e['id']+' / '+e['date']+' / '+e['label'],58,yy-8,10,INK,True)
        yy=para(c,e['summary']+' ['+e['source']+']',58,yy-19,510,9)-22
    yy=r.p('Selected episode links: S1 -> S2 is source-described response; S2 -> S3 is a shared-actor/theatre inference, not an established trigger. S4 -> S5 is a US-stated response; S5 -> S6 has response-compatible chronology and statements. These are episode summaries, not additional fatality records.',yy,9)
    yy=r.p(a['statements']['denial_note'],yy-12,9)
    if yy<43:raise ValueError('Statement page overflow')

    r.new('10 / Injuries are distinct','The human-cost network has two measures','Health Cluster / WHO aggregate series and health-attack records; separate from UCDP')
    y=r.table(['Area / reporting date','Reported fatalities','Reported injuries'],[
        ['Gaza / '+health['latest']['Gaza Fatalities']['date'],health['latest']['Gaza Fatalities']['value'],health['latest']['Gaza Injuries']['value']],
        ['West Bank / '+health['latest']['West Bank Fatalities']['date'],health['latest']['West Bank Fatalities']['value'],health['latest']['West Bank  Injuries']['value']],
    ],625,[250,149,149],10)
    # Month x governorate bipartite incidence projection, every health-attack record included.
    agg=defaultdict(lambda:[0,0,0]);unknown=0
    for e in health['tables']['Fact_Attack']:
        k=(e['AttackDate'][:7],e['Country']+' / '+e['Governorate']);agg[k][0]+=1
        for i,col in ((1,'TotalDeaths'),(2,'TotalInjuries')):
            if e[col] is None:unknown+=1
            else:agg[k][i]+=e[col]
    months=sorted({k[0] for k in agg});locations=sorted({k[1] for k in agg})
    top=490;bottom=250
    for i,month in enumerate(months):
        yy=top-i*(top-bottom)/max(1,len(months)-1);text(c,month,32,yy-2,6.5);c.setFillColor(BLUE);c.circle(85,yy,2,fill=1,stroke=0)
    for i,place in enumerate(locations):
        yy=top-i*(top-bottom)/max(1,len(locations)-1);text(c,place,415,yy-2,6.5);c.setFillColor(BLUE);c.circle(405,yy,2,fill=1,stroke=0)
    for (month,place),(count,deaths,injuries) in agg.items():
        ya=top-months.index(month)*(top-bottom)/max(1,len(months)-1);yb=top-locations.index(place)*(top-bottom)/max(1,len(locations)-1)
        c.setStrokeAlpha(.23);c.setStrokeColor(RED if deaths>0 else BLUE);c.setLineWidth(.25+math.log1p(injuries)*.25);c.line(85,ya,405,yb)
    c.setStrokeAlpha(1)
    y=r.p(f"{len(health['tables']['Fact_Attack']):,} health-attack records projected onto {len(months)} months and {len(locations)} area/governorate nodes. A link means one or more recorded attacks in that month and location. Width grows logarithmically with reported injuries; red means reported deaths >0. All records retained; no personal records imported.",220,9)
    y=r.p('This reveals repeated injury-bearing links across time and places without treating a non-fatal attack as absent. The companion JSON keeps event-level death and injury attributes and location edges. These losses can overlap the cumulative area totals above; neither is added to UCDP or to the dot posters.',y-14,9)
    r.p(f"{unknown} missing death/injury cells in this health-attack capture. Missing values remain null in the event graph. The demographic period-share table contains fractions, not people. Neither age nor sex is used to infer civilian/combatant status.",y-12,9)

    r.new('11 / Findings and boundaries','What becomes visible','Structure is evidence about relationships under a declared model')
    st=a['temporal_statistics']['7']
    findings=[
        ('Structural echoes',f"The three selected cross-region pairs have distances {', '.join(format(p['distance'],'.3f') for p in pairs)} across the same five graph measures. They share configurations, not necessarily generating processes. Civilian-node removal shows how a coding category can change the resemblance."),
        ('Compression hides geography',f"The focal two-side coding conceals {len(f)} event records across {len(countries)} event countries. The incidence view restores that spatial multiplicity without inventing individual US versus Israeli assignments."),
        ('Timing is usable without intent claims',f"There are {st['edges']} strict-time shared-side links at seven days. Missing motive statements exclude zero events. Windows and uncertain intervals are visible; inferred links are not converted into facts about motive."),
        ('No-mortality does not mean no harm','Injury counts supply a separate node attribute and edge-width measure. Reporting dates, location links and fatality-positive coloring show a different aspect of the humanitarian record than mortality-only dots.'),
        ('Collection limits still matter','UCDP is a fatal organized-violence dataset, not a census of all launches, interceptions or nonfatal actions. No graph can recover omitted events from topology alone. Statements supply selected contextual episodes, with provenance, rather than silently filling event gaps.'),
        ('Humanitarian interpretation','Network reach is not command, allegiance or targeting evidence. Co-location is not participation. Cross-region similarity is not a claim of equivalent histories. This report supports public understanding, not operational recommendations.'),
    ]
    y=625
    for title,body in findings:
        text(c,title.upper(),32,y,11,ORANGE,True);y=r.p(body,y-12,10)-24
    if y<40:raise ValueError('Findings overflow')

    # All observed focal event IDs remain inspectable in the PDF, not only the prettiest examples.
    for offset in range(0,len(f),25):
        chunk=f[offset:offset+25]
        r.new('Appendix / Event register','All focal records retained',f"UCDP conflict 16905 / {offset+1}-{offset+len(chunk)} of {len(f)} / deaths are best estimates, not injuries")
        rows=[[e['id'],e['start']+(' to '+e['end'] if e['end']!=e['start'] else ''),e['country'],e['deaths'] if e['deaths'] is not None else 'unknown'] for e in chunk]
        y=r.table(['Event ID','Date interval','Recorded country','Deaths'],rows,625,[80,210,185,73],8)
        r.p('Complete source_article, headline, original attribution, coded sides, civilian field and source release are retained per ID in war-networks.json. Death estimates may overlap across distinct observations; this report does not sum them into a unique-person claim.',y-15,8)

    r.new('Sources / Rebuild','Audit and reproduce','Frozen inputs, transparent transformations, no hosted page equivalent')
    y=625
    refs=[('UCDP','GED 26.1 and candidate releases January-August 2026. https://ucdp.uu.se/downloads/'),
          ('Graph methods','Albert-Laszlo Barabasi, Network Science. Chapters 2, 4, 5 and 9. https://networksciencebook.com/'),
          ('Implementation','NetworkX 3.5: degree, density, clustering, cores, connected components, greedy modularity and spring layout. https://networkx.org/documentation/stable/'),
          *[(s['id'],s['title']+' '+s['url']) for s in a['statements']['sources']],
          ('Health context','oPt Health Cluster / WHO Unified Health Dashboard. Public embed key 80156306-247a-4933-911d-9555a0319530; full link and raw query responses in data/raw/opt-health-dashboard.json.')]
    for label,body in refs:
        text(c,label,32,y,10,ORANGE,True);y=para(c,body,32,y-10,548,8)-18
    y=r.p('Rebuild: python -m src.generate_war_networks. Outputs: this Letter PDF and war-networks.json with all compared graphs, exact focal records, temporal edges for each window, statement links, injury graph and input hashes. Source counts and layout are reproducible with the pinned environment; no network access is needed.',y,9)
    y=r.p('Attribution: UCDP (CC BY 4.0), Sundberg & Melander (2013); WHO/Health Cluster and UN sources under their respective terms. Public dashboard access is not a blanket open-data license. The report paraphrases selected statements; allegations remain attributed.',y-14,9)
    if y<43:raise ValueError('References overflow')
    r.finish()
    return r.page


def generate(out=OUT):
    out.mkdir(parents=True,exist_ok=True)
    audit,groups,health=compile_report(event_rows())
    from src.build_atlas import CURRENT_SOURCES
    inputs=[ROOT/'data/raw/ged261-csv.zip',RAW,ROOT/'data/curated/war-network-statements.json',*[p for p,_ in CURRENT_SOURCES]]
    audit['input_sha256']={str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in inputs}
    audit['pages']=render(audit,groups,health,out/'war-networks.pdf')
    (out/'war-networks.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pages':audit['pages'],'events':audit['events'],'focal':len(audit['focal']),'pairs':audit['pairs'],'temporal':audit['temporal_statistics']},indent=2))


if __name__=='__main__':generate()
