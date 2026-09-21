(() => {
  const $ = selector => document.querySelector(selector);
  const data = window.CIVILIAN_CASUALTY_DATA;
  const health = window.LIFE_DEATH_METRICS;
  const life = window.LIFE_EXPECTANCY_DATA;
  const geometry = window.WAR_MAPS_GEOMETRY;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const MAP_SCALE = .63, MAP_Y = 9, MAX_TOWER_HEIGHT = 13;
  const sourceStart = Math.min(Number(data?.coverage?.ged_years?.[0] || 1989),Number(life?.coverage?.start_year || 1989));
  const sourceEnd = Math.max(Number(data?.coverage?.ged_years?.[1] || 2024),Number(String(data?.coverage?.candidate_through || '').slice(0,4) || 0));
  const defaultEnd = sourceEnd, defaultStart = Math.max(sourceStart,defaultEnd - 9);
  const aliases={'Bahamas':'The Bahamas','Bolivia (Plurinational State of)':'Bolivia','Brunei Darussalam':'Brunei','Cabo Verde':'Cape Verde','Congo':'Republic of the Congo',"Côte d'Ivoire":'Ivory Coast',"Democratic People's Republic of Korea":'North Korea','Eswatini':'eSwatini','Iran (Islamic Republic of)':'Iran',"Lao People's Democratic Republic":'Laos','Republic of Korea':'South Korea','Republic of Moldova':'Moldova','Russian Federation':'Russia','Serbia':'Republic of Serbia','Syrian Arab Republic':'Syria','Timor-Leste':'East Timor','Türkiye':'Turkey','United States':'United States of America','Venezuela (Bolivarian Republic of)':'Venezuela','Viet Nam':'Vietnam'};
  const geometryByCode=new Map(),featureByAdmin=new Map();
  (geometry?.features||[]).forEach(feature=>{const props=feature.properties||{};featureByAdmin.set(props.ADMIN,feature);[props.ISO_A3,props.ADM0_A3,props.WB_A3,props.GU_A3].filter(code=>code&&code!=='-99').forEach(code=>geometryByCode.set(code,props.ADMIN));});
  const mortalityByAdmin=new Map((health?.locations||[]).map(location=>[aliases[location.name]||location.name,new Map((location.mortality||[]).map(row=>[row[0],row[1]]))]));
  const lifeByAdmin=new Map((life?.locations||[]).map(location=>[geometryByCode.get(location.iso3)||aliases[location.name]||location.name,new Map((location.life_expectancy||[]).map(row=>[row[0],row[1]]))]));
  const state = {search:'', selected:null, nation:null, reverseCountries:new Set(), visible:[], worldVisible:[], priceScale:{min:0,max:1}, healthScale:{mortality:{min:0,max:1},lifeExpectancy:{min:0,max:1}}, activeHealth:new Set(), startYear:defaultStart, endYear:defaultEnd, playTimer:null, playIndex:0, scene:null, renderer:null, camera:null, controls:null, plateRoot:null, worldLandGroup:null, reverseGroup:null, towerGroup:null, reverseTowerGroup:null, worldMeshes:[], reverseMeshes:[], towers:[], worldTowers:[], reverseTowers:[], countryAnchors:[], countryAnchorGroup:null, hoveredTower:null, raycaster:null, pointer:null, flipTarget:0, flipping:false, pointerDown:null};
  const playYears = () => data.coverage.play_years || [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
  const deathsInRange = (row, startYear=state.startYear, endYear=state.endYear) => {
    if (row.in_ucdp === false) return row.civilians || 0;
    let total = 0;
    for (const item of row.years || []) {
      const y = item[0], n = item[1];
      if (y >= startYear && y <= endYear) total += n;
    }
    return total;
  };
  const worldInRange = () => (data.countries || []).reduce((sum, row) => sum + deathsInRange(row), 0);
  const externalInRange = row => {const end=Number(String(row.as_of||'').slice(0,4)),start=Number((String(row.period||'').match(/\b(\d{4})\b/)||[])[1]||end);return end>=state.startYear&&start<=state.endYear;};
  const rangeLabel = () => `${state.startYear}–${state.endYear}`;
  const healthYear = metric => {const coverage=metric==='mortality'?health?.coverage:life?.coverage;if(!coverage)return null;const year=Math.min(state.endYear,Number(coverage.end_year));return year>=state.startYear&&year>=Number(coverage.start_year)?year:null;};
  const healthObservation = (admin,metric) => {const series=metric==='mortality'?mortalityByAdmin.get(admin):lifeByAdmin.get(admin);if(!series)return null;let found=null;for(const [year,value] of series)if(year>=state.startYear&&year<=state.endYear&&(!found||year>found.year))found={year,value};return found;};
  const healthValue = (admin,metric) => healthObservation(admin,metric)?.value??null;
  const healthLabel = metric => metric==='mortality'?'All-cause mortality':'Life expectancy';
  const healthUnit = metric => metric==='mortality'?'deaths per 100,000':'years at birth';
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
    const values = rows.map(row => deathsInRange(row)).filter(value => value > 0);
    if (!values.length) state.priceScale = {min: 0, max: 1};
    else {
      const max = Math.max(...values);
      state.priceScale = {min:0,max:Math.max(1,max)};
    }
    const minEl = $('#civ-scale-min'), maxEl = $('#civ-scale-max');
    if (minEl) minEl.textContent = formatCount(state.priceScale.min);
    if (maxEl) maxEl.textContent = formatCount(state.priceScale.max);
  }
  function refreshHealthScales(admins) {
    for(const metric of ['mortality','lifeExpectancy']){
      const values=[...admins].map(admin=>healthValue(admin,metric)).filter(value=>value!=null);
      const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
      state.healthScale[metric]={min,max:max<=min?min+1:max};
    }
  }
  const healthFraction=(metric,value)=>{const scale=state.healthScale[metric];return Math.max(0,Math.min(1,(value-scale.min)/Math.max(.001,scale.max-scale.min)));};
  function smallTerritory(admin){
    const feature=featureByAdmin.get(admin);if(!feature)return admin==='Palestine';
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
    const points=polygons.flatMap(rings=>rings[0]||[]);if(!points.length)return false;
    const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
    return Math.sqrt(Math.max(.001,(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))))*MAP_SCALE<3.2;
  }
  function healthFacts(admin){
    return ['mortality','lifeExpectancy'].map(metric=>{const observation=healthObservation(admin,metric);return [healthLabel(metric),!observation?'No observation in range':`${observation.value.toLocaleString(undefined,{maximumFractionDigits:metric==='mortality'?1:2})} ${healthUnit(metric)} · ${observation.year}`];});
  }
  function setYearLabel() {
    const el = $('#civ-year');
    if (el) el.textContent = rangeLabel();
  }
  function filterRows() {
    state.worldVisible = data.countries.filter(row => deathsInRange(row) > 0 &&
      (!state.search || `${row.name} ${row.admin} ${row.region}`.toLocaleLowerCase().includes(state.search)));
    state.visible = state.nation ? state.worldVisible.filter(row => state.reverseCountries.has(row.admin)) : state.worldVisible;
    $('#civ-count').textContent = state.visible.length.toLocaleString();
    $('#civ-list-count').textContent = `${state.visible.length} UCDP countries`;
    if (state.selected && !state.visible.includes(state.selected) && state.selected.in_ucdp !== false) state.selected = null;
    refreshScale([...data.countries.filter(row => deathsInRange(row) > 0),...(data.external || []).filter(externalInRange)]);
    refreshHealthScales(new Set([...mortalityByAdmin.keys(),...lifeByAdmin.keys()]));
    setYearLabel();
    if (!state.nation) $('#civ-view-name').textContent = `CIVILIAN DEATHS · ${rangeLabel()}`;
    drawTowers();
    renderInspector();
    renderList();
  }
  function stopPlay() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
    const btn = $('#civ-play');
    if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Play years'; }
  }
  function playStep() {
    const years = playYears();
    state.startYear = state.endYear = years[state.playIndex % years.length];
    $('#civ-start').value=String(state.startYear);$('#civ-end').value=String(state.endYear);
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
        ...healthFacts(row.admin),
      ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${label === 'Source' ? value : esc(value)}</strong></div>`).join('');
      return;
    }
    const through = worldInRange();
    $('#civ-kicker').textContent = row ? `${row.region} · UCDP GED` : state.nation ? `Nation view / ${data.snapshot}` : `World total ${formatCount(through)} · ${rangeLabel()}`;
    $('#civ-selected').textContent = row ? row.name : state.nation || 'Reported civilian deaths';
    $('#civ-selected-sub').textContent = row ? `${formatCount(deathsInRange(row))} civilian deaths coded in this territory during ${rangeLabel()}` : state.nation ? 'Click the tower to inspect the national total. Click outside the nation to return.' : 'Choose a tower or a country below.';
    if (!row) {
      const external = (data.external || []).filter(externalInRange);
    const extra = external.map(item => `<div><span>${esc(item.place)} · ${esc(item.source_short)} (not UCDP)</span><strong>${esc(formatCount(item.civilians))}</strong></div>`).join('');
    $('#civ-facts').innerHTML = `<div><span>UCDP total · ${rangeLabel()}</span><strong>${esc(formatCount(through))}</strong></div><div><span>Countries in range</span><strong>${esc(formatCount(state.worldVisible.length))}</strong></div><div><span>Mortality year</span><strong>${healthYear('mortality')??'Unavailable'}</strong></div><div><span>Life expectancy year</span><strong>${healthYear('lifeExpectancy')??'Unavailable'}</strong></div>${extra}`;
      return;
    }
    const years = [...(row.years || [])].filter(([year])=>year>=state.startYear&&year<=state.endYear).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([year, deaths]) => `${year}: ${formatCount(deaths)}`).join(' · ') || '—';
    $('#civ-facts').innerHTML = [
      ['Civilian deaths in range', formatCount(deathsInRange(row))],
      ['Events', formatCount(row.events)],
      ['Events with civilian deaths', formatCount(row.events_with_civilians)],
      ['Years observed', `${row.year_start}–${row.year_end}`],
      ['2026 candidate civilians', formatCount(row.candidate_civilians)],
      ['Highest years', years],
      ...healthFacts(row.admin),
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }
  function renderList() {
    const sorted = [...state.visible].sort((a, b) => deathsInRange(b) - deathsInRange(a) || a.name.localeCompare(b.name));
    const ucdp = sorted.length ? sorted.map(row => {
      const index = data.countries.indexOf(row);
      const value = deathsInRange(row);
      return `<button type="button" data-index="${index}" aria-current="${row === state.selected}"><i style="background:${tone(value)}"></i><span><b>${esc(row.name)}</b><small>${esc(row.region)} · ${row.year_start}–${row.year_end} · UCDP GED</small></span><strong>${esc(formatCount(value))}</strong></button>`;
    }).join('') : `<p class="gas-list-empty">${state.nation ? 'No UCDP civilian-death record is mapped for this nation. Click outside the nation to return to the world.' : 'No countries match this search.'}</p>`;
    const showExternal = (!state.nation || state.nation === 'Palestine' || state.nation === 'Israel');
    const external = showExternal ? (data.external || []).map((row, index) => externalInRange(row) ?
      `<button type="button" data-external="${index}" aria-current="${row === state.selected}"><i style="background:#7ec8e3"></i><span><b>${esc(row.place)}</b><small>NOT IN UCDP · ${esc(row.source_short)} · ${esc(row.as_of)}</small></span><strong>${esc(formatCount(row.civilians))}</strong></button>`
    : '').join('') : '';
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
  const featurePolygons=feature=>feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
  const boundsFor=(feature,unwrap)=>{const points=featurePolygons(feature).flatMap(rings=>rings[0]||[]),xs=points.map(([lon])=>unwrap(lon)),ys=points.map(([,lat])=>lat);return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};};
  const boundsGap=(a,b)=>Math.hypot(Math.max(0,a.minX-b.maxX,b.minX-a.maxX),Math.max(0,a.minY-b.maxY,b.minY-a.maxY));
  function addNationReverse(country) {
    if (state.reverseGroup) {
      state.reverseGroup.traverse(object=>{object.geometry?.dispose?.();object.material?.dispose?.();});
      state.plateRoot.remove(state.reverseGroup);
    }
    const feature=geometry.features.find(item=>item.properties.ADMIN===country);
    if(!feature)return;
    const anchor=Number(feature.properties.LABEL_X)||0;
    const unwrap=lon=>{let delta=lon-anchor;while(delta>180)delta-=360;while(delta<-180)delta+=360;return anchor+delta;};
    const selectedBounds=boundsFor(feature,unwrap),span=Math.hypot(selectedBounds.maxX-selectedBounds.minX,selectedBounds.maxY-selectedBounds.minY),neighborDistance=Math.max(1.25,Math.min(4,span*.35));
    const regionalFeatures=geometry.features.filter(item=>item.properties.ADMIN!=='Antarctica'&&boundsGap(selectedBounds,boundsFor(item,unwrap))<=neighborDistance);
    state.reverseCountries=new Set(regionalFeatures.map(item=>item.properties.ADMIN));
    const featureBounds=regionalFeatures.map(item=>boundsFor(item,unwrap));
    const bounds={minX:Math.min(...featureBounds.map(item=>item.minX)),maxX:Math.max(...featureBounds.map(item=>item.maxX)),minY:Math.min(...featureBounds.map(item=>item.minY)),maxY:Math.max(...featureBounds.map(item=>item.maxY))};
    const centerX=(bounds.minX+bounds.maxX)/2,centerY=(bounds.minY+bounds.maxY)/2;
    const scale=Math.min(170/Math.max(1,bounds.maxX-bounds.minX),88/Math.max(1,bounds.maxY-bounds.minY),24);
    const project=([lon,lat])=>[(unwrap(lon)-centerX)*scale,(lat-centerY)*scale];
    const reverse=new THREE.Group();state.reverseGroup=reverse;state.plateRoot.add(reverse);
    state.reverseMeshes=[];
    regionalFeatures.forEach(item=>featurePolygons(item).forEach(rings=>{
      const shape=makeShape(rings,project);if(!shape)return;const selected=item.properties.ADMIN===country;
      const geo=new THREE.ShapeGeometry(shape,1);geo.rotateX(Math.PI/2);
      const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:selected?(dark()?'#b7ae79':'#e0d39a'):(dark()?'#5e6941':'#aaa77e'),side:THREE.DoubleSide,shininess:selected?15:7,emissive:selected?(dark()?'#302a13':'#13130c'):'#10140d',emissiveIntensity:selected?.12:.04}));
      mesh.position.y=-1.76;mesh.userData.country=item.properties.ADMIN;reverse.add(mesh);state.reverseMeshes.push(mesh);
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo,8),new THREE.LineBasicMaterial({color:selected?'#f9db7b':'#9e9a70',transparent:true,opacity:selected?.95:.65}));
      edge.position.y=-1.8;reverse.add(edge);
    }));
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
    $('#civ-stage-hint').innerHTML='SELECT A NEIGHBOR OR TOWER <b>·</b> CLICK OUTSIDE THE REGION TO RETURN';
    $('#civ-tooltip').hidden=true;
    filterRows();
  }
  function flipToWorld() {
    if(!state.nation||state.flipping)return;
    state.nation=null;state.reverseCountries=new Set();state.selected=null;state.flipTarget=0;state.flipping=true;state.controls.enabled=false;
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
    const addTower=(row,{reverse=false,metric='casualty',value,lon=row.lon,lat=row.lat,offset=0,dense=false}={})=>{
      if(value==null||value<=0)return;
      const fraction=metric==='casualty'?priceFraction(value):healthFraction(metric,value),height=Math.max(.08,fraction*MAX_TOWER_HEIGHT);
      const external=row.in_ucdp===false,radius=metric==='casualty'?(external?1.45:1.2):1.05;
      const selected=row===state.selected&&reverse===Boolean(state.nation);
      const color=metric==='mortality'?'#273849':metric==='lifeExpectancy'?'#33c8c7':external?'#5eb3d4':priceColor(value);
      const opacity=dense?.5:1;
      const material=new THREE.MeshPhongMaterial({color,emissive:selected?'#f9bf67':metric==='mortality'?'#0b121c':metric==='lifeExpectancy'?'#0b3030':external?'#163048':'#101a12',emissiveIntensity:selected?.35:.11,shininess:38,transparent:dense,opacity,depthWrite:!dense});
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius,height,6),material);
      if(reverse){const p=state.nationProjection;tower.position.set((p.unwrap(lon)-p.centerX)*p.scale+offset,-1.76-height/2-.3,(lat-p.centerY)*p.scale);}
      else tower.position.set(lon*MAP_SCALE+offset,height/2+.3,-lat*MAP_SCALE);
      tower.userData={row,metric,value,towerHeight:height};
      if(reverse===Boolean(state.nation)){
        const prefix=metric==='mortality'?'M ':metric==='lifeExpectancy'?'LE ':'';
        const label=metric==='casualty'?(external?compact(value)+'*':compact(value)):`${prefix}${Number(value).toLocaleString(undefined,{maximumFractionDigits:1})}`;
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasTexture(label,{w:256,h:96,font:'700 42px ui-sans-serif, system-ui, sans-serif',fill:selected?'#ffe08a':'#fff6d8',stroke:'rgba(0,0,0,0.88)',strokeWidth:8}),transparent:true,depthWrite:false,opacity:dense?.72:1}));
        const sw=3.4,sh=1.25;sprite.scale.set(sw,sh,1);sprite.position.set(0,reverse?-(height/2+.95):height/2+.95,0);tower.add(sprite);tower.userData.priceSprite=sprite;tower.userData.spriteW=sw;tower.userData.spriteH=sh;
      }
      (reverse?state.reverseTowerGroup:state.towerGroup).add(tower);(reverse?state.reverseTowers:state.worldTowers).push(tower);
    };
    const renderRows=(rows,reverse=false)=>{
      const grouped=new Map();rows.forEach(row=>{if(!grouped.has(row.admin))grouped.set(row.admin,[]);grouped.get(row.admin).push(row);});
      grouped.forEach((countryRows,admin)=>{
        const metrics=[...state.activeHealth].filter(metric=>healthValue(admin,metric)!=null),dense=(metrics.length>0&&smallTerritory(admin))||countryRows.length>1;
        const casualtyShift=metrics.length?-.9*metrics.length:0;
        countryRows.forEach((row,index)=>addTower(row,{reverse,metric:'casualty',value:deathsInRange(row),offset:countryRows.length>1?0:casualtyShift,dense}));
        if(!metrics.length)return;
        const anchor={lon:countryRows.reduce((sum,row)=>sum+row.lon,0)/countryRows.length,lat:countryRows.reduce((sum,row)=>sum+row.lat,0)/countryRows.length};
        metrics.forEach((metric,index)=>addTower(countryRows[0],{reverse,metric,value:healthValue(admin,metric),lon:anchor.lon,lat:anchor.lat,offset:(index-(metrics.length-1)/2)*1.8+.9,dense}));
      });
    };
    const externals=(data.external||[]).filter(row=>(!state.search||`${row.place} ${row.source_short}`.toLocaleLowerCase().includes(state.search))&&externalInRange(row));
    const showExternal=(!state.nation||state.nation==='Palestine'||state.nation==='Israel');
    const healthRows=[...new Set([...mortalityByAdmin.keys(),...lifeByAdmin.keys()])].filter(admin=>(!state.search||admin.toLocaleLowerCase().includes(state.search))&&[...state.activeHealth].some(metric=>healthValue(admin,metric)!=null)).map(admin=>{
      const feature=featureByAdmin.get(admin),props=feature?.properties||{};
      return {name:admin,admin,lon:Number(props.LABEL_X),lat:Number(props.LABEL_Y),healthOnly:true};
    }).filter(row=>Number.isFinite(row.lon)&&Number.isFinite(row.lat));
    const mergeRows=rows=>{const admins=new Set(rows.map(row=>row.admin));return [...rows,...healthRows.filter(row=>!admins.has(row.admin))];};
    renderRows(mergeRows([...state.worldVisible,...(showExternal?externals:[])]),false);
    if(state.nation&&state.reverseTowerGroup)renderRows(mergeRows([...state.visible,...externals.filter(row=>state.reverseCountries.has(row.admin))]).filter(row=>state.reverseCountries.has(row.admin)),true);
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
      const object=state.flipping?null:hit(event),row=object?.userData.row,metric=object?.userData.metric,country=object?.userData.country,tip=$('#civ-tooltip');
      state.hoveredTower=row?object:null;
      renderer.domElement.style.cursor=state.flipping?'wait':row||(!state.nation&&country)||state.nation?'pointer':'grab';
      if(!object){tip.hidden=true;return;}
      if(row&&metric&&metric!=='casualty'){
        const observation=healthObservation(row.admin,metric);
        tip.innerHTML=`<strong>${esc(observation?.value?.toLocaleString(undefined,{maximumFractionDigits:metric==='mortality'?1:2})||'—')}</strong><em>${esc(row.admin)} · ${esc(healthLabel(metric))}</em><span>${esc(healthUnit(metric))} · ${observation?.year||'no observation in range'}</span>`;
      }else if(row){
        tip.innerHTML=row.in_ucdp===false
          ? `<strong>${esc(formatCount(row.civilians))}</strong><em>${esc(row.place)} · ${esc(row.source_short)}</em><span>NOT IN UCDP · ${esc(row.metric)} · ${esc(row.as_of)}</span>`
          : `<strong>${esc(formatCount(deathsInRange(row)))}</strong><em>${esc(row.name)}</em><span>UCDP GED civilian deaths · ${rangeLabel()}</span>`;
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
      const object=hit(event),row=object?.userData.row,metric=object?.userData.metric,country=object?.userData.country;
      if(state.nation){if(row){if(!row.healthOnly&&metric==='casualty')selectRow(row);}else if(country&&country!==state.nation)flipToNation(country);else if(!country)flipToWorld();}
      else if(row)flipToNation(row.admin,row.healthOnly||metric!=='casualty'?null:row);
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
    $('#civ-source-line').innerHTML=`Sources: <a href="${esc(data.sources.ged)}" target="_blank" rel="noopener noreferrer">UCDP GED ↗</a><a href="https://vizhub.healthdata.org/gbd-results/" target="_blank" rel="noopener noreferrer">IHME GBD 2023 mortality ↗</a><a href="${esc(life?.source?.url||'https://ourworldindata.org/grapher/life-expectancy')}" target="_blank" rel="noopener noreferrer">Long-run life expectancy ↗</a><a href="${esc(life?.source?.peer_reviewed?.doi||'https://doi.org/10.1111/j.1728-4457.2005.00083.x')}" target="_blank" rel="noopener noreferrer">Riley (2005), peer reviewed ↗</a> UCDP coverage ${data.coverage.ged_years[0]}–${data.coverage.ged_years[1]}; mortality 1980–2023; life expectancy ${life?.coverage?.start_year||1543}–${life?.coverage?.end_year||2023}. Exact observations only; no interpolation or extrapolation.`;
    $('#civ-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLocaleLowerCase();filterRows();});
    const yearOptions=Array.from({length:sourceEnd-sourceStart+1},(_,index)=>sourceStart+index).map(year=>`<option value="${year}">${year}</option>`).join('');
    $('#civ-start').innerHTML=yearOptions;$('#civ-end').innerHTML=yearOptions;$('#civ-start').value=String(state.startYear);$('#civ-end').value=String(state.endYear);
    $('#civ-start').addEventListener('change',event=>{stopPlay();state.startYear=Number(event.target.value);if(state.startYear>state.endYear){state.endYear=state.startYear;$('#civ-end').value=event.target.value;}filterRows();});
    $('#civ-end').addEventListener('change',event=>{stopPlay();state.endYear=Number(event.target.value);if(state.endYear<state.startYear){state.startYear=state.endYear;$('#civ-start').value=event.target.value;}filterRows();});
    $('#civ-play').addEventListener('click',togglePlay);
    document.querySelectorAll('[data-health-layer]').forEach(input=>input.addEventListener('change',event=>{event.target.checked?state.activeHealth.add(event.target.dataset.healthLayer):state.activeHealth.delete(event.target.dataset.healthLayer);filterRows();}));
    $('#civ-list').addEventListener('click',event=>{
      const external=event.target.closest('[data-external]');
      if(external){selectRow((data.external||[])[Number(external.dataset.external)]);return;}
      const button=event.target.closest('[data-index]');
      if(button)selectRow(data.countries[Number(button.dataset.index)]);
    });
    $('#civ-back').addEventListener('click',flipToWorld);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.nation)flipToWorld();});
    $('#civ-reset').addEventListener('click',()=>{stopPlay();if(state.nation)flipToWorld();state.search='';state.selected=null;state.activeHealth=new Set();document.querySelectorAll('[data-health-layer]').forEach(input=>{input.checked=false;});state.startYear=defaultStart;state.endYear=defaultEnd;$('#civ-start').value=String(defaultStart);$('#civ-end').value=String(defaultEnd);$('#civ-search').value='';if(state.camera){state.camera.position.set(185,190,285);state.controls.target.set(0,MAP_Y+8,-20);state.controls.update();}filterRows();});
    $('#theme-toggle').addEventListener('click',()=>{const next=dark()?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('war-maps-theme',next);}catch(error){} window.location.reload();});
    try{initScene();}catch(error){$('#civ-map').innerHTML=`<p class="gas-error">The 3D field could not start: ${esc(error.message)}. The searchable country list remains available.</p>`;}
    filterRows();
    const requestedCountry=new URLSearchParams(location.search).get('country');
    if(requestedCountry&&geometry?.features?.some(item=>item.properties.ADMIN===requestedCountry)&&state.plateRoot)setTimeout(()=>flipToNation(requestedCountry,data.countries.find(row=>row.admin===requestedCountry)||null),80);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
