(()=>{'use strict';
const originalPalettes=[['Black / white / red','#000000','#ffffff','#f23b42'],['Navy / black / red','#080f18','#000000','#ef3340'],['Dark cyan / fuchsia / black','#126b78','#ff33c4','#000000'],['Site navy / pale ink / red','#080f18','#e7e6dc','#ef3340'],['Deep blue / cyan / coral','#10243a','#58dfef','#ff786b'],['Slate / white / fuchsia','#263b4d','#ffffff','#ff42bc'],['Cyan / black / red','#70b8c1','#000000','#b71832'],['Graphite / silver / red','#24272d','#d5dce1','#ff4a59'],['Warm grey / black / red','#b7b3ad','#000000','#b51d2e'],['Petrol / pale cyan / fuchsia','#123e4a','#c1edf0','#ff4bbf']];
const graphitePalettes=[
 ['Silver background / graphite / red','#d5dce1','#24272d','#c92539'],
 ['Bright silver background / graphite / red','#edf0f2','#24272d','#d52b3e'],
 ['Brushed silver background / graphite / red','#b9c2ca','#24272d','#b91e32'],
 ['Site navy background / deep graphite / red','#080f18','#24272d','#ff4a59'],
 ['Site navy background / medium graphite / red','#080f18','#59616b','#ff4a59'],
 ['Site navy background / light graphite / red','#080f18','#7b858f','#ff4a59']
];
const circlePalettes=[['Black','#000000'],['Deep graphite','#14171c'],['Dark graphite','#1b1f25'],['Medium graphite','#383e46'],['Light graphite','#59616b'],['Cool slate','#768491'],['Brushed silver','#b9c2ca'],['Silver','#d5dce1'],['Muted petrol','#31525a'],['Warm pewter','#938c84']].map(([name,circle])=>[name+' circle','#080f18','#24272d','#ff4a59',circle]);
const requestedFamily=new URLSearchParams(location.search).get('palette'),family=['graphite','silver-circle','circle-colors'].includes(requestedFamily)?requestedFamily:'all',palettes=family==='circle-colors'?circlePalettes:family==='silver-circle'?[['Site navy / silver circle / graphite + red','#080f18','#24272d','#ff4a59','#d5dce1']]:family==='graphite'?graphitePalettes:originalPalettes;
if(family==='circle-colors'){
 document.title='Russia–Ukraine 2026 · ten circle colours';
 document.querySelector('h1').textContent='Ten circle colours · Russia–Ukraine 2026';
 const note=document.createElement('p');note.textContent='Only the enclosing circle colour changes. Site navy background, graphite/red dots, dot size and spacing stay fixed. The circle touches the outermost dots, with no added rim or stroke.';document.querySelector('#palettes').before(note);
}
if(family==='silver-circle'){
 document.title='Russia–Ukraine 2026 · silver circle on site navy';
 document.querySelector('h1').textContent='Site navy / silver circle / graphite + red · Russia–Ukraine 2026';
 const link=document.createElement('a');link.href='conflict-sides-demo.html?palette=graphite';link.textContent='Compare previous graphite arrangements';document.querySelector('#palettes').before(link);
}

if(family==='graphite'){
 document.title='Russia–Ukraine 2026 · graphite, silver and red';
 document.querySelector('h1').textContent='Red + graphite dots / silver or site navy · Russia–Ukraine 2026';
 const link=document.createElement('a');link.href='conflict-sides-demo.html';link.textContent='Compare the original ten colour combinations';document.querySelector('#palettes').before(link);
}
const m=window.WAR_MAPS_SIDES.conflicts.find(m=>m.id==='1:13243'),b=m.years['2026'],api=window.WarMapsSidesGeometry,order=api.sideOrder(b.counts).filter(f=>b.counts[f]>0),n=order.reduce((s,f)=>s+b.counts[f],0),g=api.circle(n);let span=1;for(const [x] of g.points)span=Math.max(span,2*Math.abs(x));const base=Math.min(1100/span,12),pitch=base*.66,r=base*.22,extent=Math.max(...g.points.map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))))*pitch+r+8;
const enclosingRadius=Math.max(...g.points.map(([x,y])=>Math.hypot(x,y)))*pitch+r;
const backing=p=>p[4]?`<circle class="backing-circle" cx="0" cy="0" r="${enclosingRadius}" fill="${p[4]}"/>`:'';
const paths=order.map((f,k)=>{const start=order.slice(0,k).reduce((s,f)=>s+b.counts[f],0);return g.points.slice(start,start+b.counts[f]).map(([x,y])=>`M${x*pitch+r} ${y*pitch}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0Z`).join('')});
const boundary=(g.points[b.counts[order[0]]-1][1]+g.points[b.counts[order[0]]][1])*pitch/2;
document.body.insertAdjacentHTML('beforeend',`<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>${paths.map((d,k)=>`<path id="demo-side-${k}" d="${d}"/>`).join('')}</defs></svg>`);
const colors=(p,k)=>p[k+2];const art=p=>paths.map((d,k)=>`<use data-count="${b.counts[order[k]]}" href="#demo-side-${k}" fill="${colors(p,k)}" stroke="none"/>`).join('');
const title=f=>b.labels[f]?.join('; ')||'Side '+f.toUpperCase();document.querySelector('#summary').textContent=`${n.toLocaleString()} named-side deaths · ${b.counts.civilian.toLocaleString()} civilian · ${b.counts.unknown.toLocaleString()} unknown · ${b.total.toLocaleString()} total. Source: ${b.sources.join(', ')}.`;
document.querySelector('#palettes').innerHTML=palettes.map((p,i)=>`<article><h2>${i+1}. ${p[0]}</h2><div class="key">${order.map((f,k)=>`<span><i style="background:${colors(p,k)}"></i>${title(f)} / ${b.counts[f].toLocaleString()}</span>`).join('')}</div><svg class="chart" width="360" height="360" viewBox="${-extent} ${-extent} ${2*extent} ${2*extent}" aria-label="${p[0]}, all ${n} named-side deaths"><rect x="${-extent}" y="${-extent}" width="${2*extent}" height="${2*extent}" fill="${p[1]}"/>${backing(p)}${art(p)}</svg><p>Enlarged detail across the side boundary</p><svg class="detail" viewBox="-45 ${boundary-18} 90 36"><rect x="-45" y="${boundary-18}" width="90" height="36" fill="${p[1]}"/>${backing(p)}${art(p)}</svg><p class="chips">Background ${p[1]}${p[4]?` · circle ${p[4]}`:''} · smaller side ${p[2]} · larger side ${p[3]}</p><button data-export="${i}">Download SVG ${i+1}</button></article>`).join('');
document.querySelector('#size').onchange=e=>document.querySelectorAll('.chart').forEach(s=>{s.setAttribute('width',e.target.value);s.setAttribute('height',e.target.value)});
document.querySelector('#palettes').onclick=e=>{if(!e.target.matches('[data-export]'))return;const i=Number(e.target.dataset.export),p=palettes[i];let offset=0;const circles=order.map((f,k)=>{const points=g.points.slice(offset,offset+b.counts[f]);offset+=b.counts[f];return `<g fill="${colors(p,k)}">${points.map(([x,y])=>`<circle cx="${x*pitch}" cy="${y*pitch}" r="${r}"/>`).join('')}</g>`}).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-extent} ${-extent} ${extent*2} ${extent*2}"><title>Russia–Ukraine 2026 / ${p[0]}</title><desc>${n} named-side deaths, one circle per death. Civilian and unknown deaths excluded from this named-side comparison.</desc><rect x="${-extent}" y="${-extent}" width="${extent*2}" height="${extent*2}" fill="${p[1]}"/>${backing(p)}${circles}</svg>`,url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=`russia-ukraine-2026-${family==='all'?'palette':family}-${i+1}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
if(family==='silver-circle'){document.querySelector('#size').value='520';document.querySelector('#size').dispatchEvent(new Event('change'));}
window.sidePaletteDemo={count:palettes.length,family,enclosingRadius,n,basePitch:base,pitch,radius:r};})();