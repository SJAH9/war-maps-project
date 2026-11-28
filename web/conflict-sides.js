/* Exact counts: geometry changes positions, never the number of represented lives. */
(() => {
  const fields=['a','b','c','d','civilian','unknown'];
  const posterColors={a:'#ac2529',b:'#000000',c:'#999999',d:'#505050',civilian:'#777b75',unknown:'#777b75'};
  function spiral(n) {
    const p=new Float32Array(n*2), outer=Math.sqrt(n/Math.PI)||1;
    for(let i=0;i<n;i++){const r=Math.sqrt((n-i)/Math.PI),angle=2*Math.PI*(outer-r);p[2*i]=Math.sin(angle)*r;p[2*i+1]=-Math.cos(angle)*r;}
    return {points:p,pitch:1,extent:outer};
  }
  function circle(n) {
    if(!n)return {points:[],extent:1};
    const r=Math.ceil(Math.sqrt(n*Math.sqrt(3)/(2*Math.PI)))+3,all=[];
    for(let y=-2*r;y<=2*r;y++)for(let x=-r;x<=r;x++){const a=x+.5*((y%2+2)%2),b=y*Math.sqrt(3)/2;all.push([a,b]);}
    all.sort((a,b)=>(a[0]*a[0]+a[1]*a[1])-(b[0]*b[0]+b[1]*b[1])||a[1]-b[1]||a[0]-b[0]);
    const points=all.slice(0,n).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    return {points,extent:Math.max(1,...points.slice(0,1).map(p=>Math.abs(p[1])))};
  }
  function segmentAt(segments,index){let lo=0,hi=segments.length;while(lo<hi){const m=(lo+hi)>>1;if(segments[m].end<=index)lo=m+1;else hi=m;}return segments[lo]?.start<=index?segments[lo]:null;}
  const sideOrder=counts=>'abcd'.split('').sort((a,b)=>(counts[a]||0)-(counts[b]||0)||a.localeCompare(b));
  function detailColors(counts,clean=false){
    const colors={...posterColors},smaller=(counts.a||0)<=(counts.b||0)?'a':'b';
    colors[smaller]=clean?'#000000':'#484848';colors[smaller==='a'?'b':'a']='#ac2529';
    return colors;
  }
  function exteriorLayout(counts,pitch){
    let columns={civilian:Math.min(150,Math.max(1,Math.floor(900/pitch))),unknown:Math.min(40,Math.max(1,Math.floor(210/pitch)))};
    let x={civilian:48,unknown:1030};
    const height=()=>Math.max(...['civilian','unknown'].map(f=>Math.ceil(counts[f]/columns[f])*pitch));
    if(height()>150){
      // Large historical totals share the footer width in proportion to counts,
      // giving the two exterior groups comparable heights at the circle's scale.
      const total=counts.civilian+counts.unknown;
      const civilianWidth=Math.max(210,Math.min(930,1140*counts.civilian/total));
      columns={civilian:Math.max(1,Math.floor(civilianWidth/pitch)),unknown:Math.max(1,Math.floor((1140-civilianWidth)/pitch))};
      x.unknown=48+civilianWidth+60;
    }
    return {columns,x};
  }
  function secondaryCircle(counts){
    const combined=counts.civilian+counts.unknown,named='abcd'.split('').reduce((n,f)=>n+(counts[f]||0),0);
    if(combined<=named)return null;
    return {total:combined+named,start:named,drawn:combined};
  }
  const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function centuryBucket(model){
    const buckets=Object.entries(model.years).filter(([year])=>Number(year)>2000).map(([,b])=>b);
    const result={counts:Object.fromEntries(fields.map(f=>[f,0])),labels:{a:[],b:[],c:[],d:[]},total:0,events:0,sources:[]};
    for(const b of buckets){
      for(const f of fields)result.counts[f]+=b.counts[f]||0;
      for(const f of 'abcd')result.labels[f].push(...(b.labels[f]||[]));
      result.total+=b.total;result.events+=b.events;result.sources.push(...b.sources);
    }
    for(const f of 'abcd')result.labels[f]=[...new Set(result.labels[f])];
    result.sources=[...new Set(result.sources)];return result;
  }
  const api={spiral,circle,segmentAt,sideOrder,detailColors,exteriorLayout,secondaryCircle,centuryBucket};
  if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;
  window.WarMapsSidesGeometry=api;
  if(document.body.dataset.sidesDemo==='true')return;
  const d=window.WAR_MAPS_SIDES,$=id=>document.getElementById(id),fmt=n=>n.toLocaleString(),measure=document.createElement('canvas').getContext('2d');
  // Canvas is used only for text metrics; the displayed artwork is SVG.
  const ctx=measure;
  let viewWidth=2400,viewHeight=2400;
  if(!d){$('total').textContent='Conflict data is unavailable. Rebuild the atlas or reload online.';return;}
  const models=new Map(d.conflicts.map(m=>[m.id,m])),names={a:'Side A',b:'Side B',c:'Side C',d:'Side D',civilian:'Civilians',unknown:'Unknown side'};
  let svgParts=[],svgWidth=0,svgHeight=0,cleanCircles=false,exportCircleElements=false;
  let hit=new Map(),points=[],scale=1,mode='overview',active=null;
  $('coverage').textContent=`${d.year} overview · loaded through ${d.coverage_through} · ${d.conflicts.length} current conflicts`;
  $('method').textContent=d.method;
  for(const m of d.conflicts.filter(m=>m.all.total>0).sort((a,b)=>a.title.localeCompare(b.title))){const o=new Option(m.title,m.id);$('conflict').add(o);}
  const lightArtwork={'--paper':'#080f18','--ink':'#e7e6dc','--muted':'#a7b7bf','--line':'#34444e'};
  const themeColor=name=>cleanCircles&&lightArtwork[name]||getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function clear(){svgParts=[];svgWidth=viewWidth;svgHeight=viewHeight;hit=new Map();points=[];}
  function dots(list,color,r){
    if(cleanCircles){
      // Hexagonal centres stay one pitch apart; pitch is 66% of its previous value; dot radius stays unchanged.
      r*=.22/(.31*.66);
      for(let start=0;start<list.length;start+=2048){
        const chunk=list.slice(start,start+2048);
        if(exportCircleElements){
          svgParts.push(`<g fill="${xml(color)}" stroke="none" shape-rendering="geometricPrecision">${chunk.map(([x,y])=>`<circle data-dot-count="1" cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`);
        }else{
          const path=chunk.map(([x,y])=>`M${x+r} ${y}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0Z`).join('');
          svgParts.push(`<path data-dot-count="${chunk.length}" data-dot-radius="${r}" d="${path}" fill="${xml(color)}" stroke="none" shape-rendering="geometricPrecision"/>`);
        }
      }
      return;
    }

    const preview=mode==='detail';
    const graySide=preview&&color==='#484848';
    const solidSide=preview&&(graySide||color==='#ac2529');
    // Preserve the existing dot inset and geometry; outline both named sides in white.
    if(solidSide)r*=.89;
    const hollow=preview&&!solidSide;
    const outlined=solidSide||(preview||color==='#ffffff'||color==='#000000'||color==='#080808');
    const stroke=solidSide?'#ffffff':(hollow?color:themeColor('--muted'));
    // Bound path complexity: large all-years series can exceed browser rasterizer limits.
    for(let start=0;start<list.length;start+=2048){
      const chunk=list.slice(start,start+2048),path=chunk.map(([x,y])=>`M${(x+r).toFixed(4)} ${y.toFixed(4)}a${r.toFixed(4)} ${r.toFixed(4)} 0 1 0 ${(-2*r).toFixed(4)} 0a${r.toFixed(4)} ${r.toFixed(4)} 0 1 0 ${(2*r).toFixed(4)} 0`).join('');
      svgParts.push(`<path data-dot-count="${chunk.length}" d="${path}" fill="${hollow?'none':xml(color)}"${outlined?` stroke="${xml(stroke)}" stroke-width="${r*.22}"`:''}/>`);

    }
  }
  function legend(counts,labels={}){
    $('legend').replaceChildren();$('legend').classList.toggle('clean-circles',cleanCircles);
    for(const f of (mode==='overview'?fields.slice(0,4):fields)){if(!counts[f]&&['c','d'].includes(f))continue;const s=document.createElement('span'),i=document.createElement('i');i.style.background=(mode==='detail'?detailColors(counts,cleanCircles):d.colors)[f];s.append(i,`${names[f]} / ${fmt(counts[f]||0)}`);if(labels[f]?.length)s.title=labels[f].join('; ');$('legend').append(s);}
  }
  function table(items){$('rows').replaceChildren();for(const [title,b,id] of items){const tr=document.createElement('tr'),td=document.createElement('td');if(id){const btn=document.createElement('button');btn.textContent=title;btn.onclick=()=>open(id);td.append(btn);}else td.textContent=title;tr.append(td);for(const f of [...fields,'total']){const c=document.createElement('td');c.textContent=fmt(f==='total'?b.total:b.counts[f]||0);tr.append(c);}$('rows').append(tr);}}
  function overview(){ $('stage').classList.remove('poster-view');$('stage').classList.add('overview-view');viewWidth=2400;viewHeight=2400;for(const id of ['view-title','total','instructions','legend'])$(id).classList.remove('poster-accessible'); mode='overview';cleanCircles=false;active=null;$('conflict').value='';$('year').replaceChildren(new Option(String(d.year),String(d.year)));$('year').disabled=true;clear();
    const geom=spiral(d.side_total);scale=1100/geom.extent;points=Array.from({length:d.side_total},(_,i)=>[1200+geom.points[2*i]*scale,1200+geom.points[2*i+1]*scale]);
    const totals=Object.fromEntries(fields.map(f=>[f,0]));
    for(const m of d.conflicts)for(const f of ['civilian','unknown'])totals[f]+=m.years[d.year].counts[f]||0;
    const factor=2400/1296,exterior=exteriorLayout(totals,scale/factor),outsideY=2540;
    viewHeight=Math.ceil(outsideY+Math.max(...['civilian','unknown'].map(f=>Math.ceil(totals[f]/exterior.columns[f])*scale))+120);
    svgHeight=viewHeight;
    for(const s of d.segments){dots(points.slice(s.start,s.end),d.colors[s.side],scale*.32);totals[s.side]+=s.end-s.start;}
    for(const f of ['civilian','unknown']){
      const x=exterior.x[f]*factor,cols=exterior.columns[f];
      const caption=`${f==='civilian'?'CIVILIANS':'UNKNOWN SIDE'} / ${fmt(totals[f])}`;
      svgText(caption,x,outsideY-45,30,true);
      dots(Array.from({length:totals[f]},(_,i)=>[x+i%cols*scale,outsideY+Math.floor(i/cols)*scale]),posterColors[f],scale*.32);
    }
    points.forEach(([x,y],i)=>{const key=`${Math.floor(x/8)},${Math.floor(y/8)}`;if(!hit.has(key))hit.set(key,[]);hit.get(key).push(i);});
    $('view-title').textContent=`${d.year} / All current conflicts`;$('total').textContent=`${fmt(d.side_total)} named-side deaths · one continuous spiral`;
    $('instructions').textContent='Begin at the top of the outer edge and follow clockwise inward. Conflicts are ordered by their largest side loss; each conflict’s sides follow in descending loss, with white for A, black for B, and gray shades for C and D. Civilian and unknown deaths appear below the spiral as separate blocks at the same dot scale. Select a dot to open that conflict. Zoom to separate individual dots.';
    $('dots').setAttribute('aria-label',`${fmt(d.side_total)} named-side deaths in the ${d.year} spiral, with civilians and unknown deaths in separate blocks below. Select a conflict in the table for its details.`);
    legend(totals);table(d.conflicts.map(m=>[m.title,m.years[d.year],m.id]));$('table-title').textContent=`${d.year} conflict totals / all categories (spiral shows named sides only)`;updateDownload();renderSvg();}
  function detail(exportBucket=null,exportPeriod=null){
    const m=models.get(active),period=$('year').value,b=exportBucket||(period==='all'?m.all:m.years[period]);
    cleanCircles='abcd'.split('').filter(f=>(b.counts[f]||0)>0).length===2;
    const n='abcd'.split('').reduce((sum,f)=>sum+(b.counts[f]||0),0),g=circle(n),order=sideOrder(b.counts),colors=detailColors(b.counts,cleanCircles);
    const second=secondaryCircle(b.counts),secondGeometry=second?circle(second.total):null;
    let span=1;for(const [x] of (secondGeometry||g).points)span=Math.max(span,2*Math.abs(x));
    // Master poster coordinates: same circle, same dot pitch in the exterior groups.
    const basePitch=Math.min(1100/span,12),pitch=basePitch*(cleanCircles?.66:1),exterior=exteriorLayout(b.counts,pitch),columns=exterior.columns;
    const font=getComputedStyle(document.body).fontFamily;
    const wrapped=(value,size,width)=>{ctx.font=`${size}px ${font}`;const lines=[];let line='';for(const word of value.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
    const present=order.filter(f=>b.counts[f]||b.labels[f]?.length);
    const sideLines=present.map(f=>wrapped((b.labels[f]||[]).join('; ')||names[f],20,550));
    const legendHeight=Math.max(1,...sideLines.map(l=>l.length))*25+70;
    const exteriorY=1371+Math.ceil(present.length/2)*legendHeight+35;
    const secondCenter=exteriorY+580;
    const bottom=second?secondCenter+610:exteriorY+Math.max(...['civilian','unknown'].map(f=>Math.ceil(b.counts[f]/columns[f])*pitch))+45;
    const height=Math.max(1728,bottom+170);
    viewWidth=2592;viewHeight=Math.ceil(height*2);clear();svgWidth=1296;svgHeight=height;
    $('stage').classList.remove('overview-view');$('stage').classList.add('poster-view');
    const label=(value,x,y,size,bold=false,color='--ink')=>{svgText(value,x,y,size,bold,color);};
    const titleText=`${m.title.toUpperCase()} / ${exportPeriod||(period==='all'?'ALL YEARS':period)}`;
    let titleSize=32,title=wrapped(titleText,titleSize,850);while(title.length>2&&titleSize>14){titleSize--;title=wrapped(titleText,titleSize,850);}
    title.forEach((line,i)=>label(line,48,88+i*37,titleSize,true));
    label(`${fmt(b.total)} DEATHS`,48,158+(title.length-1)*37,53,true);
    label('ONE DOT / ONE DEATH',49,190+(title.length-1)*37,14,false,'--muted');
    label('WAR MAPS',1000,72,25,true);label('THE STRUCTURE OF CONFLICT',1000,94,9,false,'--muted');
    svgParts.push('<!-- compass -->');
    let offset=0;
    for(const f of order){const count=b.counts[f]||0;dots(g.points.slice(offset,offset+count).map(([x,y])=>[648+x*pitch,773+y*pitch]),colors[f],pitch*.31);offset+=count;}
    if(!n)label('No deaths assigned to named sides',390,773,22);
    present.forEach((f,i)=>{
      const x=48+(i%2)*600,y=1371+Math.floor(i/2)*legendHeight;
      dots([[x+6,y-8]],colors[f],5);
      label(`${names[f].toUpperCase()} / ${fmt(b.counts[f])}`,x+22,y,22,true);
      sideLines[i].forEach((line,j)=>label(line,x+22,y+27+j*25,20));
      label(`${n?(100*b.counts[f]/n).toFixed(2):'0.00'}% OF THE ${fmt(n)} DEATHS IN THE CIRCLE`,x+22,y+32+sideLines[i].length*25,12,false,'--muted');
    });
    if(second){
      label(`CIVILIANS + UNKNOWN / ${fmt(second.drawn)}`,48,exteriorY-26,24,true);
      label(`CIVILIANS / ${fmt(b.counts.civilian)}`,48,exteriorY+8,18,true);
      label(`UNKNOWN SIDE / ${fmt(b.counts.unknown)}`,648,exteriorY+8,18,true);
      dots(secondGeometry.points.slice(second.start).map(([x,y])=>[648+x*pitch,secondCenter+y*pitch]),colors.civilian,pitch*.31);
      label(`CIVILIANS + UNKNOWN / ${fmt(second.drawn)}`,48,secondCenter+575,18,true);
      label(`SIDE DEATHS ALREADY SHOWN ABOVE / ${fmt(n)}`,648,secondCenter+575,16,false,'--muted');
    }else for(const f of ['civilian','unknown']){const x=exterior.x[f];
      label(`${f==='civilian'?'CIVILIANS':'UNKNOWN SIDE'} / ${fmt(b.counts[f])}`,x,exteriorY-26,17,true);
      dots(Array.from({length:b.counts[f]},(_,i)=>[x+i%columns[f]*pitch,exteriorY+Math.floor(i/columns[f])*pitch]),colors[f],pitch*.31);
    }
    svgParts.push(`<path d="M48 ${bottom}H1248" stroke="${xml(themeColor('--line'))}"/>`);
    const source=`Source: ${b.sources.join(', ')} / ${fmt(b.events)} records.`;
    wrapped(source,13,1200).forEach((line,i)=>label(line,48,bottom+30+i*18,13,false,'--muted'));
    label('Named-side deaths form the circle, smallest side at the top.',48,height-65,14,false,'--muted');
    label(second?'Second circle: all deaths; civilians + unknown drawn. Side deaths above occupy the empty portion.':'Civilian and unknown-side deaths appear outside it at the same dot size.',48,height-42,14,false,'--muted');
    $('view-title').textContent=m.title;$('total').textContent=`${fmt(b.total)} deaths / ${period==='all'?'All loaded years':period}`;
    $('instructions').textContent='Sides are ordered by casualties, smallest at the top. '+(second?`The second circle is sized for all ${fmt(second.total)} deaths. Its ${fmt(second.drawn)} civilian and unknown deaths are drawn together. The empty portion represents ${fmt(n)} side deaths already drawn in the first circle. Both circles use the same dot scale; each death is drawn once.`:'Civilians and unknown-side deaths are outside the circle, at the same dot size.');
    if(cleanCircles)$('instructions').textContent+=' Solid vector circles: same dot size, 34% closer centres. Use 4× or 8× to inspect individual dots; Fit is an overview.';
    $('dots').setAttribute('aria-label',`${m.title}: ${fmt(b.total)} deaths, ${period}. ${$('instructions').textContent}`);
    legend(b.counts,b.labels);for(const id of ['view-title','total','instructions','legend'])$(id).classList.add('poster-accessible');
    const named=Object.entries(b.labels).filter(([s,a])=>a.length).map(([s,a])=>`${names[s]}: ${a.join('; ')}`).join(' | ');
    table([[named||m.title,b,null]]);$('table-title').textContent='Recorded sides and death counts';$('hover').textContent='';updateDownload();renderSvg();
  }
  function renderSvg(){
    const surface=$('dots');$('stage').classList.toggle('clean-circles',cleanCircles);
    surface.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`);
    surface.setAttribute('width',svgWidth);surface.setAttribute('height',svgHeight);
    surface.innerHTML=`<title>${xml($('view-title').textContent)}</title><desc>${xml($('dots').getAttribute('aria-label'))}</desc><rect width="100%" height="100%" fill="${xml(themeColor('--paper'))}"/>${svgParts.join('').replace('<!-- compass -->','<image href="assets/compass-rose.svg" x="1190" y="38" width="58" height="68"/>')}`;
  }
  function svgText(value,x,y,size,bold=false,color='--ink'){
    svgParts.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold?700:400}" font-family="${xml(getComputedStyle(document.body).fontFamily)}" fill="${xml(themeColor(color))}">${xml(value)}</text>`);
  }
  function updateDownload(){
    $('download-svg').disabled=mode==='detail'&&$('year').value!=='all'&&Number($('year').value)<=2000;
    $('download-svg').title=$('download-svg').disabled?'SVG downloads cover 2001 onward':'Download this view as vector artwork (2001 onward)';
  }
  async function shareView(){
    const url=new URL(location.href);url.search='';url.hash='';
    if(mode==='detail'){url.searchParams.set('conflict',active);url.searchParams.set('year',$('year').value);}
    const title=mode==='detail'?`${models.get(active).title} / ${$('year').value==='all'?'All years':$('year').value} · Conflict Sides`:`${d.year} · Conflict Sides`;
    $('share-status').textContent='';$('share-link-wrap').hidden=true;
    if(navigator.share){
      try{await navigator.share({title,url:url.href});$('share-status').textContent='Share opened.';return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url.href);$('share-status').textContent='Permalink copied.';
    }catch(error){
      $('share-link').value=url.href;$('share-link-wrap').hidden=false;$('share-link').focus();$('share-link').select();$('share-status').textContent='Copy this permalink to share the view.';
    }
  }
  $('share-view').onclick=shareView;$('share-circle').onclick=shareView;
  $('download-svg').onclick=async()=>{
    const button=$('download-svg'),isDetail=mode==='detail',model=models.get(active),period=$('year').value;
    button.disabled=true;button.textContent='Preparing SVG…';
    try{
      let bucket=isDetail?(period==='all'?centuryBucket(model):model.years[period]):null;
      const years=isDetail?Object.keys(model.years).filter(y=>Number(y)>2000).sort((a,b)=>a-b):[];
      const range=isDetail&&period==='all'?(years.length?`${years[0]}–${years.at(-1)}`:'2001 onward'):period;
      if(isDetail){exportCircleElements=true;detail(bucket,range);}
      const parts=[...svgParts],width=svgWidth,height=svgHeight+(isDetail?0:240),paper=themeColor('--paper');
      const title=isDetail?`${model.title} / ${range}`:`${d.year} / All current conflicts`;
      const description=isDetail?`${bucket.total} deaths. ${bucket.sources.join(', ')}. One dot per death. Coverage: 2001 onward.`:`${d.total} deaths. ${d.sources.join(', ')}. One dot per death. Coverage through ${d.coverage_through}.`;
      if(isDetail){exportCircleElements=false;detail();}
      let compassSvg='';
      if(isDetail){
        const response=await fetch('assets/compass-rose.svg');if(!response.ok)throw new Error('Compass asset unavailable');
        const source=await response.text(),doc=new DOMParser().parseFromString(source,'image/svg+xml');
        const root=doc.documentElement;root.setAttribute('x','1190');root.setAttribute('y','38');root.setAttribute('width','58');root.setAttribute('height','68');
        compassSvg=new XMLSerializer().serializeToString(root);
      }
      const header=isDetail?'':`<text x="60" y="60" fill="${xml(themeColor('--ink'))}" font-size="36">WAR MAPS / ${xml(title)}</text><text x="60" y="105" fill="${xml(themeColor('--ink'))}" font-size="24">${d.total.toLocaleString()} deaths / through ${xml(d.coverage_through)} / One dot per death</text>${'abcd'.split('').map((f,i)=>`<circle cx="${70+i*300}" cy="150" r="8" fill="${d.colors[f]}" stroke="${xml(themeColor('--muted'))}"/><text x="${90+i*300}" y="158" fill="${xml(themeColor('--ink'))}" font-size="24">Side ${f.toUpperCase()}</text>`).join('')}`;
      const artwork=parts.join('').replace('<!-- compass -->',compassSvg);

      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${xml(title)}</title><desc>${xml(description)}</desc><metadata>${xml(JSON.stringify(isDetail?{conflict:model.id,period:range,...bucket}:{year:d.year,total:d.total,side_total:d.side_total,sources:d.sources}))}</metadata><rect width="100%" height="100%" fill="${xml(paper)}"/>${header}${isDetail?artwork:`<g transform="translate(0 180)">${artwork}</g>`}</svg>`;
      const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download=`war-maps-conflict-sides-${isDetail?model.id:'all-conflicts'}-${range}.svg`.replace(/[^a-zA-Z0-9._-]/g,'-');
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('hover').textContent='SVG downloaded.';
    }catch(error){$('hover').textContent=`Could not export SVG: ${error.message}`;}
    finally{exportCircleElements=false;button.textContent='Download SVG';updateDownload();}
  };
  function reveal(){ $('zoom').value='1';resize();$('stage').scrollTop=0;$('stage').scrollLeft=0;$('view-title').setAttribute('tabindex','-1');$('view-title').focus({preventScroll:true});(mode==='detail'?$('stage'):$('view-title')).scrollIntoView({block:'start',behavior:'instant'}); }
  function open(id){if(!models.has(id))return;active=id;mode='detail';$('conflict').value=id;$('year').disabled=false;$('year').replaceChildren(new Option('All years','all'));for(const y of Object.keys(models.get(id).years).sort((a,b)=>b-a))$('year').add(new Option(y,y));detail();reveal();}
  function pick(e){if(mode!=='overview')return null;const r=$('dots').getBoundingClientRect(),x=(e.clientX-r.left)*2400/r.width,y=(e.clientY-r.top)*viewHeight/r.height,cx=Math.floor(x/8),cy=Math.floor(y/8);let best=-1,dist=Math.max(scale*.6,6)**2;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const i of hit.get(`${cx+a},${cy+b}`)||[]){const p=points[i],q=(p[0]-x)**2+(p[1]-y)**2;if(q<dist){dist=q;best=i;}}return best<0?null:segmentAt(d.segments,best);}
  $('dots').onclick=e=>{const s=pick(e);if(s)open(s.conflict);};
  $('dots').onpointermove=e=>{const s=pick(e);if(s){const m=models.get(s.conflict);$('hover').textContent=`${m.title} / ${names[s.side]} / ${fmt(s.end-s.start)} deaths in ${d.year}`;}};
  $('overview').onclick=()=>{overview();reveal();};$('conflict').onchange=()=>{if($('conflict').value)open($('conflict').value);else {overview();reveal();}};$('year').onchange=()=>{detail();reveal();};
  function resize(){const z=Number($('zoom').value);$('dots').style.width=z===1?'':Math.min($('stage').clientWidth,innerHeight*.8)*z+'px';}
  $('zoom').onchange=resize;window.addEventListener('resize',resize);
  new MutationObserver(()=>{if(mode==='detail')detail();else overview();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const initialParams=new URLSearchParams(location.search),initialConflict=initialParams.get('conflict'),initialYear=initialParams.get('year');
  if(models.has(initialConflict)){
    open(initialConflict);
    if(initialYear==='all'||Object.hasOwn(models.get(initialConflict).years,initialYear)){$('year').value=initialYear;detail();}
  }else overview();
})();
