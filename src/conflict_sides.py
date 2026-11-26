"""Count-conserving side totals for current conflicts; latest event revision wins."""
import csv
import hashlib
import json
from collections import Counter
from datetime import date
from src.conflict_networks import ROOT, event_rows, key
from src.build_atlas import CURRENT_SOURCES, CANDIDATE_BOUNDARY

FIELDS={'a':'deaths_a','b':'deaths_b','c':'deaths_c','d':'deaths_d',
        'civilian':'deaths_civilians','unknown':'deaths_unknown'}
COLORS={'a':'#ffffff','b':'#080808','c':'#999999','d':'#505050',
        'civilian':'#d5d5d5','unknown':'#737373'}


def counts(row):
    result={k:int(row.get(field) or 0) for k,field in FIELDS.items()}
    if min(result.values())<0 or sum(result.values())!=int(row['best']):
        raise ValueError(f"Death fields do not reconcile for event {row['id']}")
    return result


def compile_rows(rows,year):
    """Testable reducer; input must already be deduplicated by source event ID."""
    models={};seen=set()
    for r in rows:
        if r['id'] in seen:raise ValueError(f"Duplicate event {r['id']}")
        seen.add(r['id']);k=':'.join(key(r));y=str(int(r['year']));values=counts(r)
        m=models.setdefault(k,dict(id=k,title=r['conflict_name'],years={},active=False))
        m['active'] |= int(y)==year
        if int(y)==year:m['title']=r['conflict_name']
        bucket=m['years'].setdefault(y,dict(counts=Counter(),labels={s:set() for s in 'abcd'},events=0,sources=set()))
        bucket['counts'].update(values);bucket['events']+=1;bucket['sources'].add(r['_source'])
        for s in 'abcd':
            if r.get('side_'+s):
                label = r['side_'+s]
                if k == '1:13243' and int(y) >= 1992:
                    label = label.replace('Russia (Soviet Union)', 'Russia')
                bucket['labels'][s].add(label)
    result=[]
    for m in models.values():
        if not m.pop('active'):continue
        total=Counter();labels={s:set() for s in 'abcd'};events=0;sources=set()
        for b in m['years'].values():
            total.update(b['counts']);events+=b['events'];sources.update(b['sources'])
            for s in 'abcd':labels[s].update(b['labels'][s]);b['labels'][s]=sorted(b['labels'][s])
            b['sources']=sorted(b['sources']);b['total']=sum(b['counts'].values())
        m['all']=dict(counts=total,labels={s:sorted(v) for s,v in labels.items()},events=events,sources=sorted(sources),total=sum(total.values()))
        result.append(m)
    return sorted(result,key=lambda m:(-max(m['years'][str(year)]['counts'][s] for s in 'abcd'),-m['years'][str(year)]['total'],m['id']))


def overview_segments(models,year):
    segments=[];start=0
    for m in models:
        b=m['years'][str(year)]
        order=sorted('abcd',key=lambda s:(-b['counts'][s],s))
        for side in order:
            n=b['counts'][side]
            if n:
                segments.append(dict(conflict=m['id'],side=side,start=start,end=start+n))
                start+=n
    return segments


def build(year=None):
    year=year or date.today().year
    active=set()
    for path,_ in CURRENT_SOURCES:
        with path.open(encoding='utf-8-sig',newline='') as f:
            active.update(key(r) for r in csv.DictReader(f) if int(r['year'])==year)
    if not active:raise ValueError(f'No loaded event activity for {year}; refresh sources before generating this year.')
    models=compile_rows((r for r in event_rows() if key(r) in active),year)
    paths=[ROOT/'data/raw/ged261-csv.zip',*[p for p,_ in CURRENT_SOURCES]]
    sources=[]
    for p in paths:
        digest=hashlib.sha256()
        with p.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
        sources.append(dict(path=str(p.relative_to(ROOT)),sha256=digest.hexdigest()))
    segments=overview_segments(models,year)
    return dict(year=year,coverage_through=CANDIDATE_BOUNDARY,conflicts=models,segments=segments,
                total=sum(m['years'][str(year)]['total'] for m in models),
                side_total=sum(m['years'][str(year)]['counts'][s] for m in models for s in 'abcd'),colors=COLORS,sources=sources,
                method='GED event ID deduplication, latest candidate revision wins. Death categories sum to best. Year is the source year field. Current means recorded activity in the selected year. All years means all loaded GED years for that conflict, not annual ACD totals.')


def write(data):
    payload='window.WAR_MAPS_SIDES='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n'
    for folder in ('web','outputs/web'):
        (ROOT/folder).mkdir(exist_ok=True)
        (ROOT/folder/'conflict-sides-data.js').write_text(payload)


if __name__=='__main__':
    d=build();write(d);print(len(d['conflicts']),'current conflicts;',d['total'],'current-year deaths')
