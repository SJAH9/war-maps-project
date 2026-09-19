(() => {
  const $ = selector => document.querySelector(selector);
  const data = window.CIVILIAN_CASUALTY_DATA;
  const geometry = window.WAR_MAPS_GEOMETRY;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const MAP_SCALE = .63, MAP_Y = 9;
  const state = {search:'', selected:null, nation:null, visible:[], worldVisible:[], priceScale:{min:0,max:1}, year:null, playTimer:null, playIndex:0, scene:null, renderer:null, camera:null, controls:null, plateRoot:null, worldLandGroup:null, reverseGroup:null, towerGroup:null, reverseTowerGroup:null, worldMeshes:[], reverseMeshes:[], towers:[], worldTowers:[], reverseTowers:[], countryAnchors:[], countryAnchorGroup:null, hoveredTower:null, raycaster:null, pointer:null, flipTarget:0, flipping:false, pointerDown:null};
  const playYears = () => data.coverage.play_years || [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  const deathsThrough = (row, year) => {
    if (year == null) return row.civilians || 0;
    if (row.in_ucdp === false) return year >= 2023 ? row.civilians : 0;
    let total = 0;
    for (const item of row.years || []) {
      const y = item[0], n = item[1];
      if (y <= year) total += n;
    }
    return total;
  };
  const worldThrough = year => (data.countries || []).reduce((sum, row) => sum + deathsThrough(row, year), 0);
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const formatCount = value => Number(value || 0).toLocaleString('en-US');
  const compact = value => {
    const n = Number(value || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
    return String(n);
  };
  const priceFraction = value => {
    const {min, max} = state.priceScale || {min: 0, max: 1};
    return Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  };
  const priceColor = value => {
    const t = priceFraction(value);
    return t < .5
      ? new THREE.Color('#e4d3b0').lerp(new THREE.Color('#d37a3a'), t * 2)
      : new THREE.Color('#d37a3a').lerp(new THREE.Color('#8a1814'), (t - .5) * 2);
  };
  const tone = value => {
    const t = priceFraction(value);
    return t < .5 ? `color-mix(in srgb, #e4d3b0 ${Math.round((1-t*2)*100)}%, #d37a3a)` : `color-mix(in srgb, #d37a3a ${Math.round((2-t*2)*100)}%, #8a1814)`;
  };
  function refreshScale(rows) {
    const values = rows.map(row => row.civilians).filter(value => value > 0);
    if (!values.length) state.priceScale = {min: 0, max: 1};
    else {
      const min = Math.min(...values), max = Math.max(...values);
      state.priceScale = {min, max: max <= min ? min + 1 : max};
    }
    const minEl = $('#civ-scale-min'), maxEl = $('#civ-scale-max');
    if (minEl) minEl.textContent = formatCount(state.priceScale.min);
    if (maxEl) maxEl.textContent = formatCount(state.priceScale.max);
  }
  function setYearLabel() {
    const el = $('#civ-year');
    if (el) el.textContent = state.year == null ? 'All years' : `Through ${state.year}`;
  }
  function filterRows() {
    const year = state.year;
    state.worldVisible = data.countries.filter(row => deathsThrough(row, year) > 0 &&
      (!state.search || `${row.name} ${row.admin} ${row.region}`.toLocaleLowerCase().includes(state.search)));
    state.visible = state.nation ? state.worldVisible.filter(row => row.admin === state.nation) : state.worldVisible;
    $('#civ-count').textContent = state.visible.length.toLocaleString();
    $('#civ-list-count').textContent = `${state.visible.length} UCDP countries`;
    if (state.selected && !state.visible.includes(state.selected) && state.selected.in_ucdp !== false) state.selected = null;
    refreshScale(data.countries.filter(row => row.civilians > 0));
    setYearLabel();
    if (!state.nation) $('#civ-view-name').textContent = state.year == null ? 'WORLD CIVILIAN DEATHS' : `THROUGH ${state.year}`;
    drawTowers();
    renderInspector();
    renderList();
  }
  function stopPlay() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
    const btn = $('#civ-play');
    if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Play 2015–2024'; }
  }
  function playStep() {
    const years = playYears();
    state.year = years[state.playIndex % years.length];
    state.playIndex += 1;
    filterRows();
  }
  function togglePlay() {
    if (state.playTimer) {
      stopPlay();
      return;
    }
    const btn = $('#civ-play');
    if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Pause'; }
    state.playIndex = 0;
    playStep();
    state.playTimer = setInterval(playStep, 1100);
  }
  function renderInspector() {
    const row = state.selected;
    if (row && row.in_ucdp === false) {
      $('#civ-kicker').textContent = 'Not in UCDP GED';
      $('#civ-selected').textContent = row.place;
      $('#civ-selected-sub').textContent = row.note;
      $('#civ-facts').innerHTML = [
        ['Reported figure', formatCount(row.civilians)],
        ['What is counted', row.metric],
        ['Source', `<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.source)} ↗</a>`],
        ['As of', row.as_of],
        ['Period', row.period],
        ['UCDP datasets', 'Excluded. Shown beside GED, not added to the world total.'],
      ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${label === 'Source' ? value : esc(value)}</strong></div>`).join('');
      return;
    }
    const through = state.year == null ? data.world_total : worldThrough(state.year);
    $('#civ-kicker').textContent = row ? `${row.region} · UCDP GED` : state.nation ? `Nation view / ${data.snapshot}` : `World total ${formatCount(through)}${state.year ? ` through ${state.year}` : ''}`;
    $('#civ-selected').textContent = row ? row.name : state.nation || 'Reported civilian deaths';
    $('#civ-selected-sub').textContent = row ? `${formatCount(deathsThrough(row, state.year))} civilian deaths coded in this territory${state.year ? ` through ${state.year}` : ''}` : state.nation ? 'Click the tower to inspect the national total. Click outside the nation to return.' : 'Choose a tower or a country below.';
    if (!row) {
      const external = data.external || [];
    const extra = external.map(item => `<div><span>${esc(item.place)} · ${esc(item.source_short)} (not UCDP)</span><strong>${esc(formatCount(item.civilians))}</strong></div>`).join('');
    $('#civ-facts').innerHTML = `<div><span>UCDP world total${state.year ? ` through ${state.year}` : ''}</span><strong>${esc(formatCount(through))}</strong></div><div><span>UCDP countries mapped</span><strong>${esc(formatCount(data.country_count))}</strong></div><div><span>GED years</span><strong>${data.coverage.ged_years[0]}–${data.coverage.ged_years[1]}</strong></div><div><span>Candidate through</span><strong>${esc(data.coverage.candidate_through)}</strong></div>${extra}`;
      return;
    }
    const years = [...(row.years || [])].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([year, deaths]) => `${year}: ${formatCount(deaths)}`).join(' · ') || '—';
    $('#civ-facts').innerHTML = [
      ['Civilian deaths', formatCount(deathsThrough(row, state.year))],
      ['Events', formatCount(row.events)],
      ['Events with civilian deaths', formatCount(row.events_with_civilians)],
      ['Years observed', `${row.year_start}–${row.year_end}`],
      ['2026 candidate civilians', formatCount(row.candidate_civilians)],
      ['Highest years', years],
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }
  function renderList() {
    const sorted = [...state.visible].sort((a, b) => deathsThrough(b, state.year) - deathsThrough(a, state.year) || a.name.localeCompare(b.name));
    const ucdp = sorted.length ? sorted.map(row => {
      const index = data.countries.indexOf(row);
      const value = deathsThrough(row, state.year);
      return `<button type="button" data-index="${index}" aria-current="${row === state.selected}"><i style="background:${tone(value)}"></i><span><b>${esc(row.name)}</b><small>${esc(row.region)} · ${row.year_start}–${row.year_end} · UCDP GED</small></span><strong>${esc(formatCount(value))}</strong></button>`;
    }).join('') : `<p class="gas-list-empty">${state.nation ? 'No UCDP civilian-death record is mapped for this nation. Click outside the nation to return to the world.' : 'No countries match this search.'}</p>`;
    const showExternal = state.year == null && (!state.nation || state.nation === 'Palestine' || state.nation === 'Israel');
    const external = showExternal ? (data.external || []).map((row, index) =>
      `<button type="button" data-external="${index}" aria-current="${row === state.selected}"><i style="background:#7ec8e3"></i><span><b>${esc(row.place)}</b><small>NOT IN UCDP · ${esc(row.source_short)} · ${esc(row.as_of)}</small></span><strong>${esc(formatCount(row.civilians))}</strong></button>`
    ).join('') : '';
    $('#civ-list').innerHTML = (external ? `<p class="gas-list-empty">Not part of the UCDP datasets</p>${external}` : '') + ucdp;
  }
  function selectRow(row) {
    if (state.nation !== row.admin && state.worldMeshes.some(mesh => mesh.userData.country === row.admin)) {
      flipToNation(row.admin, row);
      return;
    }
    state.selected = row;
    renderInspector(); renderList(); drawTowers();
  }
  function makeShape(rings, project = ([lon,lat]) => [lon*MAP_SCALE,lat*MAP_SCALE]) {
    if (!rings?.[0]?.length) return null;
    const shape = new THREE.Shape();
    rings[0].forEach((point, index) => {const [x,y]=project(point);index ? shape.lineTo(x,y) : shape.moveTo(x,y);});
    shape.closePath();
    rings.slice(1).forEach(ring => {
      const hole = new THREE.Path();
      ring.forEach((point, index) => {const [x,y]=project(point);index ? hole.lineTo(x,y) : hole.moveTo(x,y);});
      hole.closePath(); shape.holes.push(hole);
    });
    return shape;
  }
  function addWorld() {
    const ocean = new THREE.Mesh(new THREE.BoxGeometry(232,1.2,116),new THREE.MeshPhongMaterial({color:dark()?'#171f1c':'#929c8d',shininess:16}));
    ocean.position.y=-.82; state.plateRoot.add(ocean);
    state.worldLandGroup=new THREE.Group();state.plateRoot.add(state.worldLandGroup);
    geometry.features.forEach(feature => {
      const country=feature.properties.ADMIN;
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      polygons.forEach(rings => {
        const shape=makeShape(rings); if(!shape)return;
        const geo=new THREE.ShapeGeometry(shape,1); geo.rotateX(-Math.PI/2);
        const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:dark()?'#5e6941':'#c2bc8e',side:THREE.DoubleSide,shininess:5}));
        mesh.userData.country=country;state.worldLandGroup.add(mesh);state.worldMeshes.push(mesh);
        const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo,8),new THREE.LineBasicMaterial({color:dark()?'#bcb276':'#5b5f45',transparent:true,opacity:.5}));
        edge.position.y=.08; state.worldLandGroup.add(edge);
      });
    });
    addCountryLabels();
  }
  function canvasTexture(text, opts) {
    const w = opts.w, h = opts.h;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.font = opts.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.strokeWidth || 6;
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(text, w / 2, h / 2);
    }
    ctx.fillStyle = opts.fill;
    ctx.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  function addCountryLabels() {
    if (!geometry?.features || !state.plateRoot) return;
    if (state.countryAnchorGroup) {
      state.countryAnchorGroup.traverse(object => {
        object.geometry?.dispose?.();
        if (object.material) {
          object.material.map?.dispose?.();
          object.material.dispose();
        }
      });
      state.plateRoot.remove(state.countryAnchorGroup);
    }
    const group = new THREE.Group();
    state.countryAnchorGroup = group;
    state.plateRoot.add(group);
    state.countryAnchors = [];
    geometry.features.forEach(feature => {
      const props = feature.properties || {};
      const rank = Number(props.LABELRANK) || 6;
      if (rank > 2) return;
      const lon = Number(props.LABEL_X), lat = Number(props.LABEL_Y);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (props.ADMIN === 'Antarctica') return;
      const name = String(props.NAME || props.ADMIN).toUpperCase();
      const tex = canvasTexture(name, {
        w: 512, h: 96,
        font: '600 40px Georgia, serif',
        fill: 'rgba(214,222,204,0.95)',
      });
      const width = Math.min(20, 1.05 * name.length);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * 96 / 512),
        new THREE.MeshBasicMaterial({map: tex, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide})
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(lon * MAP_SCALE, 1.05, -lat * MAP_SCALE);
      mesh.renderOrder = 2;
      mesh.raycast = () => {};
      group.add(mesh);
      state.countryAnchors.push(mesh);
    });
  }
  function addNationReverse(country) {
    if (state.reverseGroup) {
      state.reverseGroup.traverse(object=>{object.geometry?.dispose?.();object.material?.dispose?.();});
      state.plateRoot.remove(state.reverseGroup);
    }
    const feature=geometry.features.find(item=>item.properties.ADMIN===country);
    if(!feature)return;
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
    const anchor=Number(feature.properties.LABEL_X)||0;
    const unwrap=lon=>{let delta=lon-anchor;while(delta>180)delta-=360;while(delta<-180)delta+=360;return anchor+delta;};
    const points=polygons.flatMap(rings=>rings[0]||[]);
    const xs=points.map(([lon])=>unwrap(lon)),ys=points.map(([,lat])=>lat);
    const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
    const centerX=(bounds.minX+bounds.maxX)/2,centerY=(bounds.minY+bounds.maxY)/2;
    const scale=Math.min(170/Math.max(1,bounds.maxX-bounds.minX),88/Math.max(1,bounds.maxY-bounds.minY),24);
    const project=([lon,lat])=>[(unwrap(lon)-centerX)*scale,(lat-centerY)*scale];
    const reverse=new THREE.Group();state.reverseGroup=reverse;state.plateRoot.add(reverse);
    state.reverseMeshes=[];
    polygons.forEach(rings=>{
      const shape=makeShape(rings,project);if(!shape)return;
      const geo=new THREE.ShapeGeometry(shape,1);geo.rotateX(Math.PI/2);
      const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:dark()?'#b7ae79':'#e0d39a',side:THREE.DoubleSide,shininess:15,emissive:dark()?'#302a13':'#13130c',emissiveIntensity:.12}));
      mesh.position.y=-1.76;mesh.userData.country=country;reverse.add(mesh);state.reverseMeshes.push(mesh);
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo,8),new THREE.LineBasicMaterial({color:'#f9db7b',transparent:true,opacity:.9}));
      edge.position.y=-1.8;reverse.add(edge);
    });
    state.nationProjection={centerX,centerY,scale,unwrap};
    state.reverseTowerGroup=new THREE.Group();reverse.add(state.reverseTowerGroup);
  }
  function flipToNation(country,selected=null) {
    if(state.flipping||!state.plateRoot)return;
    if(!geometry.features.some(item=>item.properties.ADMIN===country)){
      if(selected){state.selected=selected;renderInspector();renderList();drawTowers();}
      return;
    }
    addNationReverse(country);
    state.nation=country;state.selected=selected;
    state.flipTarget=Math.PI;state.flipping=true;state.controls.enabled=false;
    const nationLabel=(geometry.features.find(item=>item.properties.ADMIN===country)?.properties.NAME||country).toUpperCase();
    $('#civ-view-name').textContent=nationLabel;$('#civ-nation-name').textContent=nationLabel;$('#civ-nation-name').hidden=false;$('#civ-back').hidden=false;
    $('#civ-stage-hint').innerHTML='CLICK OUTSIDE THE NATION TO RETURN <b>·</b> SELECT A TOWER';
    $('#civ-tooltip').hidden=true;
    filterRows();
  }
  function flipToWorld() {
    if(!state.nation||state.flipping)return;
    state.nation=null;state.selected=null;state.flipTarget=0;state.flipping=true;state.controls.enabled=false;
    $('#civ-view-name').textContent='WORLD CIVILIAN DEATHS';$('#civ-nation-name').textContent='';$('#civ-nation-name').hidden=true;$('#civ-back').hidden=true;
    $('#civ-stage-hint').innerHTML='CLICK A NATION TO TURN THE MAP <b>·</b> DRAG TO ORBIT';
    $('#civ-tooltip').hidden=true;
    filterRows();
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
    const clear=group=>{
      if(!group)return;
      group.traverse(child=>{
        child.geometry?.dispose?.();
        if(child.material){
          child.material.map?.dispose?.();
          child.material.dispose();
        }
      });
      group.clear();
    };
    clear(state.towerGroup);if(state.nation)clear(state.reverseTowerGroup);state.worldTowers=[];if(state.nation)state.reverseTowers=[];
    const makeTower=(row,reverse=false)=>{
      const value=deathsThrough(row, state.year); if(!value)return;
      const height=.55+priceFraction(value)*52;
      const external=row.in_ucdp===false;
      const radius=external?1.45:1.2;
      const selected=row===state.selected && reverse===Boolean(state.nation);
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius,height,6),new THREE.MeshPhongMaterial({color:external?'#5eb3d4':priceColor(value),emissive:selected?'#f9bf67':external?'#163048':'#101a12',emissiveIntensity:selected?0.35:(external?0.22:0.08),shininess:38}));
      if(reverse){const p=state.nationProjection;tower.position.set((p.unwrap(row.lon)-p.centerX)*p.scale,-1.76-height/2-.3,(row.lat-p.centerY)*p.scale);}
      else tower.position.set(row.lon*MAP_SCALE,height/2+.3,-row.lat*MAP_SCALE);
      tower.userData.row=row; tower.userData.towerHeight=height;
      if(reverse===Boolean(state.nation)){
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
          map: canvasTexture(external ? compact(value)+'*' : compact(value), {
            w: 256, h: 96,
            font: '700 42px ui-sans-serif, system-ui, sans-serif',
            fill: selected ? '#ffe08a' : '#fff6d8',
            stroke: 'rgba(0,0,0,0.88)',
            strokeWidth: 8,
          }),
          transparent: true,
          depthWrite: false,
        }));
        const sw=3.4, sh=1.25;
        sprite.scale.set(sw, sh, 1);
        sprite.position.set(0, reverse ? -(height/2+.95) : height/2+.95, 0);
        tower.add(sprite);
        tower.userData.priceSprite=sprite;
        tower.userData.spriteW=sw;
        tower.userData.spriteH=sh;
      }
      (reverse?state.reverseTowerGroup:state.towerGroup).add(tower);
      (reverse?state.reverseTowers:state.worldTowers).push(tower);
    };
    state.worldVisible.forEach(row=>makeTower(row));
    const externals=(data.external||[]).filter(row=>!state.search||`${row.place} ${row.source_short}`.toLocaleLowerCase().includes(state.search));
    const showExternal=state.year==null&&(!state.nation||state.nation==='Palestine'||state.nation==='Israel');
    if(showExternal) externals.forEach(row=>makeTower(row,false));
    if(state.nation&&state.reverseTowerGroup){
      state.visible.forEach(row=>makeTower(row,true));
      if(state.nation==='Palestine') externals.forEach(row=>makeTower(row,true));
    }
    state.towers=state.nation?state.reverseTowers:state.worldTowers;
  }
  function hit(event) {
    const box=state.renderer.domElement.getBoundingClientRect();
    state.pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    state.raycaster.setFromCamera(state.pointer,state.camera);
    const targets=state.nation?[...state.reverseTowers,...state.reverseMeshes]:[...state.worldTowers,...state.worldMeshes];
    return state.raycaster.intersectObjects(targets,false)[0]?.object || null;
  }
  function initScene() {
    if (!window.THREE || !geometry || !THREE.OrbitControls) throw new Error('The 3D renderer or map geometry did not load.');
    const container=$('#civ-map'),scene=new THREE.Scene(),background=dark()?'#06121c':'#657982';
    scene.background=new THREE.Color(background);scene.fog=new THREE.FogExp2(background,.0018);state.scene=scene;
    const camera=new THREE.PerspectiveCamera(34,1,.1,1400);camera.position.set(185,190,285);state.camera=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;container.appendChild(renderer.domElement);state.renderer=renderer;
    const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,MAP_Y+8,-20);controls.enableDamping=true;controls.dampingFactor=.06;controls.enablePan=false;controls.minDistance=120;controls.maxDistance=900;controls.minPolarAngle=.52;controls.maxPolarAngle=1.22;controls.update();state.controls=controls;
    scene.add(new THREE.HemisphereLight(dark()?'#c5ddd9':'#ffffff',dark()?'#0b1518':'#25383c',1.25));
    const light=new THREE.DirectionalLight('#ffe0a1',1.35);light.position.set(-90,180,80);scene.add(light);
    addAtmosphere();state.plateRoot=new THREE.Group();state.plateRoot.position.y=MAP_Y;scene.add(state.plateRoot);addWorld();state.towerGroup=new THREE.Group();state.plateRoot.add(state.towerGroup);
    state.raycaster=new THREE.Raycaster();state.pointer=new THREE.Vector2();
    const resize=()=>{const box=container.getBoundingClientRect();renderer.setSize(Math.max(320,box.width),Math.max(430,box.height),false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();};
    new ResizeObserver(resize).observe(container);resize();
    renderer.domElement.addEventListener('pointerdown',event=>{state.pointerDown={x:event.clientX,y:event.clientY};});
    renderer.domElement.addEventListener('pointermove',event=>{
      const object=state.flipping?null:hit(event),row=object?.userData.row,country=object?.userData.country,tip=$('#civ-tooltip');
      state.hoveredTower=row?object:null;
      renderer.domElement.style.cursor=state.flipping?'wait':row||(!state.nation&&country)||state.nation?'pointer':'grab';
      if(!object){tip.hidden=true;return;}
      if(row){
        tip.innerHTML=row.in_ucdp===false
          ? `<strong>${esc(formatCount(row.civilians))}</strong><em>${esc(row.place)} · ${esc(row.source_short)}</em><span>NOT IN UCDP · ${esc(row.metric)} · ${esc(row.as_of)}</span>`
          : `<strong>${esc(formatCount(deathsThrough(row, state.year)))}</strong><em>${esc(row.name)}</em><span>UCDP GED civilian deaths · ${state.year ? `through ${state.year}` : `${row.year_start}–${row.year_end}`}</span>`;
      }else{
        tip.innerHTML=`<em>${esc(country)}</em><span>${state.nation?'Click outside this outline to return':'Click to turn the map over'}</span>`;
      }
      const box=renderer.domElement.getBoundingClientRect();
      const maxLeft=Math.max(8,box.width-Math.min(460,box.width*.86)-8);
      tip.style.left=`${Math.min(maxLeft,event.clientX-box.left+18)}px`;
      tip.style.top=`${Math.max(8,event.clientY-box.top-12)}px`;
      tip.hidden=false;
    });
    renderer.domElement.addEventListener('pointerleave',()=>{state.hoveredTower=null;$('#civ-tooltip').hidden=true;});
    renderer.domElement.addEventListener('click',event=>{
      if(state.flipping||!state.pointerDown||Math.hypot(event.clientX-state.pointerDown.x,event.clientY-state.pointerDown.y)>5)return;
      const object=hit(event),row=object?.userData.row,country=object?.userData.country;
      if(state.nation){if(row)selectRow(row);else if(!country)flipToWorld();}
      else if(row)flipToNation(row.admin,row);
      else if(country)flipToNation(country);
    });
    const updateSprites=()=>{
      if(state.countryAnchorGroup) state.countryAnchorGroup.visible=!state.nation;
      (state.towers||[]).forEach(tower=>{
        const sprite=tower.userData.priceSprite; if(!sprite)return;
        const hot=tower===state.hoveredTower||tower.userData.row===state.selected;
        const s=hot?2.4:1;
        sprite.scale.set((tower.userData.spriteW||3.4)*s,(tower.userData.spriteH||1.25)*s,1);
      });
    };
    const animate=()=>{
      state.animationId=requestAnimationFrame(animate);
      if(state.flipping){const delta=state.flipTarget-state.plateRoot.rotation.x;state.plateRoot.rotation.x+=delta*.15;if(Math.abs(delta)<.004){state.plateRoot.rotation.x=state.flipTarget;state.flipping=false;controls.enabled=true;}}
      updateSprites();
      controls.update();renderer.render(scene,camera);
    };animate();
  }
  function init() {
    if (!data?.countries?.length) {$('#civ-map').innerHTML='<p class="gas-error">The civilian-death snapshot did not load. Reload the page and check the data asset.</p>';return;}
    $('#civ-source-line').innerHTML=`Sources: <a href="${esc(data.sources.ged)}" target="_blank" rel="noopener noreferrer">UCDP GED ↗</a> ${esc(data.sources.citation)} Coverage: ${data.coverage.ged_years[0]}–${data.coverage.ged_years[1]}, plus candidate events through ${esc(data.coverage.candidate_through)}. ${esc(data.coverage.note)}`;
    $('#civ-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLocaleLowerCase();filterRows();});
    $('#civ-play').addEventListener('click',togglePlay);
    $('#civ-list').addEventListener('click',event=>{
      const external=event.target.closest('[data-external]');
      if(external){selectRow((data.external||[])[Number(external.dataset.external)]);return;}
      const button=event.target.closest('[data-index]');
      if(button)selectRow(data.countries[Number(button.dataset.index)]);
    });
    $('#civ-back').addEventListener('click',flipToWorld);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.nation)flipToWorld();});
    $('#civ-reset').addEventListener('click',()=>{stopPlay();if(state.nation)flipToWorld();state.search='';state.selected=null;state.year=null;$('#civ-search').value='';if(state.camera){state.camera.position.set(185,190,285);state.controls.target.set(0,MAP_Y+8,-20);state.controls.update();}filterRows();});
    $('#theme-toggle').addEventListener('click',()=>{const next=dark()?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('war-maps-theme',next);}catch(error){} window.location.reload();});
    try{initScene();}catch(error){$('#civ-map').innerHTML=`<p class="gas-error">The 3D field could not start: ${esc(error.message)}. The searchable country list remains available.</p>`;}
    filterRows();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
