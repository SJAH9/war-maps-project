(() => {
  const data=window.WAR_MAPS_DATA;
  if(!data||!window.THREE)return;

  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dark=()=>document.documentElement.dataset.theme==='dark';
  const nationByName=new Map(data.nations.flatMap(nation=>[[nation.country,nation],[nation.map_name,nation]]));
  const conflictById=new Map(data.conflicts.map(conflict=>[conflict.id,conflict]));
  const state={estimate:'best',scale:'sqrt',start:'',end:'',geometry:null,aggregates:new Map(),selected:'',countryMeshes:[],barMeshes:[],barGroup:null,scene:null,camera:null,renderer:null,controls:null,raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2(),hovered:''};
  const MAP_SCALE=.63;
  const MAX_HEIGHT=24;
  const aliases={'Bosnia-Herzegovina':'Bosnia and Herzegovina','Cambodia (Kampuchea)':'Cambodia','DR Congo (Zaire)':'Democratic Republic of the Congo','Ivory Coast':"Cote d'Ivoire",'Myanmar (Burma)':'Myanmar','Russia (Soviet Union)':'Russia','Serbia (Yugoslavia)':'Serbia','South Vietnam':'Vietnam','Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'Yemen','Zimbabwe (Rhodesia)':'Zimbabwe'};

  const mapName=value=>nationByName.get(value)?.map_name||aliases[value]||value;
  const project=([longitude,latitude])=>[longitude*MAP_SCALE,latitude*MAP_SCALE];
  const inRange=event=>(event.date_end||event.date_start)>=state.start&&event.date_start<=state.end;
  const format=value=>Number(value||0).toLocaleString();
  const colorFor=(ratio,selected=false)=>{
    const low=new THREE.Color(dark()?'#2f9b98':'#157974');
    const high=new THREE.Color(selected?'#ffd477':'#e65575');
    return low.lerp(high,Math.max(0,Math.min(1,ratio)));
  };

  function aggregateEvents() {
    const totals=new Map();
    data.events.filter(inRange).forEach(event=>{
      const country=mapName(event.country||'Unspecified territory');
      if(!totals.has(country))totals.set(country,{country,low:0,best:0,high:0,events:0,conflicts:new Map()});
      const item=totals.get(country);item.events++;
      ['low','best','high'].forEach(key=>item[key]+=Number(event.fatalities[key]||0));
      const title=conflictById.get(event.conflict_id)?.title||event.conflict_name||'Unlinked event record';
      item.conflicts.set(event.conflict_id||title,{id:event.conflict_id,title});
    });
    state.aggregates=totals;
  }

  function scaledHeight(value,max) {
    if(!value||!max)return 0;
    const ratio=state.scale==='linear'?value/max:state.scale==='log'?Math.log1p(value)/Math.log1p(max):Math.sqrt(value/max);
    return 3+ratio*MAX_HEIGHT;
  }

  function makeShape(rings) {
    const outer=rings[0];if(!outer?.length)return null;
    const shape=new THREE.Shape();
    outer.forEach((point,index)=>{const [x,y]=project(point);if(index)shape.lineTo(x,y);else shape.moveTo(x,y);});
    shape.closePath();
    rings.slice(1).forEach(ring=>{const hole=new THREE.Path();ring.forEach((point,index)=>{const [x,y]=project(point);if(index)hole.lineTo(x,y);else hole.moveTo(x,y);});hole.closePath();shape.holes.push(hole);});
    return shape;
  }

  function addCountry(feature) {
    const country=feature.properties.ADMIN;
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
    polygons.forEach(rings=>{
      const shape=makeShape(rings);if(!shape)return;
      const geometry=new THREE.ShapeGeometry(shape,1);geometry.rotateX(-Math.PI/2);
      const material=new THREE.MeshPhongMaterial({color:dark()?'#19332f':'#b7ccc4',side:THREE.DoubleSide,shininess:4,transparent:true,opacity:.96});
      const mesh=new THREE.Mesh(geometry,material);mesh.position.y=0;mesh.userData={country,type:'country'};state.scene.add(mesh);state.countryMeshes.push(mesh);
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,8),new THREE.LineBasicMaterial({color:dark()?'#5f746e':'#657c74',transparent:true,opacity:.46}));outline.position.y=.12;state.scene.add(outline);
    });
  }

  function buildScene() {
    const container=$('#mortality-map');
    const scene=new THREE.Scene();scene.background=new THREE.Color(dark()?'#06141d':'#71adbd');state.scene=scene;
    const camera=new THREE.PerspectiveCamera(34,1,.1,1000);camera.position.set(185,220,280);state.camera=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;container.replaceChildren(renderer.domElement);state.renderer=renderer;
    const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,25,0);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=95;controls.maxDistance=500;controls.minPolarAngle=.28;controls.maxPolarAngle=1.48;controls.update();state.controls=controls;
    scene.add(new THREE.HemisphereLight(dark()?'#b9d9d0':'#ffffff',dark()?'#10221f':'#47645c',1.35));
    const key=new THREE.DirectionalLight('#ffe4bd',1.2);key.position.set(-90,180,80);scene.add(key);
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(232,116),new THREE.MeshPhongMaterial({color:dark()?'#0a2632':'#4f98ab',shininess:8}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-.75;scene.add(ocean);
    state.geometry.features.forEach(addCountry);
    state.barGroup=new THREE.Group();scene.add(state.barGroup);
    const resize=()=>{const box=container.getBoundingClientRect();const width=Math.max(320,box.width),height=Math.max(460,box.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
    new ResizeObserver(resize).observe(container);resize();
    renderer.domElement.addEventListener('pointermove',handlePointerMove);
    renderer.domElement.addEventListener('pointerleave',()=>{$('#mortality-tooltip').hidden=true;state.hovered='';});
    renderer.domElement.addEventListener('click',handleClick);
    const animate=()=>{requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  }

  function updateColumns() {
    aggregateEvents();
    state.barGroup.children.forEach(child=>child.traverse(object=>{object.geometry?.dispose?.();object.material?.dispose?.();}));state.barGroup.clear();state.barMeshes=[];
    const values=[...state.aggregates.values()];const max=Math.max(0,...values.map(item=>item[state.estimate]));
    state.countryMeshes.forEach(mesh=>{
      const value=state.aggregates.get(mesh.userData.country)?.[state.estimate]||0;
      const ratio=max?value/max:0;mesh.material.color.set(value?colorFor(ratio*.58):dark()?'#19332f':'#b7ccc4');
    });
    values.filter(item=>item[state.estimate]>0).forEach(item=>{
      const nation=nationByName.get(item.country);if(!nation?.centroid?.every(Number.isFinite))return;
      const height=scaledHeight(item[state.estimate],max);const [x,zSource]=project(nation.centroid);const width=2.1;
      const material=new THREE.MeshPhongMaterial({color:colorFor(item[state.estimate]/max,state.selected===item.country),emissive:state.selected===item.country?'#4f2708':'#000000',shininess:24});
      const bar=new THREE.Mesh(new THREE.BoxGeometry(width,height,width),material);bar.position.set(x,height/2+.2,-zSource);bar.userData={country:item.country,type:'bar'};state.barGroup.add(bar);state.barMeshes.push(bar);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(bar.geometry),new THREE.LineBasicMaterial({color:'#ffe5b2',transparent:true,opacity:.35}));bar.add(edges);
    });
    $('#scale-maximum').textContent=max?format(max):'0';
    renderInspector(state.selected);
  }

  function ranked() {
    return [...state.aggregates.values()].sort((a,b)=>b[state.estimate]-a[state.estimate]||a.country.localeCompare(b.country));
  }

  function renderInspector(country='') {
    const items=ranked();const total=items.reduce((sum,item)=>sum+item[state.estimate],0);const all={low:0,best:0,high:0,events:0};items.forEach(item=>{['low','best','high'].forEach(key=>all[key]+=item[key]);all.events+=item.events;});
    const observed=country?state.aggregates.get(country):null;
    const item=country?(observed||{country,low:0,best:0,high:0,events:0,conflicts:new Map()}):null;
    $('#mortality-kicker').textContent=item?'Selected territory':'Selected boundary';
    $('#mortality-selection').textContent=item?item.country:'Global event field';
    const rank=item?items.findIndex(entry=>entry.country===item.country):-1;
    const metrics=item?[['Rank',rank>=0?`${rank+1} of ${items.length}`:'No recorded total'],['Selected estimate',format(item[state.estimate])],['Low / best / high',`${format(item.low)} / ${format(item.best)} / ${format(item.high)}`],['Candidate events',format(item.events)],['Share of mapped total',total?`${(item[state.estimate]/total*100).toFixed(1)}%`:'0%']]:[['Mapped territories',format(items.length)],['Selected estimate',format(total)],['Low / best / high',`${format(all.low)} / ${format(all.best)} / ${format(all.high)}`],['Candidate events',format(all.events)],['Estimate field',state.estimate]];
    $('#mortality-metrics').innerHTML=metrics.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')+(item?`<a href="nation.html?country=${encodeURIComponent(nationByName.get(item.country)?.country||item.country)}">Open nation record</a>`:'');
    $('#mortality-ranking').innerHTML=items.slice(0,12).map((entry,index)=>`<button type="button" data-country="${esc(entry.country)}"><b>${index+1}</b><span>${esc(entry.country)}</span><strong>${format(entry[state.estimate])}</strong></button>`).join('')||'<p>No fatality observations occur in this date range.</p>';
    document.querySelectorAll('[data-country]').forEach(button=>button.addEventListener('click',()=>selectCountry(button.dataset.country,true)));
    $('#mortality-boundary').textContent=`${state.start} through ${state.end}. Heights use the UCDP ${state.estimate} fatality estimate and a ${state.scale==='sqrt'?'square-root':state.scale} display scale. Event territory is a location field, not victim nationality.`;
    updateColumnsSelection();
  }

  function updateColumnsSelection() {
    const max=Math.max(0,...[...state.aggregates.values()].map(item=>item[state.estimate]));
    state.barMeshes.forEach(bar=>{const value=state.aggregates.get(bar.userData.country)?.[state.estimate]||0;bar.material.color.copy(colorFor(max?value/max:0,state.selected===bar.userData.country));bar.material.emissive.set(state.selected===bar.userData.country?'#4f2708':'#000000');});
  }

  function intersect(event) {
    const rect=state.renderer.domElement.getBoundingClientRect();state.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);state.raycaster.setFromCamera(state.pointer,state.camera);
    return state.raycaster.intersectObjects([...state.barMeshes,...state.countryMeshes],false)[0]?.object||null;
  }

  function handlePointerMove(event) {
    const object=intersect(event);const country=object?.userData.country||'';const tooltip=$('#mortality-tooltip');state.renderer.domElement.style.cursor=country?'pointer':'grab';
    if(!country){tooltip.hidden=true;state.hovered='';return;}
    state.hovered=country;const item=state.aggregates.get(country);tooltip.innerHTML=`<strong>${esc(country)}</strong><span>${item?`${format(item[state.estimate])} ${esc(state.estimate)} estimate`:'No loaded fatalities'}</span>`;tooltip.style.left=`${event.clientX-state.renderer.domElement.getBoundingClientRect().left+14}px`;tooltip.style.top=`${event.clientY-state.renderer.domElement.getBoundingClientRect().top+14}px`;tooltip.hidden=false;
  }

  function handleClick(event) {const object=intersect(event);if(object?.userData.country)selectCountry(object.userData.country,false);}

  function selectCountry(country,focus=false) {
    state.selected=country;renderInspector(country);
    if(focus){
      const nation=nationByName.get(country);if(nation?.centroid?.every(Number.isFinite)){const [x,zSource]=project(nation.centroid);const target=new THREE.Vector3(x,8,-zSource);state.controls.target.copy(target);state.camera.position.set(x+60,85,-zSource+95);state.controls.update();}
    }
  }

  function resetView() {state.selected='';state.camera.position.set(185,220,280);state.controls.target.set(0,25,0);state.controls.update();renderInspector();}

  function bindControls() {
    const dates=data.events.flatMap(event=>[event.date_start,event.date_end||event.date_start]).filter(Boolean).sort();state.start=dates[0];state.end=dates.at(-1);
    $('#mortality-scale').value=state.scale;
    document.querySelectorAll('[data-estimate]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.estimate===state.estimate)));
    $('#mortality-start').min=state.start;$('#mortality-start').max=state.end;$('#mortality-start').value=state.start;
    $('#mortality-end').min=state.start;$('#mortality-end').max=state.end;$('#mortality-end').value=state.end;
    $('#mortality-start').addEventListener('change',event=>{state.start=event.target.value;if(state.start>state.end){state.end=state.start;$('#mortality-end').value=state.end;}updateColumns();});
    $('#mortality-end').addEventListener('change',event=>{state.end=event.target.value;if(state.end<state.start){state.start=state.end;$('#mortality-start').value=state.start;}updateColumns();});
    document.querySelectorAll('[data-estimate]').forEach(button=>button.addEventListener('click',()=>{state.estimate=button.dataset.estimate;document.querySelectorAll('[data-estimate]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));updateColumns();}));
    $('#mortality-scale').addEventListener('change',event=>{state.scale=event.target.value;updateColumns();});
    $('#mortality-reset').addEventListener('click',resetView);
    $('#mortality-search').addEventListener('search',event=>{if(!event.target.value)resetView();});
    $('#mortality-search').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const needle=event.target.value.trim().toLowerCase();const match=[...nationByName.keys()].find(name=>name.toLowerCase()===needle)||[...nationByName.keys()].find(name=>name.toLowerCase().startsWith(needle));if(match)selectCountry(mapName(match),true);});
    $('#theme-toggle').addEventListener('click',()=>{const theme=dark()?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme);}catch(error){/* Theme still applies. */}location.reload();});
  }

  async function init() {
    bindControls();
    try{const response=await fetch('assets/world.geojson');if(!response.ok)throw new Error(`geometry ${response.status}`);state.geometry=await response.json();buildScene();updateColumns();}
    catch(error){$('#mortality-map').innerHTML='<p class="boundary-note mortality-error">The map geometry could not be loaded. Fatality records remain available in the generated dataset.</p>';}
  }

  init();
})();
