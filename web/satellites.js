/* Frozen historical model. No Date.now() enters propagation or the timeline. */
(() => {
 const $=id=>document.getElementById(id),data=window.WAR_MAPS_ORBITS,S=window.satellite;
 if(!data||!S){$('orbit-status').textContent='The orbital model could not load. Reload when the orbital library is available.';return;}
 const colors=['#83c6c3','#d6ac78'],radius=6371,start=Date.parse(data.start),end=Date.parse(data.end),step=data.step_minutes*60000;
 const records=data.objects.map(o=>S.json2satrec(o.elements)),samples=[];
 function at(ms){const t=new Date(ms),g=S.gstime(t),eci=records.map(r=>S.propagate(r,t).position);if(eci.some(p=>!p||![p.x,p.y,p.z].every(Number.isFinite)))return null;return {ms,positions:eci.map(p=>S.eciToEcf(p,g)),distance:Math.hypot(eci[0].x-eci[1].x,eci[0].y-eci[1].y,eci[0].z-eci[1].z)};}
 for(let ms=start;ms<=end;ms+=step)samples.push(at(ms));
 let index=samples.length-1,yaw=0,pitch=.25,zoom=1,playing=false,timer=null,coasts=[];
 const globe=$('orbit-globe'),ctx=globe.getContext('2d'),chart=$('orbit-chart'),cc=chart.getContext('2d');
 const theme=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
 const utc=ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19)+' UTC';
 const km=n=>Math.round(n).toLocaleString()+' km';
 function xyz(p){return [p.x,p.z,-p.y];}
 function rotate(p){const [x,y,z]=p,a=x*Math.cos(yaw)+z*Math.sin(yaw),b=-x*Math.sin(yaw)+z*Math.cos(yaw);return [a,y*Math.cos(pitch)-b*Math.sin(pitch),y*Math.sin(pitch)+b*Math.cos(pitch)];}
 function screen(p,w,h){const q=rotate(p),scale=Math.min(w,h)*.37*zoom/radius;return [w/2+q[0]*scale,h/2-q[1]*scale,q[2],q[0]*scale,q[1]*scale];}
 function ll(lon,lat){const a=lon*Math.PI/180,b=lat*Math.PI/180;return [radius*Math.cos(b)*Math.cos(a),radius*Math.sin(b),-radius*Math.cos(b)*Math.sin(a)];}
 function size(canvas){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);canvas.getContext('2d').setTransform(d,0,0,d,0,0);return [r.width,r.height];}
 function center(){const s=samples[index];if(!s)return;const a=xyz(s.positions[0]),b=xyz(s.positions[1]),p=a.map((x,i)=>(x+b[i])/2);yaw=Math.atan2(-p[0],p[2]);pitch=Math.atan2(p[1],Math.hypot(p[0],p[2]));}
 function fit(){center();zoom=1;draw();}
 function draw(){const [w,h]=size(globe),R=Math.min(w,h)*.37*zoom,s=samples[index];ctx.fillStyle=theme('--paper');ctx.fillRect(0,0,w,h);ctx.fillStyle=theme('--surface')||theme('--paper');ctx.beginPath();ctx.arc(w/2,h/2,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle=theme('--line');ctx.lineWidth=1;ctx.stroke();
  function line(points,color,alpha=1){ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.beginPath();let pen=false;for(const p of points){const q=screen(p,w,h),visible=q[2]>=0||Math.hypot(q[3],q[4])>R;if(!visible){pen=false;continue;}if(pen)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);pen=true;}ctx.stroke();ctx.globalAlpha=1;}
  for(let lat=-60;lat<=60;lat+=30)line(Array.from({length:181},(_,i)=>ll(i*2-180,lat)),theme('--line'));
  for(let lon=-180;lon<180;lon+=30)line(Array.from({length:91},(_,i)=>ll(lon,i*2-90)),theme('--line'));
  for(const ring of coasts)line(ring.map(p=>ll(...p)),theme('--muted'),.65);
  if(!s)return;
  for(let j=0;j<2;j++){const trail=[];for(let t=Math.max(start,s.ms-90*60000);t<=s.ms;t+=60000){const p=at(t);if(p)trail.push(xyz(p.positions[j]));}ctx.lineWidth=1.5;line(trail,colors[j],.65);}
  const a=xyz(s.positions[0]),b=xyz(s.positions[1]);ctx.lineWidth=2;ctx.setLineDash([5,5]);line(Array.from({length:101},(_,i)=>a.map((v,j)=>v+(b[j]-v)*i/100)),theme('--ink'));ctx.setLineDash([]);
  for(let j=0;j<2;j++){const q=screen(xyz(s.positions[j]),w,h);if(q[2]<0&&Math.hypot(q[3],q[4])<R)continue;ctx.fillStyle=colors[j];ctx.beginPath();ctx.arc(q[0],q[1],5,0,Math.PI*2);ctx.fill();ctx.font='12px sans-serif';ctx.fillText(j?'Kosmos 2612':'ICEYE-X36',Math.max(5,Math.min(w-100,q[0]+10)),q[1]+(j?18:-12));}
 }
 function plot(){const [w,h]=size(chart),valid=samples.filter(Boolean),max=Math.max(...valid.map(s=>s.distance),1);cc.fillStyle=theme('--paper');cc.fillRect(0,0,w,h);cc.strokeStyle=theme('--muted');cc.lineWidth=1;cc.beginPath();let pen=false;samples.forEach((s,i)=>{if(!s){pen=false;return;}const x=40+i/(samples.length-1)*(w-50),y=h-22-s.distance/max*(h-42);if(pen)cc.lineTo(x,y);else cc.moveTo(x,y);pen=true;});cc.stroke();cc.fillStyle=theme('--muted');cc.font='11px sans-serif';cc.fillText(km(max),0,14);cc.fillText('0 km',0,h-10);const x=40+index/(samples.length-1)*(w-50);cc.strokeStyle=colors[1];cc.beginPath();cc.moveTo(x,14);cc.lineTo(x,h-20);cc.stroke();}
 function update(){if($('orbit-follow').checked)center();const s=samples[index];$('orbit-slider').value=index;$('orbit-time').textContent=utc(start+index*step);$('orbit-distance').textContent=s?km(s.distance):'Model unavailable';$('orbit-altitudes').replaceChildren();if(s)data.objects.forEach((o,i)=>{const dt=document.createElement('dt'),dd=document.createElement('dd'),geo=S.eciToGeodetic(S.propagate(records[i],new Date(s.ms)).position,S.gstime(new Date(s.ms)));dt.textContent=o.elements.OBJECT_NAME+' altitude';dd.textContent=km(geo.height);$('orbit-altitudes').append(dt,dd);});draw();plot();globe.setAttribute('aria-label',`3D Earth. ${$('orbit-distance').textContent} estimated satellite separation at ${$('orbit-time').textContent}. Drag or use arrow keys to rotate.`);}
 function stop(){playing=false;clearInterval(timer);$('orbit-play').textContent='Play history';}
 $('orbit-slider').max=samples.length-1;$('orbit-slider').disabled=false;$('orbit-slider').oninput=()=>{stop();index=Number($('orbit-slider').value);update();};
 $('orbit-play').disabled=false;$('orbit-play').onclick=()=>{if(playing){stop();return;}if(index===samples.length-1)index=0;playing=true;$('orbit-play').textContent='Pause history';timer=setInterval(()=>{index=Math.min(index+1,samples.length-1);update();if(index===samples.length-1)stop();},100);};
 $('orbit-latest').disabled=false;$('orbit-latest').onclick=()=>{stop();index=samples.length-1;update();fit();};$('orbit-follow').onchange=()=>{if($('orbit-follow').checked){center();draw();}};$('orbit-fit').onclick=fit;$('orbit-reset').onclick=()=>{yaw=0;pitch=.25;zoom=1;draw();};
 let drag=null;globe.onpointerdown=e=>{drag=[e.clientX,e.clientY];globe.setPointerCapture(e.pointerId);};globe.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw();};globe.onpointerup=globe.onpointercancel=()=>drag=null;
 globe.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});globe.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')pitch=Math.min(Math.PI/2,pitch+.1);if(e.key==='ArrowDown')pitch=Math.max(-Math.PI/2,pitch-.1);if(e.key==='+')zoom=Math.min(3,zoom*1.1);if(e.key==='-')zoom=Math.max(.6,zoom/1.1);draw();};
 $('orbit-range').textContent=utc(start)+' — '+utc(end)+' / 5-minute modeled samples';$('orbit-method').textContent=data.method;
 $('orbit-epochs').textContent='Element epochs: '+data.objects.map(o=>o.elements.OBJECT_NAME+' '+o.elements.EPOCH+' UTC').join(' · ');
 const valid=samples.filter(Boolean),min=valid.reduce((a,b)=>a.distance<b.distance?a:b,null||valid[0]);
 $('orbit-summary').textContent=valid.length?`Sampled model minimum: ${km(min.distance)} at ${utc(min.ms)}. ${valid.length.toLocaleString()} valid samples; ${samples.length-valid.length} gaps.`:'No valid orbital estimates.';
 fetch('assets/world.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).then(g=>{coasts=g.features.flatMap(f=>f.geometry?.type==='Polygon'?f.geometry.coordinates:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates.flat():[]);draw();}).catch(()=>{$('orbit-status').textContent='Coastlines unavailable; orbital geometry remains visible.';});
 new ResizeObserver(()=>{draw();plot();}).observe(globe);new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});update();fit();
 window.WAR_MAPS_ORBIT_VIEW={samples,start,end,get index(){return index;},get camera(){return {yaw,pitch,zoom};}};
})();
