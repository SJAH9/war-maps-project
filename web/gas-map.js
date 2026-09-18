(() => {
  const $ = selector => document.querySelector(selector);
  const data = window.GAS_PRICE_DATA;
  const geometry = window.WAR_MAPS_GEOMETRY;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const MAP_SCALE = .63, MAP_Y = 9, GALLON_LITRES = 3.785411784;
  const state = {fuel:'gasoline', region:'All', search:'', selected:null, nation:null, visible:[], worldVisible:[], priceScale:{min:0,max:1}, scene:null, renderer:null, camera:null, controls:null, plateRoot:null, worldLandGroup:null, reverseGroup:null, towerGroup:null, reverseTowerGroup:null, worldMeshes:[], reverseMeshes:[], towers:[], worldTowers:[], reverseTowers:[], countryAnchors:[], countryAnchorGroup:null, hoveredTower:null, raycaster:null, pointer:null, flipTarget:0, flipping:false, pointerDown:null};
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const rawPrice = row => row[state.fuel];
  const usdPerGallon = row => {
    const raw = rawPrice(row);
    if (raw == null) return null;
    const perEur = data.currency_per_eur[row.currency];
    if (!perEur) return null;
    const inUsd = raw * data.usd_per_eur / perEur;
    return row.unit === 'US gallon' ? inUsd : inUsd * GALLON_LITRES;
  };
  const usdPerLitre = row => { const gallon = usdPerGallon(row); return gallon == null ? null : gallon / GALLON_LITRES; };
  const money = (value, currency, digits = 2) => new Intl.NumberFormat('en-US', {style:'currency', currency, minimumFractionDigits:digits, maximumFractionDigits:digits}).format(value);
  const priceFraction = value => {
    const {min, max} = state.priceScale || {min: 0, max: 1};
    return Math.max(0, Math.min(1, (value - min) / Math.max(0.01, max - min)));
  };
  const priceColor = value => {
    const t = priceFraction(value);
    return t < .5
      ? new THREE.Color('#12f0c8').lerp(new THREE.Color('#ffd028'), t * 2)
      : new THREE.Color('#ffd028').lerp(new THREE.Color('#ff140c'), (t - .5) * 2);
  };
  const tone = value => {
    const t = priceFraction(value);
    return t < .5 ? `color-mix(in srgb, #12f0c8 ${Math.round((1-t*2)*100)}%, #ffd028)` : `color-mix(in srgb, #ffd028 ${Math.round((2-t*2)*100)}%, #ff140c)`;
  };
  function refreshPriceScale(rows) {
    const values = [];
    for (const row of rows) {
      const value = usdPerGallon(row);
      if (value != null) values.push(value);
    }
    if (!values.length) {
      state.priceScale = {min: 0, max: 1};
    } else {
      const min = Math.min(...values);
      const max = Math.max(...values);
      state.priceScale = {min, max: max <= min ? min + 0.01 : max};
    }
    const minEl = $('#gas-scale-min'), maxEl = $('#gas-scale-max');
    if (minEl) minEl.textContent = money(state.priceScale.min, 'USD');
    if (maxEl) maxEl.textContent = money(state.priceScale.max, 'USD');
  }
  const countryForRow = row => row.region === 'United States' ? 'United States of America'
    : row.source === 'japan' ? 'Japan' : row.source === 'india' ? 'India'
    : row.source === 'taiwan' ? 'Taiwan' : row.source === 'accc' ? 'Australia'
    : row.source === 'nz' ? 'New Zealand' : row.name;
  function filterRows() {
    state.worldVisible = data.observations.filter(row => rawPrice(row) != null &&
      (state.region === 'All' || (state.region === 'Islands' ? row.island : row.region === state.region)) &&
      (!state.search || `${row.name} ${row.region} ${row.scope}`.toLocaleLowerCase().includes(state.search)));
    state.visible = state.nation ? state.worldVisible.filter(row=>countryForRow(row)===state.nation) : state.worldVisible;
    $('#gas-count').textContent = state.visible.length.toLocaleString();
    $('#gas-list-count').textContent = `${state.visible.length} priced locations`;
    if (state.selected && !state.visible.includes(state.selected)) state.selected = null;
    refreshPriceScale(state.worldVisible);
    drawTowers();
    renderInspector();
    renderList();
  }
  function renderInspector() {
    const row = state.selected;
    $('#gas-kicker').textContent = row ? `${row.region} / ${row.scope}` : state.nation ? `Nation view / ${data.snapshot}` : `Snapshot ${data.snapshot}`;
    $('#gas-selected').textContent = row ? row.name : state.nation || 'A geography of pump prices';
    $('#gas-selected-sub').textContent = row ? row.detail : state.nation ? 'Click a price tower to inspect it. Click outside the nation to turn the map back.' : 'Choose a tower or a location below.';
    if (!row) {
      const count = state.visible.length;
      const dated = [...new Set(state.visible.map(item => item.date))].sort();
      $('#gas-facts').innerHTML = `<div><span>Visible observations</span><strong>${count}</strong></div><div><span>Price dates</span><strong>${dated[0] || '—'}–${dated.at(-1) || '—'}</strong></div><div><span>Fuel</span><strong>${state.fuel === 'gasoline' ? 'Pump gasoline' : 'Diesel'}</strong></div><div><span>Display unit</span><strong>USD / U.S. gallon</strong></div>`;
      return;
    }
    const perL = usdPerLitre(row);
    const cells = [
      ['Displayed price', `${money(usdPerGallon(row), 'USD')} / U.S. gallon`],
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
      const value = usdPerGallon(row);
      return `<button type="button" data-index="${index}" aria-current="${row === state.selected}"><i style="background:${tone(value)}"></i><span><b>${esc(row.name)}</b><small>${esc(row.scope)} · ${esc(row.date)}</small></span><strong>${esc(money(value,'USD'))}</strong></button>`;
    }).join('') : `<p class="gas-list-empty">${state.nation ? 'No priced observations are available for this nation and filter. Click outside the nation to return to the world.' : 'No priced observations match these controls. Try another region, fuel, or search.'}</p>`;
  }
  function selectRow(row) {
    const country=countryForRow(row);
    if (state.nation !== country && state.worldMeshes.some(mesh => mesh.userData.country === country)) {
      flipToNation(country, row);
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
    $('#gas-view-name').textContent=nationLabel;$('#gas-nation-name').textContent=nationLabel;$('#gas-nation-name').hidden=false;$('#gas-back').hidden=false;
    $('#gas-stage-hint').innerHTML='CLICK OUTSIDE THE NATION TO RETURN <b>·</b> SELECT A TOWER';
    $('#gas-tooltip').hidden=true;
    filterRows();
  }
  function flipToWorld() {
    if(!state.nation||state.flipping)return;
    state.nation=null;state.selected=null;state.flipTarget=0;state.flipping=true;state.controls.enabled=false;
    $('#gas-view-name').textContent='WORLD PRICE FIELD';$('#gas-nation-name').textContent='';$('#gas-nation-name').hidden=true;$('#gas-back').hidden=true;
    $('#gas-stage-hint').innerHTML='CLICK A NATION TO TURN THE MAP <b>·</b> DRAG TO ORBIT';
    $('#gas-tooltip').hidden=true;
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
    const layer=$('#gas-price-labels'); if(layer) layer.innerHTML='';
    const makeTower=(row,reverse=false)=>{
      const price=usdPerGallon(row); if(price==null)return;
      const height=.55+priceFraction(price)*52;
      const radius=row.scope==='country'?1.35:row.scope==='state'||row.scope==='prefecture'?1.05:.78;
      const selected=row===state.selected && reverse===Boolean(state.nation);
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius,height,6),new THREE.MeshPhongMaterial({color:priceColor(price),emissive:selected?'#f9bf67':'#101a12',emissiveIntensity:selected?.35:.08,shininess:38}));
      if(reverse){const p=state.nationProjection;tower.position.set((p.unwrap(row.lon)-p.centerX)*p.scale,-1.76-height/2-.3,(row.lat-p.centerY)*p.scale);}
      else tower.position.set(row.lon*MAP_SCALE,height/2+.3,-row.lat*MAP_SCALE);
      tower.userData.row=row; tower.userData.towerHeight=height;
      if(reverse===Boolean(state.nation)){
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
          map: canvasTexture(money(price,'USD'), {
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
        sprite.userData.isPriceSprite=true;
        tower.add(sprite);
        tower.userData.priceSprite=sprite;
        tower.userData.spriteW=sw;
        tower.userData.spriteH=sh;
      }
      (reverse?state.reverseTowerGroup:state.towerGroup).add(tower);
      (reverse?state.reverseTowers:state.worldTowers).push(tower);
    };
    state.worldVisible.forEach(row=>makeTower(row));
    if(state.nation&&state.reverseTowerGroup)state.visible.forEach(row=>makeTower(row,true));
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
    const container=$('#gas-map'),scene=new THREE.Scene(),background=dark()?'#06121c':'#657982';
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
      const object=state.flipping?null:hit(event),row=object?.userData.row,country=object?.userData.country,tip=$('#gas-tooltip');
      state.hoveredTower=row?object:null;
      renderer.domElement.style.cursor=state.flipping?'wait':row||(!state.nation&&country)||state.nation?'pointer':'grab';
      if(!object){tip.hidden=true;return;}
      if(row){
        tip.innerHTML=`<strong>${esc(money(usdPerGallon(row),'USD'))}</strong><em>${esc(row.name)}</em><span>USD / U.S. gallon · ${esc(row.date)}</span>`;
      }else{
        tip.innerHTML=`<em>${esc(country)}</em><span>${state.nation?'Click outside this outline to return':'Click to turn the map over'}</span>`;
      }
      const box=renderer.domElement.getBoundingClientRect();
      const maxLeft=Math.max(8,box.width-Math.min(460,box.width*.86)-8);
      tip.style.left=`${Math.min(maxLeft,event.clientX-box.left+18)}px`;
      tip.style.top=`${Math.max(8,event.clientY-box.top-12)}px`;
      tip.hidden=false;
    });
    renderer.domElement.addEventListener('pointerleave',()=>{state.hoveredTower=null;$('#gas-tooltip').hidden=true;});
    renderer.domElement.addEventListener('click',event=>{
      if(state.flipping||!state.pointerDown||Math.hypot(event.clientX-state.pointerDown.x,event.clientY-state.pointerDown.y)>5)return;
      const object=hit(event),row=object?.userData.row,country=object?.userData.country;
      if(state.nation){if(row)selectRow(row);else if(!country)flipToWorld();}
      else if(row)flipToNation(countryForRow(row),row);
      else if(country)flipToNation(country);
    });
    const updatePriceSprites=()=>{
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
      updatePriceSprites();
      controls.update();renderer.render(scene,camera);
    };animate();
  }
  function init() {
    if (!data?.observations?.length) {$('#gas-map').innerHTML='<p class="gas-error">The price snapshot did not load. Reload the page and check the data asset.</p>';return;}
    $('#gas-fx-date').textContent=data.fx_date;
    const sources=[['AAA','aaa'],['EIA','eia'],['EU Oil Bulletin','eu'],['Japan ANRE','japan_original'],['ACCC','accc'],['MBIE','nz'],['PPAC','india'],['Taiwan CPC','taiwan'],['ECB FX','fx'],['CBC FX','taiwan_fx']];
    $('#gas-source-line').innerHTML=`Sources and methodology: ${sources.map(([name,key])=>`<a href="${esc(data.sources[key])}" target="_blank" rel="noopener noreferrer">${esc(name)} ↗</a>`).join('')}<a href="${esc(data.sources.geonames)}" target="_blank" rel="noopener noreferrer">GeoNames coordinates ↗</a>`;
    $('#gas-fuel').addEventListener('change',event=>{state.fuel=event.target.value;filterRows();});
    $('#gas-region').addEventListener('change',event=>{if(state.nation)flipToWorld();state.region=event.target.value;filterRows();});
    $('#gas-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLocaleLowerCase();filterRows();});
    $('#gas-list').addEventListener('click',event=>{const button=event.target.closest('[data-index]');if(button)selectRow(data.observations[Number(button.dataset.index)]);});
    $('#gas-back').addEventListener('click',flipToWorld);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.nation)flipToWorld();});
    $('#gas-reset').addEventListener('click',()=>{if(state.nation)flipToWorld();state.fuel='gasoline';state.region='All';state.search='';state.selected=null;$('#gas-fuel').value='gasoline';$('#gas-region').value='All';$('#gas-search').value='';if(state.camera){state.camera.position.set(185,190,285);state.controls.target.set(0,MAP_Y+8,-20);state.controls.update();}filterRows();});
    $('#theme-toggle').addEventListener('click',()=>{const next=dark()?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('war-maps-theme',next);}catch(error){} window.location.reload();});
    try{initScene();}catch(error){$('#gas-map').innerHTML=`<p class="gas-error">The 3D field could not start: ${esc(error.message)}. The searchable price list remains available below.</p>`;}
    filterRows();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
