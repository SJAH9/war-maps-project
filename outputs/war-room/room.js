'use strict';
const views={map:{file:'map',label:'World map',note:'Conflict records, not territorial control or a complete census of harm.'},human:{file:'civilian-casualties',label:'Human cost',note:'UCDP civilian deaths and separate health context. Measures are not additive.'},living:{file:'life-death',label:'Living conditions',note:'Exact source-year population and health observations beside candidate-event counts; independent measures.'},fuel:{file:'gas-map',label:'Fuel prices',note:'Native dated fuel-price observations and currency conversions; USD per US gallon.'},hormuz:{file:'hormuz',label:'Hormuz',note:'Reported vessel positions and crossing counts retain native freshness and coverage labels.'},bab:{file:'bab',label:'Bab el-Mandeb',note:'Terrain reference only here. No live Bab el-Mandeb vessel feed is connected.'}};
const frame=document.querySelector('#display'),loading=document.querySelector('#loading');let current='map',evidence=false;
function select(key){if(!views[key])key='map';current=key;const v=views[key];document.querySelectorAll('[data-view]').forEach(b=>{b.toggleAttribute('aria-current',b.dataset.view===key);if(b.dataset.view===key)b.setAttribute('aria-current','page');});document.querySelector('#surface-label').textContent=`0${Object.keys(views).indexOf(key)+1} / ${v.label.toUpperCase()}`;document.querySelector('#surface-status').textContent=v.label.toUpperCase();document.querySelector('#boundary').textContent=v.note;frame.title=`${v.label} — native War Maps display`;loading.textContent=`Opening ${v.label.toLowerCase()}…`;loading.hidden=false;frame.src=`views/${v.file}.html`;history.replaceState(null,'',`#${key}`);}
frame.addEventListener('load',()=>{loading.hidden=true;frame.contentDocument?.body.classList.toggle('evidence',evidence);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.view)));
document.querySelector('#controls').addEventListener('click',e=>{evidence=!evidence;e.currentTarget.setAttribute('aria-pressed',String(evidence));frame.contentDocument?.body.classList.toggle('evidence',evidence);frame.contentWindow?.dispatchEvent(new Event('resize'));});
document.querySelector('#perspective').addEventListener('click',e=>{const flat=document.body.classList.toggle('flat');e.currentTarget.setAttribute('aria-pressed',String(!flat));e.currentTarget.textContent=flat?'Flat reading view':'Table perspective';});
if(views[location.hash.slice(1)])select(location.hash.slice(1));

addEventListener('hashchange',()=>{if(location.hash.startsWith('#nation?'))openRoomNation(new URLSearchParams(location.hash.slice(8)).get('country'));else select(location.hash.slice(1));});

// Share the root CSS scale with table fitting and palette dragging.
function roomScale(){return parseFloat(getComputedStyle(document.documentElement).zoom)||1;}
function roomViewport(){const z=roomScale();return {width:innerWidth/z,height:innerHeight/z};}
function roomRect(element){const r=element.getBoundingClientRect(),z=roomScale();return {top:r.top/z,bottom:r.bottom/z,left:r.left/z,right:r.right/z,width:r.width/z,height:r.height/z};}
// Fit the perspective table below the news wall without covering its controls.
function fitTable(){const table=document.querySelector('#table');table.style.bottom=(roomViewport().height-roomRect(document.querySelector('.fascia')).top+14)+'px';if(document.body.classList.contains('flat')){table.style.height='';return;}const edge=roomRect(document.querySelector('.news-wall')).bottom+16;let low=40,high=roomViewport().height*3;for(let i=0;i<18;i++){const h=(low+high)/2;table.style.height=h+'px';if(roomRect(table).top<edge)high=h;else low=h;}table.style.height=low+'px';}
addEventListener('resize',fitTable);document.querySelector('#perspective').addEventListener('click',fitTable);fitTable();

function openRoomNation(country){if(typeof country!=='string'||!country.trim())return;current='nation';loading.hidden=false;loading.textContent='Opening '+country+'…';frame.title=country+' — nation map';document.querySelector('#surface-label').textContent='NATION / '+country.toUpperCase();document.querySelector('#surface-status').textContent=country;document.querySelector('#boundary').textContent='Native nation record · dated conflict roles and source observations.';document.querySelectorAll('[data-view]').forEach(b=>b.removeAttribute('aria-current'));frame.src='views/nation.html?country='+encodeURIComponent(country);history.replaceState(null,'','#nation?country='+encodeURIComponent(country));}
addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='war-room-nation')openRoomNation(event.data.country);});
const nationRoute=new URLSearchParams(location.hash.replace(/^#nation\?/,''));if(location.hash.startsWith('#nation?'))openRoomNation(nationRoute.get('country'));

// Keep native controls in their own document: closures and document queries remain intact.
// The foreground console forwards user actions and mirrors native values/readouts.
const consoleDock=document.querySelector('#map-controls');
let controlTimer;
function connectControls(){
 clearInterval(controlTimer);consoleDock.replaceChildren();
 const doc=frame.contentDocument;if(!doc)return;
 const selectors='.controls,.gas-controls,.mortality-controls,.hormuz-controls,.satellite-toolbar,.orbit-controls,.data-playback,.room-map-place,.human-cost-map-summary,.tab-bar,.nation-timeline,.modebar';
 const mirrors=new Map();let serial=0;
 function rebuild(source,entry){
  const clone=source.cloneNode(true);const pairs=[];
  function pair(a,b){pairs.push([a,b]);for(let i=0;i<a.childNodes.length;i++)pair(a.childNodes[i],b.childNodes[i]);}pair(source,clone);
  clone.classList.remove('room-source-controls');clone.classList.add('console-group');
  for(const [a,b] of pairs){if(a.nodeType!==1)continue;
   if(b.id)b.id='console-'+entry.id+'-'+b.id;
   for(const attr of ['for','list','aria-controls','aria-labelledby','aria-describedby'])if(b.hasAttribute(attr))b.setAttribute(attr,b.getAttribute(attr).split(' ').map(id=>'console-'+entry.id+'-'+id).join(' '));
   if(b.name)b.name='console-'+entry.id+'-'+b.name;
   if(b.matches('button,a,input[type=checkbox],input[type=radio]'))b.addEventListener('click',event=>{event.preventDefault();a.click();sync();});
   if(a.id==='room-place-search'||a.id==='search')b.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();a.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}});
   if(b.matches('input:not([type=checkbox]):not([type=radio]),select,textarea'))for(const type of ['input','change'])b.addEventListener(type,()=>{a.value=b.value;a.dispatchEvent(new frame.contentWindow.Event(type,{bubbles:true}));sync();});
  }
  if(entry.clone)entry.clone.replaceWith(clone);else entry.destination.append(clone);
  entry.clone=clone;entry.pairs=pairs;
 }
 function sync(){
  if(frame.contentDocument!==doc)return;
  for(const source of doc.querySelectorAll(selectors)){
   if(doc.body.dataset.roomView==='map'&&source.closest('.satellite-toolbar'))continue;
   if(source.parentElement?.closest(selectors))continue;
   let entry=mirrors.get(source);if(!entry){entry={id:++serial,destination:consoleDock};mirrors.set(source,entry);rebuild(source,entry);source.classList.add('room-source-controls');}
   if(entry.pairs.some(([a,b])=>a.childNodes.length!==b.childNodes.length||(a.nodeType===1&&a!==source&&!source.contains(a)))){rebuild(source,entry);}
   entry.clone.hidden=!!source.closest('[hidden]');
   for(const [a,b] of entry.pairs){if(a.nodeType===3){if(b.nodeValue!==a.nodeValue)b.nodeValue=a.nodeValue;continue;}if(a.nodeType!==1)continue;
    if(a.childNodes.length&&[...a.childNodes].every(n=>n.nodeType===3)&&b.textContent!==a.textContent)b.textContent=a.textContent;
    for(const attr of ['disabled','hidden','aria-pressed','aria-selected','aria-expanded','title','min','max','step']){const val=a.getAttribute(attr);if(val===null)b.removeAttribute(attr);else if(b.getAttribute(attr)!==val)b.setAttribute(attr,val);}
    if(a.matches('input,select,textarea')){if(document.activeElement!==b&&b.value!==a.value)b.value=a.value;if('checked'in a)b.checked=a.checked;}
   }
   // Hidden ancestor tabs also hide their matching timeline controls.
   if(source.closest('[hidden]'))entry.clone.hidden=true;
  }
  for(const [source,entry] of mirrors)if(!source.isConnected){entry.clone.remove();mirrors.delete(source);}
 }
 sync();controlTimer=setInterval(sync,150);frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('resize'));
}
frame.addEventListener('load',connectControls);
const fullscreenButton=document.querySelector('#fullscreen');
fullscreenButton.hidden=!document.fullscreenEnabled;
fullscreenButton.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(error){document.querySelector('#surface-status').textContent='Fullscreen unavailable: '+error.message;}});
document.addEventListener('fullscreenchange',()=>{const active=!!document.fullscreenElement;fullscreenButton.setAttribute('aria-pressed',String(active));fullscreenButton.textContent=active?'Exit fullscreen':'Fullscreen';fitTable();});
new ResizeObserver(fitTable).observe(document.querySelector('.fascia'));

