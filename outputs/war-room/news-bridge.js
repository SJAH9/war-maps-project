// Keep the original scan controls and measurement handler within each screen.
if(!wallOwner){document.querySelector('.model').append(document.querySelector('.auto-controls'));setPanel(true);}
// Local War Room controls call the native tuner and playback functions directly.
window.warRoomNews=Object.freeze({
 reload:()=>{if(Date.now()>=wallCooldownUntil)return reloadStream();},
 shutdown:()=>{on=false;token+=1;stopHls();stopYt();},
 channels:()=>STATIONS.map((s,i)=>({index:i,id:s.id,label:s.name||s.label,nation:face(s)})),
 tune:i=>{i=Number(i);if(!Number.isInteger(i)||i<0||i>=STATIONS.length)return;if(on&&index===i)return;return go(i);},
 state:()=>({on,index,id:STATIONS[index].id,nation:face(STATIONS[index]),muted,volume:Number(el.vol.value),scan:scanMode,seconds:scanCustomSeconds}),
 step:direction=>{const next=(index+(direction<0?-1:1)+STATIONS.length)%STATIONS.length;if(on)return go(next);index=next;setPointer(index);setStatus('off','Off');},
 mute:()=>{muted=!muted;applyVolume();},
 setMuted:value=>{muted=Boolean(value);applyVolume();},
 volume:value=>{el.vol.value=String(Math.max(0,Math.min(100,Number(value)||0)));applyVolume();},
 power:()=>{
  if(!on){go(index);return;}
  on=false;token+=1;locked=-1;setScanMode(false);stopHls();stopYt();
  if(!wallOwner)parent.warRoomPool.power(wallSlot,false,index);
  [...previewPlayers.keys()].forEach(killPreview);hideOffAir();el.veil.classList.remove('hidden');setStatus('off','Off');
 },
 scan:(enabled,seconds)=>{scanCustomSeconds=Math.max(1,Math.min(90,Number(seconds)||45));scanType='custom';el.scanCustom.value=String(scanCustomSeconds);setScanMode(enabled&&on);}
});

// Public integration contract; War Room name remains a compatibility alias.
window.NewsBoobPlayer=window.warRoomNews;
