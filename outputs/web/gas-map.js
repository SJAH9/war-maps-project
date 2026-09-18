(() => {
  const $ = selector => document.querySelector(selector);
  const data = window.GAS_PRICE_DATA;
  const geometry = window.WAR_MAPS_GEOMETRY;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const MAP_SCALE = .63, MAP_Y = 9, GALLON_LITRES = 3.785411784;
  const state = {fuel:'gasoline', region:'All', search:'', selected:null, visible:[], scene:null, renderer:null, camera:null, controls:null, towerGroup:null, towers:[], raycaster:null, pointer:null};
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const rawPrice = row => row[state.fuel];
  const usdPerLitre = row => {
    const rate = data.currency_per_eur[row.currency];
    return rate && rawPrice(row) != null ? rawPrice(row) * data.usd_per_eur / rate / (row.unit === 'US gallon' ? GALLON_LITRES : 1) : null;
  };
  const money = (value, currency, digits = 2) => new Intl.NumberFormat('en-US', {style:'currency', currency, minimumFractionDigits:digits, maximumFractionDigits:digits}).format(value);
  const priceColor = value => {
    const t = Math.max(0, Math.min(1, (value - .5) / 2.5));
    return new THREE.Color(t < .5 ? '#51d7c4' : '#e3bb55').lerp(new THREE.Color(t < .5 ? '#e3bb55' : '#ed6547'), t < .5 ? t * 2 : (t - .5) * 2);
  };
  const tone = value => {
    const t = Math.max(0, Math.min(1, (value - .5) / 2.5));
    return t < .5 ? `color-mix(in srgb, #51d7c4 ${Math.round((1-t*2)*100)}%, #e3bb55)` : `color-mix(in srgb, #e3bb55 ${Math.round((2-t*2)*100)}%, #ed6547)`;
  };
  const rowLabel = row => `${row.name}${row.scope === 'country' ? '' : ` · ${row.scope}`}`;
  function filterRows() {
    state.visible = data.observations.filter(row => rawPrice(row) != null &&
      (state.region === 'All' || (state.region === 'Islands' ? row.island : row.region === state.region)) &&
      (!state.search || `${row.name} ${row.region} ${row.scope}`.toLocaleLowerCase().includes(state.search)));
    $('#gas-count').textContent = state.visible.length.toLocaleString();
    $('#gas-list-count').textContent = `${state.visible.length} priced locations`;
    if (state.selected && !state.visible.includes(state.selected)) state.selected = null;
    drawTowers();
    renderInspector();
    renderList();
  }
  function renderInspector() {
    const row = state.selected;
    $('#gas-kicker').textContent = row ? `${row.region} / ${row.scope}` : `Snapshot ${data.snapshot}`;
    $('#gas-selected').textContent = row ? row.name : 'A geography of pump prices';
    $('#gas-selected-sub').textContent = row ? row.detail : 'Choose a tower or a location below.';
    if (!row) {
      const count = state.visible.length;
      const dated = [...new Set(state.visible.map(item => item.date))].sort();
      $('#gas-facts').innerHTML = `<div><span>Visible observations</span><strong>${count}</strong></div><div><span>Price dates</span><strong>${dated[0] || '—'}–${dated.at(-1) || '—'}</strong></div><div><span>Fuel</span><strong>${state.fuel === 'gasoline' ? 'Pump gasoline' : 'Diesel'}</strong></div><div><span>Comparison unit</span><strong>USD / litre</strong></div>`;
      return;
    }
    const perL = usdPerLitre(row), digits = row.currency === 'JPY' || row.currency === 'INR' ? 1 : row.unit === 'US gallon' ? 3 : 2;
    const cells = [
      ['Reported price', `${money(rawPrice(row), row.currency, digits)} / ${row.unit}`],
      ['Indicative conversion', `${money(perL, 'USD', 2)} / litre`],
      ['Observation date', row.date],
      ['Reporting geography', row.scope],
      ['Exchange rate date', data.fx_date],
      ['Exchange source', `<a href="${esc(data.sources[row.currency === 'TWD' ? 'taiwan_fx' : 'fx'])}" target="_blank" rel="noopener noreferrer">${row.currency === 'TWD' ? 'CBC TWD/USD' : 'ECB daily rates'} ↗</a>`],
      ['Original source', `<a href="${esc(data.sources[row.source])}" target="_blank" rel="noopener noreferrer">Open ${esc(row.source.toUpperCase())} ↗</a>`],
    ];
    $('#gas-facts').innerHTML = cells.map(([label,value]) => `<div><span>${esc(label)}</span><strong>${label === 'Original source' || label === 'Exchange source' ? value : esc(value)}</strong></div>`).join('');
  }
  function renderList() {
    const sorted = [...state.visible].sort((a,b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
    $('#gas-list').innerHTML = sorted.length ? sorted.map(row => {
      const index = data.observations.indexOf(row);
      const value = usdPerLitre(row);
      return `<button type="button" data-index="${index}" aria-current="${row === state.selected}"><i style="background:${tone(value)}"></i><span><b>${esc(row.name)}</b><small>${esc(row.scope)} · ${esc(row.date)}</small></span><strong>${esc(money(rawPrice(row),row.currency,row.currency==='JPY'||row.currency==='INR'?0:2))}</strong></button>`;
    }).join('') : '<p class="gas-list-empty">No priced observations match these controls. Try another region, fuel, or search.</p>';
  }
  function selectRow(row, focus = false) {
    state.selected = row;
    renderInspector(); renderList(); drawTowers();
    if (focus && state.controls) {
      const x = row.lon * MAP_SCALE, z = -row.lat * MAP_SCALE;
      state.controls.target.set(x, MAP_Y + 5, z);
      state.camera.position.set(x + 64, MAP_Y + 84, z + 96);
      state.controls.update();
    }
  }
  function makeShape(rings) {
    if (!rings?.[0]?.length) return null;
    const shape = new THREE.Shape();
    rings[0].forEach(([lon,lat], index) => index ? shape.lineTo(lon*MAP_SCALE,lat*MAP_SCALE) : shape.moveTo(lon*MAP_SCALE,lat*MAP_SCALE));
    shape.closePath();
    rings.slice(1).forEach(ring => {
      const hole = new THREE.Path();
      ring.forEach(([lon,lat], index) => index ? hole.lineTo(lon*MAP_SCALE,lat*MAP_SCALE) : hole.moveTo(lon*MAP_SCALE,lat*MAP_SCALE));
      hole.closePath(); shape.holes.push(hole);
    });
    return shape;
  }
  function addWorld() {
    const ocean = new THREE.Mesh(new THREE.BoxGeometry(232,1.2,116),new THREE.MeshPhongMaterial({color:dark()?'#171f1c':'#929c8d',shininess:16}));
    ocean.position.y=MAP_Y-.82; state.scene.add(ocean);
    geometry.features.forEach(feature => {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      polygons.forEach(rings => {
        const shape=makeShape(rings); if(!shape)return;
        const geo=new THREE.ShapeGeometry(shape,1); geo.rotateX(-Math.PI/2);
        const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:dark()?'#5e6941':'#c2bc8e',side:THREE.DoubleSide,shininess:5}));
        mesh.position.y=MAP_Y; state.scene.add(mesh);
        const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo,8),new THREE.LineBasicMaterial({color:dark()?'#bcb276':'#5b5f45',transparent:true,opacity:.5}));
        edge.position.y=MAP_Y+.08; state.scene.add(edge);
      });
    });
  }
  function addAtmosphere() {
    let seed=14031945; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296),stars=[];
    for(let i=0;i<1000;i++){const az=random()*Math.PI*2,el=-.28+Math.pow(random(),1.25)*1.15,r=720+random()*120,h=Math.cos(el)*r;stars.push(Math.cos(az)*h,Math.sin(el)*r-60,Math.sin(az)*h);}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
    state.scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:'#e4edf5',size:1.8,sizeAttenuation:true,transparent:true,opacity:dark()?.72:.43,depthWrite:false,fog:false})));
    const vertices=[],spacing=34,h=spacing*Math.sqrt(3)/2,tetra=spacing*Math.sqrt(2/3);
    const point=(i,j,k)=>[i*spacing+j*spacing/2+k*spacing/2,-120+k*tetra,j*h+k*h/3];
    for(let k=0;k<=4;k++)for(let i=-9;i<=9;i++)for(let j=-9;j<=9;j++){const p=point(i,j,k);if(i<9)vertices.push(...p,...point(i+1,j,k));if(j<9)vertices.push(...p,...point(i,j+1,k));if(k<4)vertices.push(...p,...point(i,j,k+1));}
    const lattice=new THREE.BufferGeometry();lattice.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    state.scene.add(new THREE.LineSegments(lattice,new THREE.LineBasicMaterial({color:'#c9a34b',transparent:true,opacity:dark()?.17:.21,depthWrite:false})));
  }
  function drawTowers() {
    if (!state.towerGroup) return;
    state.towerGroup.children.forEach(child => {child.geometry.dispose(); child.material.dispose();});
    state.towerGroup.clear(); state.towers=[];
    state.visible.forEach(row => {
      const price=usdPerLitre(row); if(price==null)return;
      const height=2+Math.min(1,Math.max(0,(price-.5)/2.5))*28;
      const radius=row.scope==='country'?1.35:row.scope==='state'||row.scope==='prefecture'?1.05:.78;
      const selected=row===state.selected;
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius,height,6),new THREE.MeshPhongMaterial({color:priceColor(price),emissive:selected?'#f9bf67':'#101a12',emissiveIntensity:selected?.35:.08,shininess:38}));
      tower.position.set(row.lon*MAP_SCALE,MAP_Y+height/2+.3,-row.lat*MAP_SCALE);
      tower.userData.row=row;
      state.towerGroup.add(tower); state.towers.push(tower);
    });
  }
  function hit(event) {
    const box=state.renderer.domElement.getBoundingClientRect();
    state.pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    state.raycaster.setFromCamera(state.pointer,state.camera);
    return state.raycaster.intersectObjects(state.towers,false)[0]?.object?.userData.row || null;
  }
  function initScene() {
    if (!window.THREE || !geometry || !THREE.OrbitControls) throw new Error('The 3D renderer or map geometry did not load.');
    const container=$('#gas-map'),scene=new THREE.Scene(),background=dark()?'#06121c':'#657982';
    scene.background=new THREE.Color(background);scene.fog=new THREE.FogExp2(background,.0018);state.scene=scene;
    const camera=new THREE.PerspectiveCamera(34,1,.1,1400);camera.position.set(185,190,285);state.camera=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;container.appendChild(renderer.domElement);state.renderer=renderer;
    const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,MAP_Y+8,-20);controls.enableDamping=true;controls.dampingFactor=.06;controls.enablePan=false;controls.minDistance=120;controls.maxDistance=900;controls.minPolarAngle=.52;controls.maxPolarAngle=1.22;controls.update();state.controls=controls;
    scene.add(new THREE.HemisphereLight(dark()?'#c5ddd9':'#ffffff',dark()?'#0b1518':'#25383c',1.25));
    const light=new THREE.DirectionalLight('#ffe0a1',1.35);light.position.set(-90,180,80);scene.add(light);
    addAtmosphere();addWorld();state.towerGroup=new THREE.Group();scene.add(state.towerGroup);
    state.raycaster=new THREE.Raycaster();state.pointer=new THREE.Vector2();
    const resize=()=>{const box=container.getBoundingClientRect();renderer.setSize(Math.max(320,box.width),Math.max(430,box.height),false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();};
    new ResizeObserver(resize).observe(container);resize();
    renderer.domElement.addEventListener('pointermove',event=>{
      const row=hit(event),tip=$('#gas-tooltip');renderer.domElement.style.cursor=row?'pointer':'grab';
      if(!row){tip.hidden=true;return;}
      tip.innerHTML=`<strong>${esc(row.name)}</strong><span>${esc(money(rawPrice(row),row.currency,row.currency==='JPY'||row.currency==='INR'?0:2))} / ${esc(row.unit)} · ${esc(row.date)}</span>`;
      const box=renderer.domElement.getBoundingClientRect();tip.style.left=`${Math.min(box.width-245,event.clientX-box.left+15)}px`;tip.style.top=`${event.clientY-box.top+15}px`;tip.hidden=false;
    });
    renderer.domElement.addEventListener('pointerleave',()=>{$('#gas-tooltip').hidden=true;});
    renderer.domElement.addEventListener('click',event=>{const row=hit(event);if(row)selectRow(row);});
    const animate=()=>{state.animationId=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  }
  function init() {
    if (!data?.observations?.length) {$('#gas-map').innerHTML='<p class="gas-error">The price snapshot did not load. Reload the page and check the data asset.</p>';return;}
    $('#gas-fx-date').textContent=data.fx_date;
    const sources=[['AAA','aaa'],['EIA','eia'],['EU Oil Bulletin','eu'],['Japan ANRE','japan_original'],['ACCC','accc'],['MBIE','nz'],['PPAC','india'],['Taiwan CPC','taiwan'],['ECB FX','fx'],['CBC FX','taiwan_fx']];
    $('#gas-source-line').innerHTML=`Sources and methodology: ${sources.map(([name,key])=>`<a href="${esc(data.sources[key])}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`).join('')}<a href="${esc(data.sources.geonames)}" target="_blank" rel="noopener noreferrer">GeoNames coordinates ↗</a>`;
    $('#gas-fuel').addEventListener('change',event=>{state.fuel=event.target.value;filterRows();});
    $('#gas-region').addEventListener('change',event=>{state.region=event.target.value;filterRows();});
    $('#gas-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLocaleLowerCase();filterRows();});
    $('#gas-list').addEventListener('click',event=>{const button=event.target.closest('[data-index]');if(button)selectRow(data.observations[Number(button.dataset.index)],true);});
    $('#gas-reset').addEventListener('click',()=>{state.fuel='gasoline';state.region='All';state.search='';state.selected=null;$('#gas-fuel').value='gasoline';$('#gas-region').value='All';$('#gas-search').value='';if(state.camera){state.camera.position.set(185,190,285);state.controls.target.set(0,MAP_Y+8,-20);state.controls.update();}filterRows();});
    $('#theme-toggle').addEventListener('click',()=>{const next=dark()?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('war-maps-theme',next);}catch(error){} window.location.reload();});
    try{initScene();}catch(error){$('#gas-map').innerHTML=`<p class="gas-error">The 3D field could not start: ${esc(error.message)}. The searchable price list remains available below.</p>`;}
    filterRows();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
