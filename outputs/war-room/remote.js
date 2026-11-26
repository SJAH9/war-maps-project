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
// Palettes dock as title bars on the table front; open positions belong to the user.
const mapRemote=document.querySelector('#map-remote'),warsRemote=document.querySelector('#wars-remote');
const warsGrip=document.querySelector('#wars-grip'),warsButtons=document.querySelector('#wars-buttons');
const paletteDock=document.querySelector('#palette-dock');
// Keep table-front tools inside the map palette alongside its native controls.
const tableTools=document.querySelector('.masthead .tools');if(tableTools)mapRemote.insertBefore(tableTools,document.querySelector('#map-controls'));
const panels=[mapRemote,warsRemote,remote],palettePositions=new WeakMap();let paletteZ=10,warsSignature='';
function placePalette(panel,x,y){
 const viewport=roomViewport();
 x=Math.max(0,Math.min(viewport.width-panel.offsetWidth,x));
 y=Math.max(0,Math.min(viewport.height-Math.min(panel.offsetHeight,36),y));
 panel.style.left=x+'px';panel.style.top=y+'px';palettePositions.set(panel,{x,y});
}
function dockPalette(panel){
 panel.dataset.position='docked';panel.classList.remove('dragging');
 paletteDock.append(panel);
 panels.filter(p=>p.parentElement===paletteDock).forEach(p=>paletteDock.append(p));
 const grip=panel.firstElementChild;grip.setAttribute('aria-expanded','false');grip.setAttribute('aria-label','Open '+grip.textContent.trim());
 panel.title='Tap the title to open this palette';
}
function openPalette(panel){
 if(panel.dataset.position==='floating'){panel.style.zIndex=++paletteZ;return;}
 const tab=roomRect(panel);panel.dataset.position='floating';document.body.append(panel);panel.style.zIndex=++paletteZ;
 const position=palettePositions.get(panel)||{x:tab.left,y:tab.top-panel.offsetHeight-12};placePalette(panel,position.x,position.y);
 const grip=panel.firstElementChild;grip.setAttribute('aria-expanded','true');grip.setAttribute('aria-label','Dock '+grip.textContent.trim()+' on the table front');
 panel.title='Drag the palette; tap its title to dock';
}
function enablePalette(panel){
 const grip=panel.firstElementChild;let drag=null,suppressUntil=0;
 grip.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();return;}panel.dataset.position==='docked'?openPalette(panel):dockPalette(panel);});
 panel.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.isPrimary||panel.dataset.position!=='floating')return;
  panel.style.zIndex=++paletteZ;
  if(event.target!==grip&&event.target.closest('button,input,select,textarea,label,a,.control-console'))return;
  const r=roomRect(panel);drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:r.left,y:r.top,moved:false,capture:event.target};drag.capture.setPointerCapture(event.pointerId);
 });
 panel.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const dx=(event.clientX-drag.startX)/roomScale(),dy=(event.clientY-drag.startY)/roomScale();if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;panel.classList.add('dragging');event.preventDefault();placePalette(panel,drag.x+dx,drag.y+dy);
 });
 const finish=event=>{if(!drag||event.pointerId!==drag.id)return;if(drag.moved)suppressUntil=performance.now()+400;if(drag.capture.hasPointerCapture(event.pointerId))drag.capture.releasePointerCapture(event.pointerId);drag=null;panel.classList.remove('dragging');};
 panel.addEventListener('pointerup',finish);panel.addEventListener('pointercancel',finish);
 dockPalette(panel);
}
panels.forEach(enablePalette);
addEventListener('resize',()=>panels.forEach(panel=>{if(panel.dataset.position==='floating'){const pos=palettePositions.get(panel);placePalette(panel,pos.x,pos.y);}}));
function syncWars(){
 const win=frame.contentWindow,api=win?.warRoomConflicts;
 warsRemote.hidden=false;warsGrip.disabled=false;if(!api){if(warsSignature!=='unavailable'){warsSignature='unavailable';const note=document.createElement('p');note.textContent='Choose World map to list conflicts.';warsButtons.replaceChildren(note);}return;}
 const rows=api.top(),signature=JSON.stringify(rows);warsGrip.disabled=false;if(signature===warsSignature)return;warsSignature=signature;
 warsButtons.replaceChildren(...rows.map((row,index)=>{
  const button=document.createElement('button');button.type='button';button.dataset.conflict=row.id;button.textContent=row.country;
  button.title=`${row.title} · ${index+1}. ${row.events.toLocaleString('en-US')} recorded events · ${row.start}–${row.end} · observed through ${row.through}. Loaded UCDP event observations; incomplete coverage.`;
  button.addEventListener('click',()=>{const selected=api.open(row.id);if(!selected)return;hideTableVideo();
   warsButtons.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   const search=win.document.querySelector('#room-place-search');if(search&&selected.country){search.value=selected.country;search.dispatchEvent(new win.Event('input',{bubbles:true}));search.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}
  });return button;
 }));
}
frame.addEventListener('load',()=>{warsSignature='';syncWars();});setInterval(syncWars,500);syncWars();
