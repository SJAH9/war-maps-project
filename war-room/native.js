'use strict';
// Use the native region controls, so camera and terrain stay owned by Hormuz's renderer.
addEventListener('DOMContentLoaded',()=>{
 document.documentElement.dataset.theme='dark';
 if(document.body.dataset.roomView==='map'){
  const stage=document.querySelector('.map-stage'),summary=document.querySelector('.human-cost-map-summary');
  const bottom=document.createElement('section');bottom.className='room-map-bottom';bottom.setAttribute('aria-label','World map place search and violence summary');
  const place=document.createElement('div');place.className='room-map-place';bottom.append(place);if(summary)bottom.append(summary);stage.append(bottom);
  // Keep native queried elements for its unchanged state/render handlers.
  document.querySelector('.satellite-toolbar')?.setAttribute('hidden','');
 }
 const bars=[...document.querySelectorAll('.satellite-toolbar,.orbit-controls')];
 if(bars.length){
  const dock=document.createElement('section');dock.className='room-satellite-dock';dock.setAttribute('aria-label','Satellite controls outside the map');
  const workspace=document.querySelector('.map-workspace,.orbit-layout');workspace.before(dock);bars.forEach(bar=>dock.append(bar));
  const resize=()=>{document.documentElement.style.setProperty('--room-satellite-height',dock.offsetHeight+'px');const map=document.querySelector('#map');if(map?._fullLayout)Plotly.Plots.resize(map);};new ResizeObserver(resize).observe(dock);resize();
 }
 const taxNote=document.querySelector('.gas-tax-legend p');if(taxNote)taxNote.textContent='Markers show total pump prices. Known tax splits appear in the inspector; an unavailable tax amount is not zero.';
 const livingNote=document.querySelector('.mortality-legend span:last-child');if(livingNote)livingNote.textContent='Independent marker areas · select to inspect · scroll to zoom';
 document.querySelectorAll('.gas-stage-foot').forEach(e=>e.textContent='Select a marker to inspect its source record · scroll to zoom');
 document.querySelectorAll('.gas-scale,.mortality-scale').forEach(e=>e.hidden=true);

 if(document.body.dataset.roomView==='bab'||document.body.dataset.roomView==='hormuz'){
  const freshness=document.querySelector('#freshness');if(freshness)document.querySelector('.hormuz-stage').append(freshness);
  const label=document.body.dataset.roomView==='bab'?'Focus Yemen / Bab el-Mandeb':'Focus Hormuz';
  const focus=()=>{const b=[...document.querySelectorAll('.hormuz-controls button')].find(b=>b.textContent===label);if(b){b.click();return true;}return false;};
  if(!focus()){const observer=new MutationObserver(()=>{if(focus())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),20000);}
 }
});

// Retain external evidence sources; War Maps page navigation stays disabled here.
function outsideWarRoom(href){try{const url=new URL(href,document.baseURI);return (url.origin===location.origin&&!url.pathname.includes('/war-room/'))||(/(^|\.)sidhubbard\.com$/.test(url.hostname)&&url.pathname.startsWith('/war-maps'))||(url.hostname==='sjah9.github.io'&&url.pathname.startsWith('/war-maps-project'));}catch{return false;}}
function guardLink(event){const link=event.target.closest('a[href]');if(!link)return;if(link.dataset.roomNation){event.preventDefault();event.stopImmediatePropagation();parent.postMessage({type:'war-room-nation',country:link.dataset.roomNation},location.origin);return;}if(outsideWarRoom(link.href)){event.preventDefault();event.stopImmediatePropagation();return;}if(!link.getAttribute('href').startsWith('#')){link.target='_blank';link.rel='noopener noreferrer';}}
document.addEventListener('click',guardLink,true);document.addEventListener('auxclick',guardLink,true);
function trimNavigation(){document.querySelectorAll('a[href]').forEach(link=>{const url=new URL(link.href,document.baseURI);if(url.origin===location.origin&&url.pathname.endsWith('/nation.html')&&url.searchParams.has('country')){link.dataset.roomNation=url.searchParams.get('country');link.href=new URL('nation.html'+url.search,location.href).href;link.removeAttribute('target');return;}if(outsideWarRoom(link.href)){link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.removeAttribute('target');}});}
addEventListener('DOMContentLoaded',()=>{trimNavigation();let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;trimNavigation();});}).observe(document.body,{childList:true,subtree:true});});

// Native plots must size to their actual table containers after tab/layout changes.
addEventListener('DOMContentLoaded',()=>{const watched=new WeakSet();let queued=false;const discover=()=>{queued=false;document.querySelectorAll('.js-plotly-plot').forEach(plot=>{if(watched.has(plot))return;watched.add(plot);let pending=false;const fit=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const w=plot.clientWidth,h=plot.clientHeight;if(!w||!h||!plot._fullLayout)return;if(Math.abs(plot._fullLayout.width-w)>1||Math.abs(plot._fullLayout.height-h)>1)Plotly.relayout(plot,{width:w,height:h,autosize:true});});};new ResizeObserver(fit).observe(plot);fit();});};new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(discover);}}).observe(document.body,{childList:true,subtree:true});discover();});

// Plotly 3.1.0 fits a world-sized clip rectangle before applying user zoom.
// Expand that viewport, not the geographic paths, to the full table domain.
function roomGeoViewport(plot){
 const full=plot._fullLayout;if(!full)return;
 // Tint each native water color once; retain its existing brightness differences.
 const water={},saved=plot._roomWaterColors||(plot._roomWaterColors={});
 Object.keys(full).filter(key=>/^geo\d*$/.test(key)).forEach(key=>{
  for(const name of ['oceancolor','lakecolor']){
   const current=full[key][name],id=key+'.'+name;if(saved[id]?.tinted===current)continue;
   const match=/^#([0-9a-f]{6})$/i.exec(current||'');if(!match)continue;
   const rgb=match[1].match(/../g).map(n=>parseInt(n,16));
   const tinted='#'+rgb.map((n,i)=>Math.min(255,Math.round(n*[.85,.97,1.25][i])).toString(16).padStart(2,'0')).join('');
   saved[id]={source:current,tinted};if(tinted!==current)water[id]=tinted;
  }
 });
 if(Object.keys(water).length&&!plot._roomWaterPending){plot._roomWaterPending=true;Plotly.relayout(plot,water).finally(()=>{plot._roomWaterPending=false;});}

 Object.keys(full).filter(key=>/^geo\d*$/.test(key)).forEach(key=>{
  const geo=full[key],sub=geo?._subplot;if(!sub?.projection||!sub.bounds)return;
  if(typeof sub.updateProjection!=='function'||typeof sub.updateDims!=='function'||typeof sub._render!=='function'||typeof sub.projection.clipExtent!=='function')throw Error('War Room: Plotly geographic viewport contract changed');
  const expand=(layout,g)=>{const size=layout._size,domain=g.domain;const extent=[[size.l+size.w*domain.x[0],size.t+size.h*(1-domain.y[1])],[size.l+size.w*domain.x[1],size.t+size.h*(1-domain.y[0])]];const previous=sub.projection.clipExtent();const changed=!previous||extent.some((point,i)=>point.some((n,j)=>Math.abs(n-previous[i][j])>.01));sub.bounds=extent;sub.projection.clipExtent(extent);return changed;};
  if(!sub._roomViewport){const nativeUpdate=sub.updateProjection;sub.updateProjection=function(data,layout){const result=nativeUpdate.call(this,data,layout);if(this.bounds)expand(layout,layout[this.id]);return result;};sub._roomViewport=true;}
  if(expand(full,geo)){sub.updateDims(full,geo);sub._render();}
  plot.dataset.roomGeoViewport='full-domain';
 });
}
addEventListener('DOMContentLoaded',()=>{const bound=new WeakSet();let pending=false;const bind=()=>{pending=false;document.querySelectorAll('.js-plotly-plot').forEach(plot=>{if(!bound.has(plot)&&typeof plot.on==='function'){bound.add(plot);plot.on('plotly_afterplot',()=>roomGeoViewport(plot));}roomGeoViewport(plot);});};new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(bind);}}).observe(document.body,{childList:true,subtree:true});bind();});

// Rotate native map geometry beneath Plotly's fixed geographic clip viewport.
addEventListener('DOMContentLoaded',()=>{
 if(!['map','human','living','fuel','nation'].includes(document.body.dataset.roomView))return;
 const dock=document.createElement('div');dock.className='orbit-controls';
 const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.id='room-map-orbit';
 label.title='Rotate around the current focus. Hover pauses at the current bearing; Shift-drag down rotates clockwise, up counterclockwise.';
 label.append(toggle,document.createTextNode(' Orbit'));const group=document.querySelector('.controls,.gas-controls,.mortality-controls,.tab-bar');if(group)group.append(label);else{dock.append(label);document.body.append(dock);}
 const plots=new Set(),poses=new Map();let enabled=false,phase=0,last=0,pointerOver=false,rotationDrag=null;
 const searchLabel=document.createElement('label'),search=document.createElement('input'),result=document.createElement('span');
 search.type='search';search.id='room-place-search';search.placeholder='Partial place name';search.autocomplete='off';search.setAttribute('aria-describedby','room-place-result');
 result.id='room-place-result';result.setAttribute('role','status');result.textContent='Countries and recorded atlas places';
 searchLabel.append(document.createTextNode('Fly to place '),search);(document.querySelector('.room-map-place')||group||dock).append(searchLabel,result);
 const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 let places=[],searchReady=false,searchFailed=false,queryTimer,searchRevision=0,focus=null;
 const placeIndex=fetch('../war-room/search-places.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(rows=>{places=rows.map(p=>({...p,key:normalize(p.name)}));searchReady=true;if(search.value)choosePlace();}).catch(()=>{searchFailed=true;result.textContent='Place index unavailable';});
 async function choosePlace(){
  const revision=++searchRevision,q=normalize(search.value);if(!q){result.textContent='Countries and recorded atlas places';return;}
  if(!searchReady){result.textContent=searchFailed?'Place index unavailable':'Loading atlas places…';return;}
  const rank=p=>p.key===q?0:p.key.startsWith(q)?1:p.key.split(/[^a-z0-9]+/).some(w=>w.startsWith(q))?2:p.key.includes(q)?3:4;
  const matches=places.filter(p=>rank(p)<4).sort((a,b)=>rank(a)-rank(b)||a.key.length-b.key.length||a.key.localeCompare(b.key)||a.country.localeCompare(b.country));
  if(!matches.length){result.textContent='No matching atlas place';return;}
  const target=matches[0];enabled=false;toggle.checked=false;clearPose();focus=target;phase=0;last=0;
  result.textContent=target.name+(target.country?' · '+target.country:'')+' · '+target.kind;
  await Promise.all([...plots].filter(p=>p.isConnected).map(plot=>{
   const patch={};Object.keys(plot._fullLayout||{}).filter(k=>/^geo\d*$/.test(k)).forEach(k=>{
    patch[k+'.center']={lon:target.lon,lat:target.lat};patch[k+'.projection.rotation']={lon:target.lon,lat:0,roll:0};patch[k+'.projection.scale']=target.kind==='country'?8:18;
   });return Object.keys(patch).length?Plotly.relayout(plot,patch):Promise.resolve();
  }));
  if(revision!==searchRevision)return;
  // A selection establishes a still inspection view; Orbit remains an explicit choice.
  plots.forEach(plot=>{plot.dataset.roomOrbitFocus=JSON.stringify(target);});
 }
 search.addEventListener('input',()=>{clearTimeout(queryTimer);++searchRevision;queryTimer=setTimeout(choosePlace,350);});
 // The main World-map Find field also navigates to its best geographic match.
 // Its original conflict-filter handler remains attached and runs normally.
 const mainSearch=document.body.dataset.roomView==='map'?document.querySelector('#search'):null;
 if(mainSearch){
  mainSearch.addEventListener('input',()=>{search.value=mainSearch.value;clearTimeout(queryTimer);++searchRevision;queryTimer=setTimeout(choosePlace,350);});
  mainSearch.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search.value=mainSearch.value;clearTimeout(queryTimer);choosePlace();}});
 }

 search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(queryTimer);choosePlace();}});

 function subplots(plot){const full=plot._fullLayout;return full?Object.keys(full).filter(key=>/^geo\d*$/.test(key)).map(key=>full[key]?._subplot).filter(Boolean):[];}
 function clearPose(){
  poses.forEach((base,sub)=>{if(typeof sub.projection?.angle==='function'){setBearing(sub,base);sub._render();}});poses.clear();phase=0;
  plots.forEach(plot=>{delete plot.dataset.roomOrbitAngle;});
 }
 function discover(){document.querySelectorAll('.js-plotly-plot').forEach(plot=>{
  if(plots.has(plot))return;plots.add(plot);
  plot.addEventListener('pointerenter',()=>{pointerOver=true;last=0;});
  plot.addEventListener('pointerleave',()=>{pointerOver=false;last=0;});
  if(!['map','nation'].includes(document.body.dataset.roomView))return;
  plot.addEventListener('pointerdown',event=>{
   if(!event.shiftKey||event.button!==0||!event.target.closest('.geo'))return;
   const subs=subplots(plot).filter(sub=>typeof sub.projection?.angle==='function'&&typeof sub._render==='function');
   if(!subs.length)return;
   event.preventDefault();event.stopImmediatePropagation();defaultPending=false;last=0;
   rotationDrag={plot,id:event.pointerId,y:event.clientY,subs};
   plot.setPointerCapture(event.pointerId);
  },true);
  // Plotly's geographic drag uses compatibility mouse events as well.
  plot.addEventListener('mousedown',event=>{
   if(event.shiftKey&&event.button===0&&event.target.closest('.geo')){
    event.preventDefault();event.stopImmediatePropagation();
   }
  },true);
  plot.addEventListener('click',event=>{
   if(performance.now()<(plot._roomRotationClickUntil||0)){event.preventDefault();event.stopImmediatePropagation();}
  },true);

 });}
 new MutationObserver(discover).observe(document.body,{childList:true,subtree:true});discover();
 // World Orbit is allowed only when the entire turn keeps land/water
 // geometry over the fixed viewport. Never change dates, tabs or zoom here.
 const world=document.body.dataset.roomView==='map';let defaultPending=world;
 search.addEventListener('input',()=>{defaultPending=false;});mainSearch?.addEventListener('input',()=>{defaultPending=false;});
 function coversViewport(sub){
  const pr=sub.projection,b=sub.bounds;if(!pr?.invert||!b)return false;
  for(let i=0;i<=8;i++)for(const point of [[b[0][0]-2,b[0][1]+(b[1][1]-b[0][1])*i/8],[b[1][0]+2,b[0][1]+(b[1][1]-b[0][1])*i/8],[b[0][0]+(b[1][0]-b[0][0])*i/8,b[0][1]-2],[b[0][0]+(b[1][0]-b[0][0])*i/8,b[1][1]+2]]){
   const ll=pr.invert(point),back=ll&&pr(ll);
   if(!ll||!ll.every(Number.isFinite)||Math.abs(ll[1])>=90||!back||Math.hypot(back[0]-point[0],back[1]-point[1])>.1)return false;
  }return true;
 }
 function setBearing(sub,angle){
  const pr=sub.projection;pr.angle(angle);
  if(focus){const point=pr([focus.lon,focus.lat]),t=pr.translate(),mid=sub.midPt;if(point&&mid)pr.translate([t[0]+mid[0]-point[0],t[1]+mid[1]-point[1]]);}
 }
 // Capture Shift gestures before Plotly can start a normal geographic pan.
 // Move the current centre back to the same pixel after changing the bearing.
 function finishRotation(event){
  if(!rotationDrag||event&&event.pointerId!==rotationDrag.id)return;
  const {plot,id}=rotationDrag;rotationDrag=null;last=0;
  plot._roomRotationClickUntil=performance.now()+400;
  if(plot.hasPointerCapture(id))plot.releasePointerCapture(id);
  pointerOver=plot.matches(':hover');
 }
 addEventListener('pointermove',event=>{
  if(!rotationDrag||event.pointerId!==rotationDrag.id)return;
  event.preventDefault();event.stopImmediatePropagation();
  const delta=(event.clientY-rotationDrag.y)*.5;rotationDrag.y=event.clientY;
  rotationDrag.subs.forEach(sub=>{
   const pr=sub.projection,angle=pr.angle(),translate=pr.translate(),mid=sub.midPt;
   const centre=pr.invert(mid);
   // D3 projection angles run counterclockwise, so down subtracts degrees.
   pr.angle(angle-delta);
   const point=centre&&pr(centre),t=pr.translate();
   if(point)pr.translate([t[0]+mid[0]-point[0],t[1]+mid[1]-point[1]]);
   if(world&&!coversViewport(sub)){pr.angle(angle);pr.translate(translate);return;}
   if(centre)focus={lon:centre[0],lat:centre[1]};
   sub._render();
  });
  // Orbit continues from the manually chosen angle, without a snap on exit.
  phase=0;poses.clear();rotationDrag.subs.forEach(sub=>poses.set(sub,sub.projection.angle()));
  rotationDrag.plot.dataset.roomOrbitAngle=String(rotationDrag.subs[0].projection.angle());
 },{capture:true,passive:false});
 addEventListener('pointerup',finishRotation,true);
 addEventListener('pointercancel',finishRotation,true);
 addEventListener('blur',()=>finishRotation());
 function fullTurnFits(sub){
  const pr=sub.projection,a=pr.angle(),t=pr.translate();let safe=true;
  try{for(let n=0;n<360;n+=2){setBearing(sub,a+n);if(!coversViewport(sub)){safe=false;break;}}}
  finally{pr.angle(a);pr.translate(t);}return safe;
 }
 function stopAtEdge(){enabled=false;toggle.checked=false;last=0;result.textContent='Zoom in or recenter to keep map edges outside the viewport';}
 function enableOrbit(){
  discover();const visible=[...plots].filter(p=>p.isConnected&&p.clientWidth&&p.clientHeight).flatMap(subplots);
  if(world&&(!visible.length||!visible.every(fullTurnFits))){stopAtEdge();return;}
  enabled=true;toggle.checked=true;last=0;
 }
 toggle.addEventListener('change',()=>{defaultPending=false;last=0;if(!toggle.checked){enabled=false;}else{phase=0;poses.clear();enableOrbit();}});
 function orbit(time){requestAnimationFrame(orbit);
  if(defaultPending){
   const ready=[...plots].filter(p=>p.isConnected&&p.clientHeight&&p.dataset.roomGeoViewport==='full-domain'&&!p._roomWaterPending);
   if(ready.length&&ready.every(p=>subplots(p).length)){
    defaultPending=false;focus={name:'Ukraine – Saudi Arabia',country:'',kind:'region',lon:40,lat:35};
    ready.forEach(p=>{p.dataset.roomOrbitFocus=JSON.stringify(focus);subplots(p).forEach(sub=>{setBearing(sub,0);sub._render();});});
    result.textContent='Ukraine – Saudi Arabia';
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)enableOrbit();
   }
  }
  if(!enabled||pointerOver||rotationDrag||document.hidden){last=0;return;}
  if(last&&time-last<1000/20)return;const delta=last?Math.min(150,time-last):0;last=time;phase=(phase+delta*360/36000)%360;
  plots.forEach(plot=>{
   if(!plot.isConnected){plots.delete(plot);return;}if(!plot.clientWidth||!plot.clientHeight)return;
   subplots(plot).forEach(sub=>{
    if(typeof sub.projection?.angle!=='function'||typeof sub._render!=='function')return;
    if(!poses.has(sub))poses.set(sub,sub.projection.angle());
    const pr=sub.projection,previous={angle:pr.angle(),translate:pr.translate()};
    setBearing(sub,poses.get(sub)+phase);
    if(world&&!coversViewport(sub)){pr.angle(previous.angle);pr.translate(previous.translate);stopAtEdge();return;}
    sub._render();
    plot.dataset.roomOrbitAngle=String(phase);
   });
  });
 }
 requestAnimationFrame(orbit);
});
