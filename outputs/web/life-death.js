(() => {
  const war=window.WAR_MAPS_DATA,health=window.LIFE_DEATH_METRICS,births=window.CRUDE_BIRTH_RATE_DATA,population=window.POPULATION_DATA;
  if(!war||!health||!births||!population||!window.THREE)return;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dark=()=>document.documentElement.dataset.theme==='dark';
  const PHI=(1+Math.sqrt(5))/2,MAX_BLOCKS=18,BLOCK_GAP=.12,MAP_SCALE=.63,MAP_Y=9;
  const palette={conflict:['#090a08','#d52222'],population:['#776526','#ffd500'],mortality:['#111820','#273849'],fertility:['#21151e','#4b3045'],birth:['#27310f','#7dff36']};
  const RAIL_METRICS=['population','fertility','conflict','mortality'];
  const aliases={
    'Bahamas':'The Bahamas','Bolivia (Plurinational State of)':'Bolivia','Brunei Darussalam':'Brunei',
    'Cabo Verde':'Cape Verde','Congo':'Republic of the Congo',"Côte d'Ivoire":'Ivory Coast',
    "Democratic People's Republic of Korea":'North Korea','Eswatini':'eSwatini',
    'Iran (Islamic Republic of)':'Iran',"Lao People's Democratic Republic":'Laos',
    'Republic of Korea':'South Korea','Republic of Moldova':'Moldova','Russian Federation':'Russia',
    'Serbia':'Republic of Serbia','Syrian Arab Republic':'Syria','Timor-Leste':'East Timor',
    'Türkiye':'Turkey','United States':'United States of America',
    'Venezuela (Bolivarian Republic of)':'Venezuela','Viet Nam':'Vietnam',
    'Bosnia-Herzegovina':'Bosnia and Herzegovina','Cambodia (Kampuchea)':'Cambodia',
    'DR Congo (Zaire)':'Democratic Republic of the Congo','Myanmar (Burma)':'Myanmar',
    'Russia (Soviet Union)':'Russia','Serbia (Yugoslavia)':'Republic of Serbia',
    'Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'Yemen','Zimbabwe (Rhodesia)':'Zimbabwe'
  };
  const state={active:new Set(['conflict','population','mortality','fertility','birth']),estimate:'best',healthYear:2023,start:'',end:'',geometry:null,birthByMap:new Map(),populationByMap:new Map(),globalPopulation:new Map(population.global||[]),observations:new Map(),selected:'',countryMeshes:[],blocks:[],barGroup:null,metricRailGroup:null,metricRailEpoch:0,metricRailReady:false,metricRailOrder:[...RAIL_METRICS],scene:null,camera:null,renderer:null,controls:null,raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2()};
  const blockGeometries=Array.from({length:MAX_BLOCKS},(_,index)=>new THREE.BoxGeometry(2.5,blockHeight(index),2.5));
  const healthByMap=new Map(health.locations.map(location=>[aliases[location.name]||location.name,{...location,mortality:new Map(location.mortality.map(row=>[row[0],row.slice(1)])),fertility:new Map(location.fertility.map(row=>[row[0],row.slice(1)]))}]));
  const mapName=value=>aliases[value]||war.nations.find(nation=>nation.country===value||nation.map_name===value)?.map_name||value;
  const project=([longitude,latitude])=>[longitude*MAP_SCALE,latitude*MAP_SCALE];
  const format=(value,digits=0)=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});
  const inRange=event=>(event.date_end||event.date_start)>=state.start&&event.date_start<=state.end;
  const activeMetrics=()=>['conflict','population','mortality','fertility','birth'].filter(metric=>state.active.has(metric));

  function aggregate(){
    const observations=new Map();
    const ensure=country=>{if(!observations.has(country))observations.set(country,{country,conflict:{low:0,best:0,high:0,events:0},population:null,mortality:null,fertility:null,birth:null});return observations.get(country)};
    war.events.filter(inRange).forEach(event=>{const item=ensure(mapName(event.country||'Unspecified territory'));item.conflict.events++;['low','best','high'].forEach(key=>item.conflict[key]+=Number(event.fatalities[key]||0));});
    healthByMap.forEach((record,country)=>{const item=ensure(country);item.mortality=record.mortality.get(state.healthYear)||null;item.fertility=record.fertility.get(state.healthYear)||null;});
    state.birthByMap.forEach((record,country)=>{const value=record.get(state.healthYear);if(value!==undefined)ensure(country).birth=[value];});
    state.populationByMap.forEach((record,country)=>{const value=record.get(state.healthYear);if(value!==undefined)ensure(country).population=[value];});
    state.observations=observations;
  }
  function valueFor(item,metric){if(metric==='conflict')return item?.conflict?.[state.estimate]||0;return item?.[metric]?.[0]||0;}
  function maxima(){const result={};['conflict','population','mortality','fertility','birth'].forEach(metric=>result[metric]=Math.max(0,...[...state.observations.values()].map(item=>valueFor(item,metric))));return result;}
  function blockCount(value,max){if(!value||!max)return 0;return 1+Math.floor((MAX_BLOCKS-1)*Math.pow(value/max,PHI));}
  function blockHeight(index){return 1+(PHI-1)*(index/(MAX_BLOCKS-1));}
  function metricColor(metric,index,count,selected=false){const t=count<=1?0:index/(count-1),color=new THREE.Color(palette[metric][0]).lerp(new THREE.Color(palette[metric][1]),t);return selected?color.lerp(new THREE.Color('#f1ca6a'),.38):color;}
  function makeShape(rings){const outer=rings[0];if(!outer?.length)return null;const shape=new THREE.Shape();outer.forEach((point,index)=>{const [x,y]=project(point);index?shape.lineTo(x,y):shape.moveTo(x,y)});shape.closePath();rings.slice(1).forEach(ring=>{const hole=new THREE.Path();ring.forEach((point,index)=>{const [x,y]=project(point);index?hole.lineTo(x,y):hole.moveTo(x,y)});hole.closePath();shape.holes.push(hole)});return shape;}
  function addCountry(feature){const country=feature.properties.ADMIN,polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];polygons.forEach(rings=>{const shape=makeShape(rings);if(!shape)return;const geometry=new THREE.ShapeGeometry(shape,1);geometry.rotateX(-Math.PI/2);const material=new THREE.MeshPhongMaterial({color:dark()?'#555b2f':'#aaa071',side:THREE.DoubleSide,shininess:7,transparent:true,opacity:.98});const mesh=new THREE.Mesh(geometry,material);mesh.position.y=MAP_Y;mesh.userData={country,type:'country'};state.scene.add(mesh);state.countryMeshes.push(mesh);const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,8),new THREE.LineBasicMaterial({color:dark()?'#aaa071':'#555b2f',transparent:true,opacity:.6}));outline.position.y=MAP_Y+.12;state.scene.add(outline)});}

  function addIVMField(scene){
    const vertices=[],spacing=34,h=spacing*Math.sqrt(3)/2,tetra=spacing*Math.sqrt(2/3),a=[spacing,0,0],b=[spacing/2,0,h],c=[spacing/2,tetra,h/3],origin=[0,-120,0];
    const point=(i,j,k)=>[origin[0]+i*a[0]+j*b[0]+k*c[0],origin[1]+k*c[1],origin[2]+i*a[2]+j*b[2]+k*c[2]];
    const edge=(p,q)=>vertices.push(...p,...q);
    for(let k=0;k<=4;k++)for(let i=-9;i<=9;i++)for(let j=-9;j<=9;j++){const p=point(i,j,k);if(i<9)edge(p,point(i+1,j,k));if(j<9)edge(p,point(i,j+1,k));if(k<4)edge(p,point(i,j,k+1));}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const material=new THREE.LineBasicMaterial({color:'#c9a34b',transparent:true,opacity:dark()?.16:.22,depthWrite:false});scene.add(new THREE.LineSegments(geometry,material));
    const horizon=[];for(const angle of [0,Math.PI/3,-Math.PI/3]){const dx=Math.cos(angle),dz=Math.sin(angle),nx=-dz,nz=dx;for(let offset=-24;offset<=24;offset++){const cx=nx*offset*spacing,cz=nz*offset*spacing;horizon.push(cx-dx*820,-4,cz-dz*820,cx+dx*820,-4,cz+dz*820);}}const horizonGeometry=new THREE.BufferGeometry();horizonGeometry.setAttribute('position',new THREE.Float32BufferAttribute(horizon,3));scene.add(new THREE.LineSegments(horizonGeometry,new THREE.LineBasicMaterial({color:'#e1bb5b',transparent:true,opacity:dark()?.16:.22,depthWrite:false})));
  }
  function circlePoints(cx,cz,r,y,segments=40){const points=[];for(let index=0;index<=segments;index++){const angle=index/segments*Math.PI*2;points.push(new THREE.Vector3(cx+Math.cos(angle)*r,y,cz+Math.sin(angle)*r));}return points;}
  function addCompassRose(scene){
    const [cx,zSource]=project([-12,-34]),cz=-zSource,y=MAP_Y+.34,radius=2.25,centers=[[0,0]];
    for(let index=0;index<6;index++){const angle=index*Math.PI/3;centers.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);centers.push([Math.cos(angle)*radius*2,Math.sin(angle)*radius*2]);}
    const disk=new THREE.Mesh(new THREE.CircleGeometry(7.7,64),new THREE.MeshBasicMaterial({color:'#06131a',transparent:true,opacity:.24,depthWrite:false,fog:false}));disk.rotation.x=-Math.PI/2;disk.position.set(cx,y-.11,cz);scene.add(disk);
    const material=new THREE.LineBasicMaterial({color:'#f0cc68',transparent:true,opacity:.98,depthTest:true,depthWrite:false,fog:false});
    centers.forEach(([x,z])=>{const circle=new THREE.BufferGeometry().setFromPoints(circlePoints(cx+x,cz+z,.83,y));scene.add(new THREE.Line(circle,material));});
    const links=[];for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++){const dx=centers[i][0]-centers[j][0],dz=centers[i][1]-centers[j][1],distance=Math.hypot(dx,dz);if(distance<=radius*2+.05)links.push(cx+centers[i][0],y,cz+centers[i][1],cx+centers[j][0],y,cz+centers[j][1]);}
    links.push(cx,y,cz-7,cx,y,cz+7,cx-7,y,cz,cx+7,y,cz,cx-4.95,y,cz-4.95,cx+4.95,y,cz+4.95,cx+4.95,y,cz-4.95,cx-4.95,y,cz+4.95);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(links,3));scene.add(new THREE.LineSegments(geometry,material));
    const pointer=new THREE.BufferGeometry();pointer.setAttribute('position',new THREE.Float32BufferAttribute([cx,y+.03,cz-7,cx-.8,y+.03,cz-5.6,cx,y+.03,cz-7,cx+.8,y+.03,cz-5.6],3));scene.add(new THREE.LineSegments(pointer,new THREE.LineBasicMaterial({color:'#fff0a8',depthTest:true,depthWrite:false,fog:false})));
  }
  function metricRailRows(){
    const observations=[...state.observations.values()];
    const mean=metric=>{const values=observations.map(item=>valueFor(item,metric)).filter(value=>value>0);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;};
    const mappedPopulation=observations.reduce((sum,item)=>sum+valueFor(item,'population'),0);
    const rows=new Map([
      {metric:'population',label:'POPULATION',value:format(state.globalPopulation.get(state.healthYear)||mappedPopulation)},
      {metric:'fertility',label:'FERTILITY',value:format(mean('fertility'),2)},
      {metric:'conflict',label:'CONFLICT',value:format(observations.reduce((sum,item)=>sum+valueFor(item,'conflict'),0))},
      {metric:'mortality',label:'MORTALITY',value:format(mean('mortality'),1)}
    ].map(row=>[row.metric,row]));
    return state.metricRailOrder.filter(metric=>state.active.has(metric)).map(metric=>rows.get(metric));
  }
  function makeMetricRailPlane(row,z){
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=128;
    const context=canvas.getContext('2d'),color=palette[row.metric][1];
    context.clearRect(0,0,canvas.width,canvas.height);context.font='900 76px Arial Black, Impact, sans-serif';context.textBaseline='middle';context.lineJoin='round';context.strokeStyle=dark()?'rgba(216,197,143,.72)':'rgba(23,21,15,.58)';context.lineWidth=5;context.fillStyle=color;
    context.strokeText(row.label,18,66);context.fillText(row.label,18,66);const labelWidth=context.measureText(row.label).width;
    context.font='900 62px Arial Black, Impact, sans-serif';const valueWidth=context.measureText(row.value).width,valueX=canvas.width-18-valueWidth;
    context.strokeText(row.value,valueX,66);context.fillText(row.value,valueX,66);
    const start=42+labelWidth,end=valueX-28;
    context.lineWidth=0;for(let x=start;x<end;x+=22){context.beginPath();context.arc(x,68,4.2,0,Math.PI*2);context.fill();}
    const texture=new THREE.CanvasTexture(canvas);texture.anisotropy=Math.min(8,state.renderer.capabilities.getMaxAnisotropy());texture.encoding=THREE.sRGBEncoding;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false,fog:false});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(220,12.5),material);plane.rotation.x=-Math.PI/2;plane.position.set(0,0,z);plane.userData.metric=row.metric;return plane;
  }
  function easeMetricRail(epoch){
    const started=performance.now(),duration=1100;
    const frame=now=>{if(epoch!==state.metricRailEpoch)return;const progress=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-progress,3);state.metricRailGroup.rotation.x=eased*Math.PI/2;if(progress<1)requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
  }
  function slideMetricRail(epoch){
    const started=performance.now(),duration=480,planes=[...state.metricRailGroup.children];
    const frame=now=>{if(epoch!==state.metricRailEpoch)return;const progress=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-progress,3);planes.forEach(plane=>plane.position.z=THREE.MathUtils.lerp(plane.userData.startZ,plane.userData.targetZ,eased));if(progress<1)requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
  }
  function renderMetricRail(){
    if(!state.metricRailGroup)return;
    const previous=new Map(state.metricRailGroup.children.map(child=>[child.userData.metric,child.position.z]));
    state.metricRailGroup.children.forEach(child=>{child.geometry.dispose();child.material.map?.dispose();child.material.dispose();});state.metricRailGroup.clear();
    const epoch=++state.metricRailEpoch;state.metricRailGroup.position.set(0,MAP_Y+7,-90);
    metricRailRows().forEach((row,index)=>{const targetZ=-index*12.75,startZ=previous.has(row.metric)?previous.get(row.metric):targetZ+12.75;const plane=makeMetricRailPlane(row,startZ);plane.userData.startZ=startZ;plane.userData.targetZ=targetZ;state.metricRailGroup.add(plane);});
    if(!state.metricRailReady){state.metricRailReady=true;state.metricRailGroup.rotation.x=0;state.metricRailGroup.children.forEach(plane=>plane.position.z=plane.userData.targetZ);easeMetricRail(epoch);}else{state.metricRailGroup.rotation.x=Math.PI/2;slideMetricRail(epoch);}
  }
  function buildScene(){
    const container=$('#mortality-map'),scene=new THREE.Scene(),background=dark()?'#090b08':'#6f745b';scene.background=new THREE.Color(background);scene.fog=new THREE.FogExp2(background,.0018);state.scene=scene;
    const camera=new THREE.PerspectiveCamera(34,1,.1,1400);camera.position.set(185,190,285);state.camera=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;container.replaceChildren(renderer.domElement);state.renderer=renderer;
    const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,MAP_Y+8,-20);controls.enableDamping=true;controls.dampingFactor=.06;controls.enablePan=false;controls.minDistance=300;controls.maxDistance=560;controls.minPolarAngle=.52;controls.maxPolarAngle=1.22;controls.update();const azimuth=controls.getAzimuthalAngle();controls.minAzimuthAngle=azimuth-.52;controls.maxAzimuthAngle=azimuth+.52;state.controls=controls;
    scene.add(new THREE.HemisphereLight(dark()?'#c5ddd9':'#ffffff',dark()?'#0b1518':'#25383c',1.25));const key=new THREE.DirectionalLight('#ffe0a1',1.35);key.position.set(-90,180,80);scene.add(key);addIVMField(scene);
    const ocean=new THREE.Mesh(new THREE.BoxGeometry(232,1.2,116),new THREE.MeshPhongMaterial({color:dark()?'#181d16':'#858a6b',shininess:12,transparent:true,opacity:.97}));ocean.position.y=MAP_Y-.82;scene.add(ocean);state.geometry.features.forEach(addCountry);addCompassRose(scene);state.metricRailGroup=new THREE.Group();scene.add(state.metricRailGroup);
    state.barGroup=new THREE.Group();scene.add(state.barGroup);
    const resize=()=>{const box=container.getBoundingClientRect(),width=Math.max(320,box.width),height=Math.max(460,box.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe(container);resize();renderer.domElement.addEventListener('pointermove',handlePointerMove);renderer.domElement.addEventListener('pointerleave',()=>{$('#mortality-tooltip').hidden=true});renderer.domElement.addEventListener('click',handleClick);const animate=()=>{requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();
  }

  function addStack(country,metric,value,max,x,z,offset){
    const count=blockCount(value,max);let y=MAP_Y+.35;
    for(let index=0;index<count;index++){const height=blockHeight(index),material=new THREE.MeshPhongMaterial({color:metricColor(metric,index,count,state.selected===country),emissive:state.selected===country?'#3b2405':'#000000',shininess:20});const block=new THREE.Mesh(blockGeometries[index],material);block.position.set(x+offset,y+height/2,z);block.userData={country,metric,index,count,type:'bar'};state.barGroup.add(block);state.blocks.push(block);y+=height+BLOCK_GAP;}
  }
  function updateColumns(){
    aggregate();state.barGroup.children.forEach(child=>child.traverse(object=>object.material?.dispose?.()));state.barGroup.clear();state.blocks=[];const max=maxima(),metrics=activeMetrics();
    state.countryMeshes.forEach(mesh=>{const item=state.observations.get(mesh.userData.country),active=metrics.some(metric=>valueFor(item,metric)>0);mesh.material.color.set(active?(dark()?'#6d7442':'#b9ad7d'):(dark()?'#555b2f':'#aaa071'))});
    for(const feature of state.geometry.features){const country=feature.properties.ADMIN,item=state.observations.get(country);if(!item)continue;const longitude=Number(feature.properties.LABEL_X),latitude=Number(feature.properties.LABEL_Y);if(!Number.isFinite(longitude)||!Number.isFinite(latitude))continue;const [x,zSource]=project([longitude,latitude]);metrics.forEach((metric,index)=>{const value=valueFor(item,metric);if(!value)return;const offset=(index-(metrics.length-1)/2)*2.9;addStack(country,metric,value,max[metric],x,-zSource,offset);});}
    renderMetricRail();renderInspector(state.selected);
  }
  function ranked(){const enabled=activeMetrics(),max=maxima();if(!enabled.length)return[];return [...state.observations.values()].map(item=>{const score=enabled.reduce((sum,metric)=>sum+(max[metric]?valueFor(item,metric)/max[metric]:0),0)/enabled.length;return {...item,score}}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.country.localeCompare(b.country));}
  function valueLabel(item,metric){const value=valueFor(item,metric);if(metric==='conflict')return `${format(value)} ${state.estimate} fatalities`;if(metric==='population')return item?.population?`${format(value)} people`:'No observation';if(metric==='mortality')return item?.mortality?`${format(value,1)} deaths per 100,000`:'No observation';if(metric==='fertility')return item?.fertility?`${format(value,2)} births per woman`:'No observation';return item?.birth?`${format(value,1)} live births per 1,000`:'No observation';}
  function renderInspector(country=''){
    const enabled=activeMetrics(),items=ranked(),item=country?state.observations.get(country):null;
    $('#mortality-kicker').textContent=item?'Selected territory':'Selected field';
    $('#mortality-selection').textContent=item?item.country:'Global comparison';
    const rank=item?items.findIndex(entry=>entry.country===country)+1:0;
    const observations=[...state.observations.values()];
    const totals={
      conflict:observations.reduce((sum,entry)=>sum+valueFor(entry,'conflict'),0),
      population:observations.filter(entry=>entry.population).length,
      mortality:observations.filter(entry=>entry.mortality).length,
      fertility:observations.filter(entry=>entry.fertility).length,
      birth:observations.filter(entry=>entry.birth).length
    };
    const metrics=item?[
      ['Conflict fatalities',valueLabel(item,'conflict')],['Population',valueLabel(item,'population')],
      ['All-cause mortality',valueLabel(item,'mortality')],['Total fertility',valueLabel(item,'fertility')],
      ['Crude birth rate',valueLabel(item,'birth')],['Display rank',rank?`${rank} of ${items.length}`:'Not ranked']
    ]:[
      ['Conflict fatalities',format(totals.conflict)],['Population observations',totals.population],
      ['Mortality observations',totals.mortality],['Fertility observations',totals.fertility],
      ['Birth-rate observations',totals.birth],['Measure year',state.healthYear]
    ];
    $('#mortality-metrics').innerHTML=metrics.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('#ranking-title').textContent=enabled.length===1?`Highest ${enabled[0]} values`:'Highest enabled normalized values';
    $('#mortality-ranking').innerHTML=items.slice(0,12).map((entry,index)=>`<button type="button" data-country="${esc(entry.country)}"><b>${index+1}</b><span>${esc(entry.country)}</span><strong>${enabled.length===1?esc(valueLabel(entry,enabled[0])):`${(entry.score*100).toFixed(1)}%`}</strong></button>`).join('')||'<p>Enable at least one metric to draw stacks.</p>';
    document.querySelectorAll('[data-country]').forEach(button=>button.addEventListener('click',()=>selectCountry(button.dataset.country,true)));
    $('#mortality-boundary').textContent=`Conflict fatalities cover ${state.start} through ${state.end} from UCDP candidate events. Mortality and total fertility use IHME GBD 2023 results when available (1980-2023). Crude birth rate uses World Bank WDI / UN observations for 1960-2024; total population uses the corresponding 1960-2025 WDI series. Every metric is normalized independently because counts and rates are not commensurate. Missing source years remain missing. Event territory is not victim nationality.`;
    updateSelection();
  }
  function updateSelection(){state.blocks.forEach(block=>{block.material.color.copy(metricColor(block.userData.metric,block.userData.index,block.userData.count,state.selected===block.userData.country));block.material.emissive.set(state.selected===block.userData.country?'#3b2405':'#000000')});}
  function intersect(event){const rect=state.renderer.domElement.getBoundingClientRect();state.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);state.raycaster.setFromCamera(state.pointer,state.camera);return state.raycaster.intersectObjects([...state.blocks,...state.countryMeshes],false)[0]?.object||null;}
  function handlePointerMove(event){const object=intersect(event),country=object?.userData.country,tooltip=$('#mortality-tooltip');state.renderer.domElement.style.cursor=country?'pointer':'grab';if(!country){tooltip.hidden=true;return}const item=state.observations.get(country),metric=object.userData.metric;tooltip.innerHTML=`<strong>${esc(country)}</strong>${metric?`<span>${esc(valueLabel(item,metric))}</span>`:'<span>Select to inspect the territory</span>'}`;const rect=state.renderer.domElement.getBoundingClientRect();tooltip.style.left=`${event.clientX-rect.left+14}px`;tooltip.style.top=`${event.clientY-rect.top+14}px`;tooltip.hidden=false;}
  function handleClick(event){const object=intersect(event);if(object?.userData.country)selectCountry(object.userData.country,false);}
  function selectCountry(country,focus=false){state.selected=country;renderInspector(country);if(focus){const feature=state.geometry.features.find(item=>item.properties.ADMIN===country);if(!feature)return;const [x,zSource]=project([Number(feature.properties.LABEL_X),Number(feature.properties.LABEL_Y)]);state.controls.target.set(x,MAP_Y+7,-zSource);state.camera.position.set(x+60,MAP_Y+85,-zSource+95);state.controls.update();}}
  function resetView(){state.selected='';state.camera.position.set(185,190,285);state.controls.target.set(0,MAP_Y+8,-20);state.controls.update();renderInspector();}
  function bindControls(){
    const dates=war.events.flatMap(event=>[event.date_start,event.date_end||event.date_start]).filter(Boolean).sort();state.start=dates[0];state.end=dates.at(-1);$('#mortality-start').min=state.start;$('#mortality-start').max=state.end;$('#mortality-start').value=state.start;$('#mortality-end').min=state.start;$('#mortality-end').max=state.end;$('#mortality-end').value=state.end;document.querySelectorAll('[data-estimate]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.estimate===state.estimate)));
    const metricInputs=[...document.querySelectorAll('[data-metric]')];state.active=new Set(metricInputs.filter(input=>input.checked).map(input=>input.dataset.metric));state.metricRailOrder=RAIL_METRICS.filter(metric=>state.active.has(metric));metricInputs.forEach(input=>input.addEventListener('change',()=>{const metric=input.dataset.metric;if(input.checked){state.active.add(metric);if(RAIL_METRICS.includes(metric)&&!state.metricRailOrder.includes(metric))state.metricRailOrder.push(metric);}else{state.active.delete(metric);state.metricRailOrder=state.metricRailOrder.filter(item=>item!==metric);}updateColumns()}));const year=$('#health-year');state.healthYear=Number(year.value);$('#health-year-output').textContent=state.healthYear;let yearTimer;year.addEventListener('input',event=>{state.healthYear=Number(event.target.value);$('#health-year-output').textContent=state.healthYear;clearTimeout(yearTimer);yearTimer=setTimeout(updateColumns,120)});year.addEventListener('change',()=>{clearTimeout(yearTimer);updateColumns()});$('#mortality-start').addEventListener('change',event=>{state.start=event.target.value;if(state.start>state.end){state.end=state.start;$('#mortality-end').value=state.end}updateColumns()});$('#mortality-end').addEventListener('change',event=>{state.end=event.target.value;if(state.end<state.start){state.start=state.end;$('#mortality-start').value=state.start}updateColumns()});document.querySelectorAll('[data-estimate]').forEach(button=>button.addEventListener('click',()=>{state.estimate=button.dataset.estimate;document.querySelectorAll('[data-estimate]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));updateColumns()}));$('#mortality-reset').addEventListener('click',resetView);
    const names=[...new Set((state.geometry?.features||[]).map(feature=>feature.properties.ADMIN))];$('#mortality-search').addEventListener('change',event=>{const needle=event.target.value.trim().toLowerCase(),match=names.find(name=>name.toLowerCase()===needle)||names.find(name=>name.toLowerCase().startsWith(needle));if(match)selectCountry(match,true)});$('#mortality-search').addEventListener('search',event=>{if(!event.target.value)resetView()});$('#theme-toggle').addEventListener('click',()=>{const theme=dark()?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme)}catch(error){}location.reload()});
  }
  async function init(){try{const response=await fetch('assets/world.geojson');if(!response.ok)throw new Error(`geometry ${response.status}`);state.geometry=await response.json();const countryByCode=new Map();state.geometry.features.forEach(feature=>{const properties=feature.properties;[properties.WB_A3,properties.ISO_A3,properties.ADM0_A3,properties.GU_A3].filter(code=>code&&code!=='-99').forEach(code=>countryByCode.set(code,properties.ADMIN));});births.locations.forEach(location=>{const country=countryByCode.get(location.iso3);if(country)state.birthByMap.set(country,new Map(location.birth_rate));});population.locations.forEach(location=>{const country=countryByCode.get(location.iso3);if(country)state.populationByMap.set(country,new Map(location.population));});bindControls();$('#mortality-country-list').innerHTML=state.geometry.features.map(feature=>`<option value="${esc(feature.properties.ADMIN)}"></option>`).join('');buildScene();updateColumns()}catch(error){console.error(error);$('#mortality-map').innerHTML=`<p class="boundary-note mortality-error">The Life and Death field could not be rendered: ${esc(error.message||error)}</p>`;}}
  init();
})();
