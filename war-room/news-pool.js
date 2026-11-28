// One native decoder per station; thumbnails and wall screens share its decoded frames.
'use strict';
(()=>{
 const config=window.NewsBoobMultiscreenConfig||{},selector=config.playerSelector||'.news-player',playerURL=config.playerURL||'views/newsboob.html';
 const feeds=new Map(),screens=Array.from(document.querySelectorAll(selector),()=>null),audio=screens.map(()=>({muted:true,volume:80}));
 let catalog=[],open=false,releaseTimer=null,serial=0,lastPaint=0;
 const frames=()=>[...document.querySelectorAll(selector)];
 function refreshCatalog(){if(!catalog.length){for(const frame of frames()){const rows=(frame.contentWindow?.NewsBoobPlayer||frame.contentWindow?.warRoomNews)?.channels();if(rows?.length){catalog=rows;break;}}}return catalog;}
 function ownerAPI(feed){return feed?.frame?.contentWindow?.NewsBoobPlayer||feed?.frame?.contentWindow?.warRoomNews;}
 function ensure(index){
  const station=refreshCatalog().find(c=>c.index===index);if(!station)return null;
  let feed=feeds.get(station.id);if(feed)return feed;
  feed={id:station.id,index,frame:null,timer:null,ready:null,resolve:null};feed.ready=new Promise(resolve=>feed.resolve=resolve);feeds.set(station.id,feed);
  // Small spacing avoids a burst when the full live grid opens.
  const delay=Math.max(0,serial-performance.now());serial=Math.max(serial,performance.now())+250;
  feed.timer=setTimeout(()=>{
   feed.timer=null;if(feeds.get(station.id)!==feed)return;
   const frame=document.createElement('iframe');frame.className='news-feed-owner';frame.title=station.label+' shared live source';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.allow='autoplay';const url=new URL(playerURL,document.baseURI);url.searchParams.set('slot','0');url.searchParams.set('owner',station.id);frame.src=url.href;feed.frame=frame;
   frame.addEventListener('load',()=>{feed.resolve(ownerAPI(feed));syncAudio();},{once:true});document.body.append(frame);
  },delay);return feed;
 }
 function release(feed){clearTimeout(feed.timer);ownerAPI(feed)?.shutdown();feed.frame?.remove();feed.resolve(null);feeds.delete(feed.id);}
 function collect(){for(const feed of feeds.values())if(!screens.includes(feed.index))release(feed);}
 function syncAudio(){
  for(const feed of feeds.values()){
   const slots=screens.map((index,slot)=>index===feed.index?slot:null).filter(slot=>slot!==null),audible=slots.filter(slot=>!audio[slot].muted),muted=!audible.length,volume=audible.length?Math.max(...audible.map(slot=>audio[slot].volume)):0;
   const control=ownerAPI(feed);if(control&&(feed.muted!==muted||feed.volume!==volume)){feed.muted=muted;feed.volume=volume;control.volume(volume);control.setMuted(muted);}
   if(feed.frame){const slot=slots[0],wall=slot===undefined?null:frames()[slot],rect=wall?.getBoundingClientRect();feed.frame.style.width=(rect?.width||240)+'px';feed.frame.style.height=(rect?.height||135)+'px';}
  }
 }
 function tune(slot,index){screens[slot]=index;const feed=ensure(index);syncAudio();if(!open){clearTimeout(releaseTimer);releaseTimer=setTimeout(collect,30000);}return feed?.ready||Promise.resolve(null);}
 function power(slot,on,index){if(on){if(screens[slot]!==index)tune(slot,index);}else{screens[slot]=null;syncAudio();}if(!open){clearTimeout(releaseTimer);releaseTimer=setTimeout(collect,30000);}}
 function setOpen(value){open=value;clearTimeout(releaseTimer);if(open)refreshCatalog().forEach(c=>ensure(c.index));else releaseTimer=setTimeout(collect,30000);}
 function videoForChannel(index){const station=refreshCatalog().find(c=>c.index===index);return station?feeds.get(station.id)?.frame?.contentDocument?.querySelector('#hlsVideo'):null;}
 function paint(t){
  requestAnimationFrame(paint);if(t-lastPaint<1000/25)return;lastPaint=t;
  frames().forEach((frame,slot)=>{
   const doc=frame.contentDocument;if(!doc)return;let canvas=doc.querySelector('#shared-source-canvas');if(!canvas){const host=doc.querySelector('.screen-frame');if(!host)return;canvas=doc.createElement('canvas');canvas.id='shared-source-canvas';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none';host.prepend(canvas);}
   const rect=frame.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width*devicePixelRatio)),h=Math.max(1,Math.round(rect.height*devicePixelRatio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   const ctx=canvas.getContext('2d'),index=screens[slot],v=index===null?null:videoForChannel(index);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
   if(v?.readyState>=2&&v.videoWidth&&v.style.display!=='none'){const scale=Math.min(w/v.videoWidth,h/v.videoHeight);try{ctx.drawImage(v,(w-v.videoWidth*scale)/2,(h-v.videoHeight*scale)/2,v.videoWidth*scale,v.videoHeight*scale);return;}catch{}}
   const station=refreshCatalog().find(c=>c.index===index),feed=station&&feeds.get(station.id),off=feed?.frame?.contentDocument?.querySelector('#offair'),message=index===null?'Off':off&&!off.classList.contains('hidden')?'Source unavailable':'Connecting to shared live source…';ctx.fillStyle='#e9e5db';ctx.font=Math.max(12,w/36)+'px system-ui';ctx.textAlign='center';ctx.fillText(message,w/2,h/2);
  });
 }
 window.NewsBoobMultiscreen=window.warRoomPool=Object.freeze({reloadSlot:slot=>{const station=refreshCatalog().find(c=>c.index===screens[slot]);return station&&ownerAPI(feeds.get(station.id))?.reload();},tune,power,setOpen,audio:(slot,muted,volume)=>{audio[slot]={muted,volume};syncAudio();},videoForChannel,videoForSlot:slot=>screens[slot]===null?null:videoForChannel(screens[slot]),snapshot:()=>({open,screens:[...screens],feeds:[...feeds.values()].map(f=>({id:f.id,index:f.index,loaded:!!f.frame}))})});
 requestAnimationFrame(paint);addEventListener('resize',syncAudio);addEventListener('pagehide',()=>{clearTimeout(releaseTimer);[...feeds.values()].forEach(release);});
})();
