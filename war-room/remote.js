// Same-origin remote for the three native NewsBoob wall players.
'use strict';
const remote=document.querySelector('#news-remote'),newsFrames=[...document.querySelectorAll('.news-player')];
const api=slot=>{try{return newsFrames[slot].contentWindow.warRoomNews;}catch{return null;}};
const all=action=>newsFrames.forEach((_,i)=>{const control=api(i);if(control)action(control);});
const interval=document.querySelector('#remote-interval'),scanButton=document.querySelector('#remote-scan');
let scanning=false,videoSlot=null,savedLabels=null,pinnedSlot=null,hoverSlot=null;
const tableVideo=document.querySelector('#table-video'),canvas=document.querySelector('#table-feed'),context=canvas.getContext('2d');
function renderTableVideo(slot){
 if(slot===null){videoSlot=null;tableVideo.hidden=true;document.querySelector('.display').classList.remove('show-video');if(savedLabels)for(const [id,text] of Object.entries(savedLabels))document.getElementById(id).textContent=text;savedLabels=null;}
 else{if(videoSlot===null){savedLabels={};for(const id of ['surface-label','surface-status'])savedLabels[id]=document.getElementById(id).textContent;}videoSlot=slot;tableVideo.hidden=false;document.querySelector('.display').classList.add('show-video');}
 remote.querySelectorAll('[data-table]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.table)===slot)));
}
function hideTableVideo(){pinnedSlot=null;hoverSlot=null;renderTableVideo(null);}
function showTableVideo(slot){pinnedSlot=pinnedSlot===slot?null:slot;renderTableVideo(hoverSlot??pinnedSlot);}
// A first deliberate dwell enables audio focus; later screen changes are immediate.
let audioFocus=null,audioHoverTimer=null;
function focusNewsAudio(slot){
 const target=api(slot);if(!target?.state().on)return;
 newsFrames.forEach((_,i)=>{if(i!==slot)api(i)?.setMuted(true);});
 target.setMuted(false);audioFocus=slot;syncRemote();
}
newsFrames.forEach((screen,slot)=>{
 screen.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hoverSlot=slot;renderTableVideo(slot);
  clearTimeout(audioHoverTimer);
  if(audioFocus!==null)focusNewsAudio(slot);
  else audioHoverTimer=setTimeout(()=>{if(hoverSlot===slot)focusNewsAudio(slot);},2000);
 });
 screen.addEventListener('pointerleave',()=>{clearTimeout(audioHoverTimer);if(hoverSlot!==slot)return;hoverSlot=null;renderTableVideo(pinnedSlot);});
});
remote.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>all(c=>c.step(Number(b.dataset.step)))));
remote.querySelectorAll('[data-power]').forEach(b=>b.addEventListener('click',()=>api(Number(b.dataset.power))?.power()));
remote.querySelectorAll('[data-mute]').forEach(b=>b.addEventListener('click',()=>api(Number(b.dataset.mute))?.mute()));
remote.querySelectorAll('[data-volume]').forEach(s=>s.addEventListener('input',()=>api(Number(s.dataset.volume))?.volume(s.value)));
remote.querySelectorAll('[data-table]').forEach(b=>b.addEventListener('click',()=>showTableVideo(Number(b.dataset.table))));
document.querySelector('#table-video-close').addEventListener('click',hideTableVideo);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',hideTableVideo,true));
interval.addEventListener('input',()=>{document.querySelector('#remote-seconds').textContent=interval.value+' s';if(Number(interval.value)===0)scanning=false;all(c=>c.scan(scanning,interval.value));});
scanButton.addEventListener('click',()=>{scanning=!scanning;if(!Number(interval.value)){interval.value='45';document.querySelector('#remote-seconds').textContent='45 s';}all(c=>c.scan(scanning,interval.value));});
function syncRemote(){
 const states=newsFrames.map((_,i)=>api(i)?.state());
 remote.querySelectorAll('[data-step],#remote-scan,#remote-interval').forEach(e=>e.disabled=states.some(s=>!s));
 states.forEach((s,i)=>{remote.querySelectorAll(`[data-power="${i}"],[data-mute="${i}"],[data-volume="${i}"],[data-table="${i}"]`).forEach(e=>e.disabled=!s);if(!s)return;
  remote.querySelector(`[data-nation="${i}"]`).textContent=s.nation;
  const power=remote.querySelector(`[data-power="${i}"]`);power.textContent=s.on?'On':'Off';power.setAttribute('aria-pressed',String(s.on));
  remote.querySelector(`[data-mute="${i}"]`).setAttribute('aria-pressed',String(s.muted));
  const volume=remote.querySelector(`[data-volume="${i}"]`);if(document.activeElement!==volume)volume.value=String(s.volume);
 });
 scanning=states.some(s=>s?.scan);scanButton.setAttribute('aria-pressed',String(scanning));
}
setInterval(syncRemote,250);syncRemote();
// Mirror decoded video only; sound remains controlled by its original player.
let lastPaint=0;
function paintTable(t){requestAnimationFrame(paintTable);if(videoSlot===null||t-lastPaint<1000/30)return;lastPaint=t;
 const w=Math.max(1,tableVideo.clientWidth),h=Math.max(1,tableVideo.clientHeight);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 context.fillStyle='#050910';context.fillRect(0,0,w,h);
 const win=newsFrames[videoSlot].contentWindow,state=api(videoSlot)?.state(),v=win.document.querySelector('#hlsVideo'),nation=state?.nation||'Connecting';
 document.querySelector('#surface-label').textContent=nation;document.querySelector('#surface-status').textContent=nation;
 if(state?.on&&v?.readyState>=2&&v.videoWidth&&v.style.display!=='none'){
  const scale=Math.min(w/v.videoWidth,h/v.videoHeight),vw=v.videoWidth*scale,vh=v.videoHeight*scale;
  try{context.drawImage(v,(w-vw)/2,(h-vh)/2,vw,vh);canvas.dataset.feedState='playing';return;}catch{}
 }
 canvas.dataset.feedState=state?.on?'unavailable':'off';context.fillStyle='#e9e5db';context.font='16px system-ui';context.textAlign='center';context.fillText(nation,w/2,h/2-12);context.fillText(state?.on?'Waiting for the source feed':'Off',w/2,h/2+16);
}
requestAnimationFrame(paintTable);
// Click presets and free dragging share the native table-plane placement.
const palettePositions=new WeakMap();
const grip=document.querySelector('#remote-grip');let remoteForeground=false;
const remoteTable=document.querySelector('#table');
function alignRemotePlane(panel=remote){
 const css=getComputedStyle(panel);
 panel.style.transformOrigin=(remoteTable.offsetLeft+remoteTable.offsetWidth/2-parseFloat(css.left))+'px '+(remoteTable.offsetTop+remoteTable.offsetHeight-parseFloat(css.top))+'px';
}
function place(x,y,panel=remote){
 const ox=remoteTable.offsetLeft+remoteTable.offsetWidth/2,oy=remoteTable.offsetTop+remoteTable.offsetHeight;
 const edge=roomRect(document.querySelector('.news-wall')).bottom+4;
 const flat=document.body.classList.contains('flat'),sin=Math.sin(43*Math.PI/180),cos=Math.cos(43*Math.PI/180);
 const lens=1500;
 // Size follows screen height; the farthest position retains the original size.
 const sizeAt=y=>1+1.1*Math.max(0,Math.min(1,(y-edge)/Math.max(1,roomViewport().height-edge-panel.offsetHeight)));
 const planeAt=(y,size)=>flat?(y-oy)/size:(y-oy)/(size*(cos+sin*(y-oy)/lens));
 const bottomAt=y=>{const size=sizeAt(y),q=planeAt(y,size)+panel.offsetHeight;return flat?oy+size*q:oy+cos*size*q/(1-sin*size*q/lens);};
 let sy=Math.max(edge,y);
 if(bottomAt(sy)>roomViewport().height-18){let lo=edge,hi=sy;for(let n=0;n<24;n++){const mid=(lo+hi)/2;if(bottomAt(mid)>roomViewport().height-18)hi=mid;else lo=mid;}sy=lo;}
 const enlargement=sizeAt(sy),q=planeAt(sy,enlargement);
 panel.style.setProperty('--remote-size',enlargement);panel.style.right='auto';
 for(let n=0;n<6;n++){
  const r=roomRect(panel),sx=Math.max(0,Math.min(roomViewport().width-r.width,x));
  const scale=flat?1/enlargement:(1-sin*enlargement*(q+(sx<ox?panel.offsetHeight:0))/lens)/enlargement;
  panel.style.left=(ox+(sx-ox)*scale)+'px';panel.style.top=(oy+q)+'px';alignRemotePlane(panel);
 }
}
function refitRemote(){
 const dragged=palettePositions.get(remote);if(dragged){place(dragged.x,dragged.y,remote);remote.dataset.position="dragged";return;}
 const edge=roomRect(document.querySelector('.news-wall')).bottom;
 const y=remoteForeground?roomViewport().height*.75:edge+18;
 for(let n=0;n<5;n++){
  const r=roomRect(remote);
  place(remoteForeground?(roomViewport().width-r.width)/2:roomViewport().width-r.width-12,y);
 }
 remote.dataset.position=remoteForeground?'foreground':'side';
 grip.setAttribute('aria-label',remoteForeground?'Return remote to the side':'Bring remote to center foreground');
 grip.setAttribute('aria-expanded',String(remoteForeground));
 remote.title=remoteForeground?'Click the top bar to return to the side':'Click the casing to bring the remote forward';
}
function setRemoteForeground(value){if(value&&typeof setWarsForeground==='function')setWarsForeground(false);if(value&&typeof setMapForeground==='function')setMapForeground(false);palettePositions.delete(remote);remoteForeground=value;refitRemote();}
remote.addEventListener('click',e=>{
 if(e.target.closest('#remote-grip')){setRemoteForeground(palettePositions.has(remote)?false:!remoteForeground);return;}
 if(e.target.closest('button,input,select,label,a'))return;
 setRemoteForeground(true);
});
remote.addEventListener('keydown',e=>{if(e.target===remote&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setRemoteForeground(true);}});
new ResizeObserver(refitRemote).observe(remoteTable);
new MutationObserver(refitRemote).observe(remoteTable,{attributes:true,attributeFilter:['style']});
addEventListener('resize',refitRemote);
requestAnimationFrame(refitRemote);
document.querySelector('#perspective').addEventListener('click',()=>requestAnimationFrame(refitRemote));

// Map palette retains the native control mirror and uses the opposite side dock.
const mapRemote=document.querySelector('#map-remote'),mapGrip=document.querySelector('#map-grip');
let mapForeground=false;
function refitMapRemote(){
 const dragged=palettePositions.get(mapRemote);if(dragged){place(dragged.x,dragged.y,mapRemote);mapRemote.dataset.position="dragged";return;}
 mapRemote.classList.toggle('map-docked-layout',!mapForeground);mapRemote.style.width=(mapForeground?320:192)+'px';
 const edge=roomRect(document.querySelector('.news-wall')).bottom;
 const y=mapForeground?roomViewport().height*.75:edge+18;
 for(let n=0;n<5;n++){
  const r=roomRect(mapRemote);
  place(mapForeground?(roomViewport().width-r.width)/2:12,y,mapRemote);
 }
 mapRemote.dataset.position=mapForeground?'foreground':'side';
 mapGrip.setAttribute('aria-expanded',String(mapForeground));
 mapGrip.setAttribute('aria-label',mapForeground?'Return map controls to the left side':'Bring map controls to center foreground');
 mapRemote.title=mapForeground?'Click the top bar to return to the left side':'Click the casing to bring map controls forward';
}
function setMapForeground(value){if(value&&typeof setWarsForeground==='function')setWarsForeground(false);if(value&&remoteForeground){remoteForeground=false;refitRemote();}palettePositions.delete(mapRemote);mapForeground=value;refitMapRemote();}
mapRemote.addEventListener('click',e=>{
 if(e.target.closest('#map-grip')){setMapForeground(palettePositions.has(mapRemote)?false:!mapForeground);return;}
 if(e.target.closest('button,input,select,textarea,label,a'))return;
 setMapForeground(true);
});
mapRemote.addEventListener('keydown',e=>{if(e.target===mapRemote&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setMapForeground(true);}});
new ResizeObserver(refitMapRemote).observe(mapRemote);
new ResizeObserver(refitMapRemote).observe(remoteTable);
new MutationObserver(refitMapRemote).observe(remoteTable,{attributes:true,attributeFilter:['style']});
addEventListener('resize',refitMapRemote);
requestAnimationFrame(refitMapRemote);
document.querySelector('#perspective').addEventListener('click',()=>requestAnimationFrame(refitMapRemote));

// A short press keeps its click action; a drag consumes only its trailing click.
function enablePaletteDrag(panel,gripSelector){
 let drag=null,suppressUntil=0;
 panel.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 panel.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.isPrimary)return;
  if(!event.target.closest(gripSelector)&&event.target.closest('button,input,select,textarea,label,a,.control-console'))return;
  const r=roomRect(panel);drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:r.left,y:r.top,moved:false,capture:event.target};event.target.setPointerCapture(event.pointerId);
 });
 panel.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  if(!drag.moved){drag.moved=true;panel.classList.add('dragging');}
  event.preventDefault();
  const position={x:drag.x+dx/roomScale(),y:drag.y+dy/roomScale()};
  palettePositions.set(panel,position);place(position.x,position.y,panel);panel.dataset.position='dragged';
 });
 const finish=event=>{
  if(!drag||event.pointerId!==drag.id)return;
  if(drag.moved){suppressUntil=performance.now()+400;panel.dataset.paletteClickUntil=String(suppressUntil);}
  if(drag.capture.hasPointerCapture(event.pointerId))drag.capture.releasePointerCapture(event.pointerId);drag=null;panel.classList.remove('dragging');
 };
 panel.addEventListener('pointerup',finish);panel.addEventListener('pointercancel',finish);
}
enablePaletteDrag(remote,'#remote-grip');enablePaletteDrag(mapRemote,'#map-grip');

// Wars uses the same table-plane placement, foreground growth and drag contract.
const warsRemote=document.querySelector('#wars-remote'),warsGrip=document.querySelector('#wars-grip'),warsButtons=document.querySelector('#wars-buttons');
let warsForeground=true,warsSignature='',warsDockY=roomRect(mapRemote).bottom+14;
function refitWarsRemote(){
 if(warsRemote.hidden)return;
 const dragged=palettePositions.get(warsRemote);if(dragged){place(dragged.x,dragged.y,warsRemote);warsRemote.dataset.position='dragged';return;}
 warsRemote.style.width=(warsForeground?144:88)+'px';
 if(!mapForeground&&!palettePositions.has(mapRemote))warsDockY=roomRect(mapRemote).bottom+14;
 const y=warsForeground?roomViewport().height*.75:warsDockY;
 for(let n=0;n<5;n++){const r=roomRect(warsRemote);place(warsForeground?(roomViewport().width-r.width)/2:12,y,warsRemote);}
 warsRemote.dataset.position=warsForeground?'foreground':'side';warsGrip.setAttribute('aria-expanded',String(warsForeground));
 warsGrip.setAttribute('aria-label',warsForeground?'Return wars to the left side':'Bring wars to center foreground');
}
function setWarsForeground(value){
 if(value){if(remoteForeground){remoteForeground=false;refitRemote();}if(mapForeground){mapForeground=false;refitMapRemote();}}
 palettePositions.delete(warsRemote);warsForeground=value;refitWarsRemote();
}
const warsDismissedClicks=new WeakSet();
function dismissWars(){if(warsForeground||palettePositions.has(warsRemote))setWarsForeground(false);}
document.addEventListener('click',event=>{
 if(performance.now()<Number(warsRemote.dataset.paletteClickUntil||0)||event.target.closest('#wars-buttons button'))return;
 if(warsForeground||palettePositions.has(warsRemote)){warsDismissedClicks.add(event);dismissWars();}
},true);
// Clicks in same-origin map/news documents do not bubble into the room.
function watchWarsDismissal(embedded){try{embedded.contentDocument?.addEventListener('click',dismissWars,true);}catch{}}
document.querySelectorAll('iframe').forEach(embedded=>{embedded.addEventListener('load',()=>watchWarsDismissal(embedded));watchWarsDismissal(embedded);});
// Embedded players may contain cross-origin media that cannot forward clicks.
addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement?.tagName==='IFRAME')dismissWars();},0));
warsRemote.addEventListener('click',event=>{
 if(warsDismissedClicks.has(event)||event.target.closest('#wars-buttons button'))return;
 setWarsForeground(true);
});
warsRemote.addEventListener('keydown',event=>{if(event.target===warsRemote&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setWarsForeground(true);}});
function syncWars(){
 const win=frame.contentWindow,api=win?.warRoomConflicts;
 warsRemote.hidden=!api;if(!api)return;
 const rows=api.top(),signature=JSON.stringify(rows);warsRemote.hidden=!rows.length;if(signature===warsSignature)return;warsSignature=signature;
 warsButtons.replaceChildren(...rows.map((row,index)=>{
  const button=document.createElement('button');button.type='button';button.dataset.conflict=row.id;button.textContent=row.country;
  button.title=`${row.title} · ${index+1}. ${row.events.toLocaleString('en-US')} recorded events · ${row.start}–${row.end} · observed through ${row.through}. Loaded UCDP event observations; incomplete coverage.`;
  button.addEventListener('click',()=>{const selected=api.open(row.id);if(!selected)return;hideTableVideo();
   warsButtons.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   const search=win.document.querySelector('#room-place-search');if(search&&selected.country){search.value=selected.country;search.dispatchEvent(new win.Event('input',{bubbles:true}));search.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}
   setWarsForeground(false);
  });return button;
 }));refitWarsRemote();
}
new ResizeObserver(refitWarsRemote).observe(mapRemote);new ResizeObserver(refitWarsRemote).observe(remoteTable);
new MutationObserver(refitWarsRemote).observe(mapRemote,{attributes:true,attributeFilter:['style']});
addEventListener('resize',refitWarsRemote);document.querySelector('#perspective').addEventListener('click',()=>requestAnimationFrame(refitWarsRemote));
frame.addEventListener('load',()=>{warsSignature='';syncWars();});setInterval(syncWars,500);syncWars();
enablePaletteDrag(warsRemote,'#wars-grip');
