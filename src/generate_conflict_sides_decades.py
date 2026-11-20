"""Decade volumes of the selected Conflict Sides atlas; no repeated annual pages."""
import io
import json
from reportlab.pdfgen import canvas
from src.conflict_sides import build, ROOT, overview_segments
from src.generate_conflict_sides import atlas_scope, qualifies_for_print, printable_years, year_page, overview_page, base
from src.generate_network_print import fonts, text, para


def decade_models(data,start,end):
    result=[]
    for m in atlas_scope(data)['conflicts']:
        if not qualifies_for_print(m,data['year']):continue
        years={y:m['years'][y] for y in printable_years(m) if start<=int(y)<=end}
        if years:result.append(dict(m,years=years))
    return result


def decade_overview(models,start,end,coverage):
    label=f'{start}-{end}'
    aggregated=[]
    for m in models:
        counts={f:sum(b['counts'][f] for b in m['years'].values()) for f in ('a','b','c','d','civilian','unknown')}
        aggregated.append(dict(m,years={label:dict(counts=counts,total=sum(counts.values()))}))
    aggregated.sort(key=lambda m:(-max(m['years'][label]['counts'][s] for s in 'abcd'),-m['years'][label]['total'],m['id']))
    return dict(year=label,coverage_through=coverage,conflicts=aggregated,
                segments=overview_segments(aggregated,label),
                total=sum(m['years'][label]['total'] for m in aggregated),
                side_total=sum(m['years'][label]['counts'][s] for m in aggregated for s in 'abcd'))


def generate(data=None):
    data=build() if data is None else data
    fonts();folder=ROOT/'outputs/print';folder.mkdir(exist_ok=True)
    results=[]
    for decade,start,end in [('2020s',2020,min(2029,data['year'])),('2010s',2010,2019),('2000s',2001,2009)]:
        models=decade_models(data,start,end)
        coverage=data['coverage_through'] if end==data['year'] else f'{end}-12-31'
        overview=decade_overview(models,start,end,coverage)
        out=folder/f'war-maps-conflict-sides-{decade}.pdf'
        buffer=io.BytesIO();c=canvas.Canvas(buffer,pagesize=(612,792),pageCompression=1,invariant=1)
        c.setTitle(f'War Maps / Conflict Sides / {start}-{end}');c.setAuthor('The War Maps Project')
        base(c,1);text(c,'CONFLICT SIDES',32,680,35,bold=True)
        text(c,f'{start}-{end}',32,632,30,bold=True)
        text(c,f"{overview['total']:,} DEATHS / {len(models)} CONFLICTS",32,588,21,bold=True)
        para(c,f"This volume contains the {start}-{end} annual pages of the selected Conflict Sides atlas. It follows conflicts active in {data['year']} with at least 1,000 deaths in 2007-{data['year']}. Each annual page appears in one decade volume only. Years with no deaths are omitted.",32,535,540,12)
        para(c,'One dot represents one death. The opening spiral summarizes this volume: named-side deaths follow the outer edge inward, beginning with the greatest loss in black. Civilian and unknown deaths appear in separate blocks below it. Annual pages use the death-circle poster design, with the smaller side black at the top and the larger side red.',32,420,540,12)
        para(c,'Conflicts with exclusively civilian deaths are reserved for a separate civilian deaths book and excluded here, including from the overview. Civilian and unknown deaths within mixed conflicts remain with those conflicts. A second circle, when used, leaves the already-counted side deaths empty.',32,300,540,12)
        para(c,'Uppsala Conflict Data Program / GED 26.1 and loaded candidate releases. Latest event revisions replace earlier records with the same event ID. Categories sum to the source best estimate. The 2000s volume begins in 2001, preserving the atlas scope of this century.',32,190,540,11)
        para(c,'Use the PDF bookmarks to navigate conflicts and years. Sources: https://ucdp.uu.se/downloads/\nProject: https://github.com/SJAH9/war-maps-project',32,85,540,10)
        c.linkURL('https://ucdp.uu.se/downloads/',(32,63,580,88));c.linkURL('https://github.com/SJAH9/war-maps-project',(32,40,580,63));c.showPage()
        overview_page(c,overview);page=3;index=[]
        for m in models:
            entry=dict(conflict=m['id'],title=m['title'],first_page=page,years=[]);index.append(entry)
            for i,y in enumerate(sorted(m['years'],key=int,reverse=True)):
                bookmark=f"{m['id']}-{y}";c.bookmarkPage(bookmark)
                if i==0:c.addOutlineEntry(m['title'],bookmark,level=0,closed=True)
                c.addOutlineEntry(y,bookmark,level=1)
                audit=year_page(c,m,y,page)
                entry['years'].append(dict(year=int(y),page=page,total=m['years'][y]['total'],**audit));page+=1
        c.save();pending=out.with_suffix('.building.pdf');pending.write_bytes(buffer.getvalue());pending.replace(out)
        manifest=dict(decade=decade,first_year=start,last_year=end,selection_year=data['year'],coverage_through=coverage,minimum_deaths=1000,window_start=2007,window_end=data['year'],civilian_only_conflicts_excluded=True,pages=page-1,total=overview['total'],sources=data['sources'],index=index)
        out.with_suffix('.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        results.append(manifest);print(out,page-1,'pages',flush=True)
    return results


if __name__=='__main__':generate()
