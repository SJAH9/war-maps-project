(() => {
  const data = window.WAR_MAPS_DATA;
  if (!data) return;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const conflictsById = new Map(data.conflicts.map(item => [item.id, item]));
  const nationNames = new Set(data.nations.flatMap(item => [item.country,item.map_name]));
  const yearsByConflict = new Map();
  const eventsByConflict = new Map();
  data.conflict_years.forEach(row => {
    if (!yearsByConflict.has(row.conflict_id)) yearsByConflict.set(row.conflict_id, []);
    yearsByConflict.get(row.conflict_id).push(row);
  });
  data.events.forEach(event => {
    if (!event.conflict_id) return;
    if (!eventsByConflict.has(event.conflict_id)) eventsByConflict.set(event.conflict_id, []);
    eventsByConflict.get(event.conflict_id).push(event);
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const state = {conflictId:'', start:'', end:'', graph:null, nodeMap:new Map(), positions:new Map(), nodeType:'all',forceGraph:null,forceNodes:new Map(),selected:'',connected:new Set(),resizeObserver:null,svgScene:null,renderMode:'2d',rotationTimer:null,rotationFrame:null,labelFrame:null,autoRotating:false};
  const AUTO_ROTATE_IDLE_MS = 8000;
  const SVG_ROTATION_RATE = .00004;
  const nodeColors = {
    conflict:{background:'#f07800',border:'#ffd500',highlight:{background:'#ff9a18',border:'#fff0a6'}},
    sideA:{background:'#657078',border:'#aaa071',highlight:{background:'#7b878b',border:'#d8c58f'}},
    sideB:{background:'#722b20',border:'#b95235',highlight:{background:'#9a3a2b',border:'#d8c58f'}},
    nation:{background:'#6d7442',border:'#aaa071',highlight:{background:'#858d54',border:'#d8c58f'}},
    actor:{background:'#555b2f',border:'#aaa071',highlight:{background:'#747b42',border:'#d8c58f'}},
    location:{background:'#9a5a43',border:'#d8c58f',highlight:{background:'#b96c4f',border:'#ffd500'}},
    observation:{background:'#d8c58f',border:'#645f4d',highlight:{background:'#ffd500',border:'#f07800'}}
  };
  const aliases = {'Bosnia-Herzegovina':'Bosnia and Herzegovina','Cambodia (Kampuchea)':'Cambodia','DR Congo (Zaire)':'Democratic Republic of the Congo','Ivory Coast':"Cote d'Ivoire",'Myanmar (Burma)':'Myanmar','Russia (Soviet Union)':'Russia','Serbia (Yugoslavia)':'Serbia','South Vietnam':'Vietnam','Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'Yemen','Zimbabwe (Rhodesia)':'Zimbabwe'};

  const splitParties = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const isoDate = (value, fallback) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback;
  const inRange = (start, end) => end >= state.start && start <= state.end;
  const nodeId = (type, value) => `${type}:${value}`;
  const displayLocation = value => aliases[value] || value;
  const currentTheme = () => document.documentElement.dataset.theme === 'dark';

  function conflictBounds(conflict) {
    const events = eventsByConflict.get(conflict.id) || [];
    const eventStarts = events.map(item => item.date_start).filter(Boolean).sort();
    const eventEnds = events.map(item => item.date_end || item.date_start).filter(Boolean).sort();
    const start = isoDate(conflict.start_date, eventStarts[0] || `${conflict.first_active_year}-01-01`);
    const observedEnd = eventEnds.at(-1) || conflict.end_date || `${conflict.last_active_year}-12-31`;
    return {start, end:conflict.active_at_source_boundary ? today : conflict.end_date || observedEnd, observedEnd, current:conflict.active_at_source_boundary};
  }

  function buildGraph(conflict) {
    const nodes = new Map();
    const edges = new Map();
    const addNode = (id, label, group, kind, metadata={}) => {
      if (!nodes.has(id)) nodes.set(id, {id,label,group,kind,metadata,title:esc(label)});
      return nodes.get(id);
    };
    const addEdge = (from, to, relation) => {
      if (!nodes.has(from) || !nodes.has(to)) return;
      const id = `${from}|${to}|${relation}`;
      if (!edges.has(id)) edges.set(id, {id,from,to,relation});
    };
    const centerId = nodeId('conflict', conflict.id);
    const sideAId = nodeId('side', 'a');
    const sideBId = nodeId('side', 'b');
    addNode(centerId, conflict.title, 'conflict', 'conflict', {conflict});
    addNode(sideAId, 'Side A', 'sideA', 'side', {side:'A'});
    addNode(sideBId, 'Side B', 'sideB', 'side', {side:'B'});
    addEdge(centerId, sideAId, 'belligerent side');
    addEdge(centerId, sideBId, 'belligerent side');

    const addActor = (name, side) => {
      if (!name) return;
      const id = nodeId('actor', name);
      addNode(id, name, 'actor', 'actor', {name,side});
      addEdge(side === 'A' ? sideAId : sideBId, id, 'participant');
    };
    const addNation = (name, side, location) => {
      if (!name) return;
      const mapped = displayLocation(name);
      const id = nodeId('nation', mapped);
      const node = addNode(id, mapped, 'nation', 'nation', {country:mapped,sides:new Set()});
      node.metadata.sides.add(side);
      addEdge(side === 'A' ? sideAId : sideBId, id, 'state participant');
      if (location) addEdge(id, nodeId('location', displayLocation(location)), 'recorded at');
    };
    const addLocation = name => {
      if (!name) return '';
      const mapped = displayLocation(name);
      const id = nodeId('location', mapped);
      addNode(id, mapped, 'location', 'location', {location:mapped});
      addEdge(centerId, id, 'conflict location');
      return id;
    };

    conflict.parties_a.forEach(name => addActor(name, 'A'));
    conflict.parties_b.forEach(name => addActor(name, 'B'));
    conflict.plot_locations.forEach(addLocation);

    const rows = (yearsByConflict.get(conflict.id) || []).filter(row => inRange(`${row.year}-01-01`, `${row.year}-12-31`));
    rows.forEach((row, index) => {
      splitParties(row.side_a).forEach(name => addActor(name, 'A'));
      splitParties(row.side_b).forEach(name => addActor(name, 'B'));
      (row.side_a_secondary || []).forEach(name => addActor(name, 'A'));
      (row.side_b_secondary || []).forEach(name => addActor(name, 'B'));
      const locations = (row.plot_locations || row.locations || []).map(displayLocation);
      locations.forEach(addLocation);
      locations.forEach(location => {
        row.side_a_states.forEach(name => addNation(name, 'A', location));
        row.side_b_states.forEach(name => addNation(name, 'B', location));
      });
      const id = nodeId('observation', `year-${row.year}-${index}`);
      addNode(id, String(row.year), 'observation', 'observation', {recordType:'conflict-year',row});
      locations.forEach(location => addEdge(nodeId('location', location), id, 'annual observation'));
    });

    const events = (eventsByConflict.get(conflict.id) || []).filter(event => inRange(event.date_start, event.date_end || event.date_start));
    events.forEach(event => {
      const location = displayLocation(event.country || event.place || 'Unspecified location');
      const locationId = addLocation(location);
      splitParties(event.side_a).forEach(name => addActor(name, 'A'));
      splitParties(event.side_b).forEach(name => addActor(name, 'B'));
      event.side_a_states.forEach(name => addNation(name, 'A', location));
      event.side_b_states.forEach(name => addNation(name, 'B', location));
      const id = nodeId('observation', event.id);
      const place = event.place || event.country || 'Unspecified place';
      addNode(id, `${event.date_start} · ${place}`, 'observation', 'observation', {recordType:'candidate-event',event});
      addEdge(locationId, id, 'candidate event');
    });

    nodes.forEach(node => {
      if (node.metadata.sides instanceof Set) node.metadata.sides = [...node.metadata.sides].sort();
    });
    return {nodes:[...nodes.values()],edges:[...edges.values()],rows,events};
  }

  function positionGraph(graph) {
    const positions = new Map();
    const distribute = (nodes, x, spread=7) => nodes.forEach((node,index)=>positions.set(node.id,{x,y:nodes.length===1?0:(index/(nodes.length-1)-.5)*spread}));
    positions.set(nodeId('conflict',state.conflictId),{x:0,y:0});
    positions.set(nodeId('side','a'),{x:-7,y:0});
    positions.set(nodeId('side','b'),{x:7,y:0});
    distribute(graph.nodes.filter(node=>node.kind==='actor'&&node.metadata.side==='A'),-9,8);
    distribute(graph.nodes.filter(node=>node.kind==='actor'&&node.metadata.side==='B'),9,8);
    distribute(graph.nodes.filter(node=>node.kind==='nation'&&node.metadata.sides.length===1&&node.metadata.sides[0]==='A'),-5.8,7);
    distribute(graph.nodes.filter(node=>node.kind==='nation'&&node.metadata.sides.length===1&&node.metadata.sides[0]==='B'),5.8,7);
    distribute(graph.nodes.filter(node=>node.kind==='nation'&&node.metadata.sides.length>1),0,3);
    const locations=graph.nodes.filter(node=>node.kind==='location');
    locations.forEach((node,index)=>{const angle=-Math.PI/2+index*Math.PI*2/Math.max(1,locations.length);positions.set(node.id,{x:3.8*Math.cos(angle),y:3.8*Math.sin(angle)});});
    const observationsByLocation=new Map();
    graph.nodes.filter(node=>node.kind==='observation').forEach(node=>{
      const edge=graph.edges.find(item=>(item.from===node.id||item.to===node.id)&&((state.nodeMap.get(item.from)?.kind==='location')||(state.nodeMap.get(item.to)?.kind==='location')));
      const locationId=edge?(state.nodeMap.get(edge.from)?.kind==='location'?edge.from:edge.to):'unplaced';
      if(!observationsByLocation.has(locationId))observationsByLocation.set(locationId,[]);
      observationsByLocation.get(locationId).push(node);
    });
    observationsByLocation.forEach((nodes,locationId)=>{
      const anchor=positions.get(locationId)||{x:0,y:0};
      nodes.forEach((node,index)=>{const angle=index*2.399963;const radius=.34+.095*Math.sqrt(index);positions.set(node.id,{x:anchor.x+Math.cos(angle)*radius,y:anchor.y+Math.sin(angle)*radius});});
    });
    graph.nodes.forEach((node,index)=>{if(!positions.has(node.id))positions.set(node.id,{x:Math.cos(index)*2,y:Math.sin(index)*2});});
    return positions;
  }

  const endpointId = endpoint => typeof endpoint === 'object' ? endpoint.id : endpoint;
  const mutedNodeColor = dark => dark ? '#26312f' : '#b8c1bd';
  const nodeBaseColor = node => nodeColors[node.group]?.background || '#65717b';
  const isHighlightedLink = link => state.selected && (endpointId(link.source)===state.selected || endpointId(link.target)===state.selected);
  const linkRelation = link => link.relation || '';
  const linkBaseColor = link => {
    if(isHighlightedLink(link))return '#ffd500';
    const source=endpointId(link.source),target=endpointId(link.target),relation=linkRelation(link);
    if(source==='side:a'||target==='side:a')return '#8b989b';
    if(source==='side:b'||target==='side:b')return '#b95235';
    if(relation==='candidate event')return '#d52222';
    if(relation.includes('observation'))return currentTheme()?'#d8c58f':'#645f4d';
    if(relation==='conflict location')return '#c97858';
    return currentTheme()?'#aaa071':'#555b2f';
  };
  const linkBaseWidth = link => {
    if(isHighlightedLink(link))return 3.6;
    const relation=linkRelation(link);
    if(relation==='belligerent side')return 2.4;
    if(relation==='participant'||relation==='state participant')return 1.45;
    if(relation==='conflict location')return 1.7;
    return state.graph?.edges.length>900?.65:1.05;
  };
  const nodeDisplayLabel = node => {
    const raw=node.kind==='side'?`Side ${node.metadata.side}`:node.label;
    const limit=node.kind==='conflict'?44:30;
    return raw.length>limit?`${raw.slice(0,limit-1).trimEnd()}...`:raw;
  };
  const hasPersistentLabel = node => node.kind!=='observation';

  function stopAutoRotation() {
    clearTimeout(state.rotationTimer);state.rotationTimer=null;
    cancelAnimationFrame(state.rotationFrame);state.rotationFrame=null;
    state.autoRotating=false;
    const controls=state.forceGraph?.controls?.();
    if(controls)controls.autoRotate=false;
  }

  function startAutoRotation() {
    stopAutoRotation();
    state.autoRotating=true;
    if(state.renderMode==='3d'&&state.forceGraph){
      const controls=state.forceGraph.controls();
      controls.autoRotate=true;
      controls.autoRotateSpeed=.28;
      return;
    }
    if(state.renderMode==='svg3d'&&state.svgScene){
      let previous=performance.now();
      const rotate=timestamp=>{
        if(!state.autoRotating||state.renderMode!=='svg3d'||!state.svgScene)return;
        const elapsed=Math.min(64,timestamp-previous);
        if(elapsed>=24){state.svgScene.yaw+=elapsed*SVG_ROTATION_RATE;state.svgScene.draw();previous=timestamp;}
        state.rotationFrame=requestAnimationFrame(rotate);
      };
      state.rotationFrame=requestAnimationFrame(rotate);
    }
  }

  function noteInteraction() {
    stopAutoRotation();
    state.rotationTimer=setTimeout(startAutoRotation,AUTO_ROTATE_IDLE_MS);
  }

  function stopNativeLabels() {
    cancelAnimationFrame(state.labelFrame);state.labelFrame=null;
  }

  function startNativeLabels(graph,container,nodes) {
    stopNativeLabels();
    const layer=document.createElement('div');layer.className='network-label-layer';layer.setAttribute('aria-hidden','true');container.append(layer);
    const labels=new Map(nodes.filter(hasPersistentLabel).map(node=>{
      const label=document.createElement('span');label.className='network-node-label';label.dataset.nodeKind=node.kind;label.textContent=nodeDisplayLabel(node);layer.append(label);return [node.id,label];
    }));
    const offsets={conflict:17,side:15,nation:13,location:12,actor:11};
    const draw=()=>{
      if(state.forceGraph!==graph||state.renderMode!=='3d'||!layer.isConnected)return;
      labels.forEach((label,id)=>{
        const node=state.forceNodes.get(id);const point=node&&graph.graph2ScreenCoords?.(node.x,node.y,node.z);
        const visible=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>-80&&point.x<container.clientWidth+80&&point.y>-40&&point.y<container.clientHeight+40;
        if(!visible){label.hidden=true;return;}
        label.hidden=false;
        const classMatch=state.nodeType==='all'||node.kind===state.nodeType;
        const connectionMatch=!state.selected||state.connected.has(node.id);
        label.style.opacity=classMatch&&connectionMatch?'1':'.14';
        label.style.transform=`translate(${point.x}px,${point.y-(offsets[node.kind]||11)}px) translate(-50%,-100%)`;
      });
      state.labelFrame=requestAnimationFrame(draw);
    };
    state.labelFrame=requestAnimationFrame(draw);
  }

  function update3DStyles() {
    if(state.renderMode==='svg3d'&&state.svgScene){state.svgScene.draw();return;}
    if(!state.forceGraph)return;
    const dark=currentTheme();
    state.forceGraph
      .nodeColor(node=>{
        const classMatch=state.nodeType==='all'||node.kind===state.nodeType;
        const connectionMatch=!state.selected||state.connected.has(node.id);
        return classMatch&&connectionMatch?nodeBaseColor(node):mutedNodeColor(dark);
      })
      .linkColor(linkBaseColor)
      .linkWidth(linkBaseWidth)
      .linkOpacity(.76)
      .linkDirectionalParticles(link=>isHighlightedLink(link)?3:0)
      .linkDirectionalParticleWidth(1.8)
      .linkDirectionalParticleColor('#ffd500')
      .refresh();
    state.forceGraph.graphData().nodes.forEach(node=>{
      const object=node.__threeObj;if(!object)return;
      const classMatch=state.nodeType==='all'||node.kind===state.nodeType;
      const connectionMatch=!state.selected||state.connected.has(node.id);
      const emphasized=classMatch&&connectionMatch;
      object.traverse?.(child=>{if(!child.material)return;child.material.opacity=emphasized?.96:.1;child.material.emissiveIntensity=emphasized?.12:0;});
    });
    state.forceGraph.refresh();
  }

  function nodeObject(node){
    if(!window.THREE)return null;
    const sizes={conflict:10,side:8,nation:6.5,location:6,actor:4.5,observation:2.1};
    const size=sizes[node.kind]||4;
    const geometries={
      conflict:()=>new THREE.OctahedronGeometry(size,0),
      side:()=>new THREE.ConeGeometry(size*.82,size*1.8,8),
      nation:()=>new THREE.BoxGeometry(size*1.45,size*1.45,size*1.45),
      location:()=>new THREE.CylinderGeometry(size*.78,size*.78,size*1.45,8),
      actor:()=>new THREE.SphereGeometry(size,12,8),
      observation:()=>new THREE.TetrahedronGeometry(size,0)
    };
    const color=nodeBaseColor(node),material=new THREE.MeshPhongMaterial({color,emissive:color,emissiveIntensity:.12,shininess:28,transparent:true,opacity:.96});
    const mesh=new THREE.Mesh((geometries[node.kind]||geometries.actor)(),material);mesh.userData.nodeId=node.id;return mesh;
  }

  function createSvgGlyph(node,ns){
    const tags={conflict:'rect',side:'polygon',nation:'rect',location:'polygon',actor:'circle',observation:'rect'};
    const glyph=document.createElementNS(ns,tags[node.kind]||'circle');glyph.dataset.glyphKind=node.kind;return glyph;
  }

  function sizeSvgGlyph(glyph,kind,radius){
    if(kind==='actor'){glyph.setAttribute('r',radius);return;}
    if(kind==='conflict'||kind==='observation'){const size=kind==='observation'?radius*1.45:radius*1.35;glyph.setAttribute('x',-size);glyph.setAttribute('y',-size);glyph.setAttribute('width',size*2);glyph.setAttribute('height',size*2);glyph.setAttribute('transform','rotate(45)');return;}
    if(kind==='nation'){glyph.setAttribute('x',-radius);glyph.setAttribute('y',-radius);glyph.setAttribute('width',radius*2);glyph.setAttribute('height',radius*2);return;}
    if(kind==='side'){glyph.setAttribute('points',`0,${-radius*1.25} ${radius*1.1},${radius} ${-radius*1.1},${radius}`);return;}
    if(kind==='location'){const points=Array.from({length:6},(_,index)=>{const angle=index*Math.PI/3;return `${Math.cos(angle)*radius},${Math.sin(angle)*radius}`});glyph.setAttribute('points',points.join(' '));return;}
    glyph.setAttribute('r',radius);
  }

  function selectGraphNode(id) {
    noteInteraction();
    state.selected=id||'';
    state.connected=new Set(id?[id,...connectedNodes(id).map(node=>node.id)]:[]);
    update3DStyles();
    if(id)showNode(id);else showSummary(conflictsById.get(state.conflictId));
  }

  function render3D() {
    const container=$('#network-canvas');
    stopAutoRotation();stopNativeLabels();
    state.resizeObserver?.disconnect();
    state.forceGraph?._destructor?.();
    state.svgScene=null;
    container.innerHTML='';
    const dark=currentTheme();
    const graphNodes=state.graph.nodes.map((node,index)=>{
      const position=state.positions.get(node.id);
      let hash=0;for(const char of node.id)hash=(hash*31+char.charCodeAt(0))|0;
      const depth=((Math.abs(hash)%201)-100)*(node.kind==='observation'?.22:.5);
      const val={conflict:14,side:10,nation:8,location:7,actor:5,observation:1.4}[node.kind]||3;
      return {...node,x:position.x*18,y:position.y*18,z:depth,val};
    });
    const graphLinks=state.graph.edges.map(edge=>({source:edge.from,target:edge.to,relation:edge.relation}));
    state.forceNodes=new Map(graphNodes.map(node=>[node.id,node]));
    const rect=container.getBoundingClientRect();
    const graph=new ForceGraph3D(container,{controlType:'orbit',rendererConfig:{antialias:true,alpha:true}})
      .width(Math.max(320,Math.round(rect.width)))
      .height(Math.max(420,Math.round(rect.height)))
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeLabel(node=>`<b>${esc(nodeDisplayLabel(node))}</b><br><small>${esc(node.kind)}</small>`)
      .nodeThreeObject(nodeObject)
      .nodeThreeObjectExtend(false)
      .nodeVal('val')
      .nodeRelSize(4)
      .nodeOpacity(.92)
      .nodeResolution(10)
      .linkOpacity(.42)
      .linkLabel(link=>esc(link.relation))
      .enableNodeDrag(true)
      .enableNavigationControls(true)
      .onNodeClick(node=>selectGraphNode(node.id))
      .onNodeDrag(()=>noteInteraction())
      .onNodeDragEnd(node=>{noteInteraction();node.fx=node.x;node.fy=node.y;node.fz=node.z;})
      .onBackgroundClick(()=>selectGraphNode(''))
      .onNodeHover(node=>{container.style.cursor=node?'pointer':'grab';})
      .warmupTicks(graphNodes.length>700?35:70)
      .cooldownTicks(graphNodes.length>700?80:150)
      .graphData({nodes:graphNodes,links:graphLinks});
    graph.d3Force('charge')?.strength(graphNodes.length>700?-28:-65);
    graph.d3Force('link')?.distance(link=>link.relation.includes('observation')||link.relation==='candidate event'?24:52);
    graph.d3ReheatSimulation();
    graph.cameraPosition({x:0,y:0,z:520},{x:0,y:0,z:0},0);
    setTimeout(()=>graph.zoomToFit(600,70),500);
    let initiallyFitted=false;
    graph.onEngineStop(()=>{if(!initiallyFitted){initiallyFitted=true;graph.zoomToFit(550,70);}});
    state.forceGraph=graph;
    state.renderMode='3d';
    graph.controls().addEventListener('start',noteInteraction);
    container.addEventListener('pointerdown',noteInteraction,{passive:true});
    container.addEventListener('wheel',noteInteraction,{passive:true});
    state.resizeObserver=new ResizeObserver(entries=>{const box=entries[0]?.contentRect;if(box&&box.width>0&&box.height>0)graph.width(Math.round(box.width)).height(Math.round(box.height));});
    state.resizeObserver.observe(container);
    update3DStyles();
    startNativeLabels(graph,container,graphNodes);
    startAutoRotation();
    setTimeout(()=>{
      if(state.forceGraph!==graph||state.renderMode!=='3d')return;
      try{
        const renderer=graph.renderer();renderer.render(graph.scene(),graph.camera());
        const gl=renderer.getContext();const width=gl.drawingBufferWidth;const height=gl.drawingBufferHeight;
        const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let paintedPixels=0;for(let index=0;index<pixels.length;index+=16){if(pixels[index]>22||pixels[index+1]>22||pixels[index+2]>22)paintedPixels++;if(paintedPixels>700)break;}
        if(paintedPixels<=700)renderSVG3D();
      }catch(error){renderSVG3D();}
    },1800);
  }

  function renderSVG3D() {
    const container=$('#network-canvas');
    stopAutoRotation();stopNativeLabels();
    state.resizeObserver?.disconnect();state.forceGraph?._destructor?.();state.forceGraph=null;container.innerHTML='';
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');svg.classList.add('network-svg-3d');svg.setAttribute('aria-label','Rotatable three-dimensional conflict network');
    const edgeLayer=document.createElementNS(ns,'g');const nodeLayer=document.createElementNS(ns,'g');svg.append(edgeLayer,nodeLayer);container.append(svg);
    const nodes=state.graph.nodes.map(node=>{const point=state.positions.get(node.id);let hash=0;for(const char of node.id)hash=(hash*31+char.charCodeAt(0))|0;return {...node,x:point.x*52,y:point.y*52,z:((Math.abs(hash)%201)-100)*(node.kind==='observation'?1.1:2.1)};});
    const nodeMap=new Map(nodes.map(node=>[node.id,node]));
    const edgeElements=state.graph.edges.map(edge=>{const line=document.createElementNS(ns,'line');line.dataset.source=edge.from;line.dataset.target=edge.to;edgeLayer.append(line);return {edge,line};});
    const radii={conflict:13,side:11,nation:9,location:8,actor:7,observation:3};
    const nodeElements=new Map();
    nodes.forEach(node=>{const group=document.createElementNS(ns,'g');group.dataset.nodeId=node.id;group.dataset.nodeKind=node.kind;group.classList.add('network-svg-node');const glyph=createSvgGlyph(node,ns);const title=document.createElementNS(ns,'title');title.textContent=`${nodeDisplayLabel(node)} · ${node.kind}`;glyph.append(title);group.append(glyph);if(hasPersistentLabel(node)){const label=document.createElementNS(ns,'text');label.textContent=nodeDisplayLabel(node);group.append(label);}nodeLayer.append(group);nodeElements.set(node.id,{group,glyph,label:group.querySelector('text')});});
    const scene={yaw:-.32,pitch:.22,zoom:1,width:1,height:1,nodes,nodeMap,edgeElements,nodeElements,drag:null,moved:false};
    const project=node=>{const cy=Math.cos(scene.yaw),sy=Math.sin(scene.yaw),cp=Math.cos(scene.pitch),sp=Math.sin(scene.pitch);const x1=node.x*cy+node.z*sy;const z1=-node.x*sy+node.z*cy;const y1=node.y*cp-z1*sp;const z2=node.y*sp+z1*cp;const scale=scene.zoom*760/(980+z2);return {x:scene.width/2+x1*scale,y:scene.height/2+y1*scale,z:z2,scale};};
    scene.draw=()=>{
      const projected=new Map(nodes.map(node=>[node.id,project(node)]));
      edgeElements.forEach(({edge,line})=>{const from=projected.get(edge.from),to=projected.get(edge.to);line.setAttribute('x1',from.x);line.setAttribute('y1',from.y);line.setAttribute('x2',to.x);line.setAttribute('y2',to.y);line.setAttribute('stroke',linkBaseColor({source:edge.from,target:edge.to,relation:edge.relation}));line.setAttribute('stroke-width',linkBaseWidth({source:edge.from,target:edge.to,relation:edge.relation}));line.setAttribute('opacity',isHighlightedLink({source:edge.from,target:edge.to})?'1':'.74');});
      nodes.sort((a,b)=>projected.get(a.id).z-projected.get(b.id).z).forEach(node=>nodeLayer.append(nodeElements.get(node.id).group));
      nodes.forEach(node=>{const point=projected.get(node.id),parts=nodeElements.get(node.id);const classMatch=state.nodeType==='all'||node.kind===state.nodeType;const connectionMatch=!state.selected||state.connected.has(node.id);const radius=Math.max(2,radii[node.kind]*point.scale);parts.group.setAttribute('transform',`translate(${point.x} ${point.y})`);parts.group.setAttribute('opacity',classMatch&&connectionMatch?'1':'.13');sizeSvgGlyph(parts.glyph,node.kind,radius);parts.glyph.setAttribute('fill',nodeBaseColor(node));parts.glyph.setAttribute('stroke',state.selected===node.id?'#ffd500':'#d8c58f');parts.glyph.setAttribute('stroke-width',state.selected===node.id?'2.5':'1');if(parts.label){parts.label.setAttribute('y',-(radii[node.kind]*point.scale+5));parts.label.setAttribute('fill',currentTheme()?'#e4d6ad':'#17150f');}});
    };
    const resize=()=>{const box=container.getBoundingClientRect();scene.width=Math.max(320,box.width);scene.height=Math.max(420,box.height);svg.setAttribute('viewBox',`0 0 ${scene.width} ${scene.height}`);scene.draw();};
    svg.addEventListener('pointerdown',event=>{noteInteraction();const group=event.target.closest?.('[data-node-id]');scene.drag={x:event.clientX,y:event.clientY,node:group?nodeMap.get(group.dataset.nodeId):null};scene.moved=false;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)scene.moved=true;if(scene.drag.node){scene.drag.node.x+=dx/scene.zoom;scene.drag.node.y+=dy/scene.zoom;}else{scene.yaw+=dx*.008;scene.pitch=Math.max(-1.35,Math.min(1.35,scene.pitch+dy*.008));}scene.drag.x=event.clientX;scene.drag.y=event.clientY;scene.draw();});
    svg.addEventListener('pointerup',event=>{if(!scene.drag)return;const node=scene.drag.node,moved=scene.moved;scene.drag=null;svg.releasePointerCapture(event.pointerId);if(!moved)selectGraphNode(node?.id||'');});
    svg.addEventListener('wheel',event=>{event.preventDefault();noteInteraction();scene.zoom=Math.max(.35,Math.min(3.2,scene.zoom*Math.exp(-event.deltaY*.001)));scene.draw();},{passive:false});
    state.svgScene=scene;state.renderMode='svg3d';state.resizeObserver=new ResizeObserver(resize);state.resizeObserver.observe(container);resize();update3DStyles();startAutoRotation();
  }

  function renderPlot() {
    if(!window.Plotly){$('#network-canvas').innerHTML='<p class="boundary-note network-error">The network library is unavailable. Conflict records remain available from the atlas.</p>';return;}
    const dark=currentTheme();
    const edgeX=[];const edgeY=[];
    state.graph.edges.forEach(edge=>{const from=state.positions.get(edge.from);const to=state.positions.get(edge.to);if(!from||!to)return;edgeX.push(from.x,to.x,null);edgeY.push(from.y,to.y,null);});
    const traces=state.graph.edges.map(edge=>{const from=state.positions.get(edge.from),to=state.positions.get(edge.to);return {type:'scatter',mode:'lines',x:[from.x,to.x],y:[from.y,to.y],hoverinfo:'skip',showlegend:false,line:{color:linkBaseColor({source:edge.from,target:edge.to,relation:edge.relation}),width:linkBaseWidth({source:edge.from,target:edge.to,relation:edge.relation})},name:edge.relation};});
    const settings={
      conflict:{label:'Conflict',size:25,symbol:'diamond'},sideA:{label:'Side A',size:22,symbol:'circle'},sideB:{label:'Side B',size:22,symbol:'circle'},
      nation:{label:'Nations',size:16,symbol:'square'},actor:{label:'Actors',size:13,symbol:'circle'},location:{label:'Locations',size:16,symbol:'hexagon'},observation:{label:'Observations',size:7,symbol:'circle'}
    };
    Object.entries(settings).forEach(([group,setting])=>{
      const nodes=state.graph.nodes.filter(node=>node.group===group);
      if(!nodes.length)return;
      const emphasized=state.nodeType==='all'||nodes.some(node=>node.kind===state.nodeType);
      const showText=group!=='observation';
      traces.push({type:'scatter',mode:showText?'markers+text':'markers',name:setting.label,x:nodes.map(node=>state.positions.get(node.id).x),y:nodes.map(node=>state.positions.get(node.id).y),customdata:nodes.map(node=>node.id),hovertext:nodes.map(node=>nodeDisplayLabel(node)),hovertemplate:'<b>%{hovertext}</b><extra>'+setting.label+'</extra>',text:showText?nodes.map(node=>nodeDisplayLabel(node)):undefined,textposition:'top center',textfont:{color:dark?'#d9d9d2':'#303632',size:10,family:'Inter, Arial, sans-serif'},marker:{size:setting.size,symbol:setting.symbol,color:nodeColors[group].background,line:{color:nodeColors[group].border,width:1}},opacity:emphasized?1:.1});
    });
    const layout={margin:{l:20,r:20,t:20,b:20},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',showlegend:false,hovermode:'closest',dragmode:'pan',xaxis:{visible:false,fixedrange:false},yaxis:{visible:false,fixedrange:false,scaleanchor:'x',scaleratio:1},uirevision:`${state.conflictId}-${state.start}-${state.end}`};
    Plotly.react('network-canvas',traces,layout,{responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToRemove:['select2d','lasso2d']});
    const canvas=$('#network-canvas');
    canvas.removeAllListeners?.('plotly_click');
    canvas.on('plotly_click',event=>{const id=event.points?.[0]?.customdata;if(id)selectGraphNode(id);});
  }

  function renderGraph() {
    const conflict = conflictsById.get(state.conflictId);
    if (!conflict) return;
    renderLocaleMap(conflict);
    stopAutoRotation();
    state.graph = buildGraph(conflict);
    state.nodeMap = new Map(state.graph.nodes.map(node=>[node.id,node]));
    state.positions = positionGraph(state.graph);
    state.selected='';state.connected=new Set();
    try{if(!window.ForceGraph3D)throw new Error('3D renderer unavailable');render3D();}
    catch(error){state.renderMode='2d';try{renderPlot();}catch(plotError){$('#network-canvas').innerHTML='<p class="boundary-note network-error">The network renderer is unavailable. Conflict records remain available from the atlas.</p>';}}
    showSummary(conflict);
    renderNetworkStats(conflict);
  }

  function renderLocaleMap(conflict){
    const container=$('#network-locale-map');if(!container||!window.Plotly)return;
    const locations=[...new Set(conflict.plot_locations.map(displayLocation))];
    const dark=currentTheme();
    const trace={type:'choropleth',locationmode:'country names',locations,z:locations.map(()=>1),hoverinfo:'skip',showscale:false,colorscale:[[0,'#657078'],[1,'#9a5a43']],marker:{line:{color:dark?'#aaa071':'#555b2f',width:1.1}}};
    const layout={margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',geo:{projection:{type:'natural earth'},fitbounds:locations.length?'locations':false,bgcolor:'rgba(0,0,0,0)',showframe:false,showland:true,landcolor:dark?'#2b3025':'#aaa071',showocean:true,oceancolor:dark?'#11150f':'#7f8467',showcoastlines:true,coastlinecolor:dark?'#777b62':'#555b2f',showcountries:true,countrycolor:dark?'#555946':'#d8c58f'}};
    Plotly.react(container,[trace],layout,{staticPlot:true,responsive:true,displayModeBar:false});
  }

  function connectedNodes(id) {
    if (!state.graph) return [];
    const ids = new Set();
    state.graph.edges.forEach(edge => {
      if (edge.from === id) ids.add(edge.to);
      if (edge.to === id) ids.add(edge.from);
    });
    return [...ids].map(nodeIdValue => state.nodeMap.get(nodeIdValue)).filter(Boolean);
  }

  function connectionMarkup(nodes) {
    return nodes.length ? `<div class="node-connections"><h3>Connected records</h3>${nodes.slice(0,80).map(node=>`<button type="button" data-focus-node="${esc(node.id)}"><span>${esc(node.label)}</span><small>${esc(node.kind)}</small></button>`).join('')}${nodes.length>80?`<p>${nodes.length-80} additional connections remain visible in the graph.</p>`:''}</div>` : '';
  }

  function focusNode(id) {
    noteInteraction();
    if(state.renderMode==='svg3d')return;
    if(state.forceGraph&&state.renderMode==='3d'){
      const node=state.forceNodes.get(id);if(!node)return;
      const distance=95;const magnitude=Math.hypot(node.x||0,node.y||0,node.z||0);const ratio=magnitude?1+distance/magnitude:1;
      state.forceGraph.cameraPosition(magnitude?{x:node.x*ratio,y:node.y*ratio,z:node.z*ratio}:{x:0,y:0,z:distance},node,700);
      return;
    }
    const position=state.positions.get(id);
    if(!position||!window.Plotly)return;
    Plotly.relayout('network-canvas',{'xaxis.range':[position.x-2.2,position.x+2.2],'yaxis.range':[position.y-2.2,position.y+2.2]});
  }

  function bindConnectionButtons() {
    document.querySelectorAll('[data-focus-node]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.focusNode;
      focusNode(id);
      selectGraphNode(id);
    }));
  }

  function showNode(id) {
    const node = state.nodeMap.get(id);
    if (!node) return;
    const connected = connectedNodes(id);
    $('#node-type').textContent = node.kind;
    $('#node-title').textContent = node.label;
    let meta = [];
    let content = '';
    if (node.kind === 'nation') {
      meta = [['Side',node.metadata.sides.join(' + ')],['Connections',connected.length]];
      content = `<a class="node-primary-link" href="nation.html?country=${encodeURIComponent(node.metadata.country)}">Open nation record</a>`;
    } else if (node.kind === 'location') {
      const observations = connected.filter(item=>item.kind==='observation').length;
      const nations = connected.filter(item=>item.kind==='nation').length;
      meta = [['Observations',observations],['Connected nations',nations],['All connections',connected.length]];
      content = nationNames.has(node.metadata.location)?`<a class="node-primary-link" href="nation.html?country=${encodeURIComponent(node.metadata.location)}">Open location record</a>`:'';
    } else if (node.kind === 'actor') {
      meta = [['Side',node.metadata.side],['Connections',connected.length]];
    } else if (node.kind === 'side') {
      const nations = connected.filter(item=>item.kind==='nation').length;
      const actors = connected.filter(item=>item.kind==='actor').length;
      meta = [['Side',node.metadata.side],['Nations',nations],['Actors',actors]];
    } else if (node.kind === 'observation' && node.metadata.recordType === 'candidate-event') {
      const event = node.metadata.event;
      meta = [['Date',event.date_start],['Place',event.place||event.country],['Fatalities',`${event.fatalities.low} / ${event.fatalities.best} / ${event.fatalities.high}`],['Sources',event.source_count],['Code status',event.code_status],['Location precision',event.location_precision]];
      content = `<div class="node-record"><h3>Source enclosure</h3><p>${esc(event.source_office||'No source office recorded')}</p><p>${esc(event.source_headline||'No source headline recorded')}</p><small>${esc(event.source_id)} · event ${esc(event.id)}</small></div>`;
    } else if (node.kind === 'observation') {
      const row = node.metadata.row;
      meta = [['Year',row.year],['Intensity',row.intensity],['Episode end',row.episode_end?'Yes':'No'],['Side A',row.side_a],['Side B',row.side_b]];
    } else if (node.kind === 'conflict') {
      showSummary(node.metadata.conflict);
      return;
    }
    $('#node-meta').innerHTML = meta.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('#node-content').innerHTML = content + connectionMarkup(connected);
    bindConnectionButtons();
  }

  function showSummary(conflict) {
    const graph = state.graph;
    const counts = kind => graph.nodes.filter(node=>node.kind===kind).length;
    $('#node-type').textContent = 'Network extent';
    $('#node-title').textContent = conflict.title;
    $('#node-meta').innerHTML = [['Side nodes',2],['Nations',counts('nation')],['Locations',counts('location')],['Observations',counts('observation')],['Actors',counts('actor')]].map(([label,value])=>`<div><span>${label}</span><strong>${value.toLocaleString()}</strong></div>`).join('');
    $('#node-content').innerHTML = `<div class="node-record"><h3>Temporal enclosure</h3><p>${esc(state.start)} through ${esc(state.end)}</p><small>${conflict.active_at_source_boundary?'Current at the loaded source boundary; temporal limit set to present.':'Closed before the loaded source boundary.'}</small></div>`;
  }

  function renderNetworkStats(conflict) {
    const graph = state.graph;
    const stats = [
      ['Side A', conflict.parties_a.join('; ') || 'Not coded'],
      ['Side B', conflict.parties_b.join('; ') || 'Not coded'],
      ['Network nodes', graph.nodes.length.toLocaleString()],
      ['Network relations', graph.edges.length.toLocaleString()],
      ['Conflict-year rows', graph.rows.length.toLocaleString()],
      ['Candidate events', graph.events.length.toLocaleString()]
    ];
    $('#network-summary').innerHTML = stats.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }

  function selectConflict(id, updateUrl=true) {
    const conflict = conflictsById.get(id);
    if (!conflict) return;
    state.conflictId = id;
    const bounds = conflictBounds(conflict);
    state.start = bounds.start;
    state.end = bounds.end;
    $('#network-start').min = bounds.start;
    $('#network-start').max = bounds.end;
    $('#network-start').value = bounds.start;
    $('#network-end').min = bounds.start;
    $('#network-end').max = bounds.end;
    $('#network-end').value = bounds.end;
    $('#network-title').textContent = conflict.title;
    $('#network-status').textContent = bounds.current ? `${bounds.start} through present · observed through ${bounds.observedEnd}` : `${bounds.start} through ${bounds.end}`;
    $('#conflict-record-link').href = `./?conflict=${encodeURIComponent(id)}#detail`;
    if (updateUrl) history.replaceState(null,'',`?conflict=${encodeURIComponent(id)}`);
    renderGraph();
  }

  function renderWarDialog() {
    const needle = $('#war-dialog-search').value.trim().toLowerCase();
    const region = $('#war-dialog-region').value;
    const matches = data.conflicts.filter(conflict => {
      if (region !== 'all' && conflict.region !== region) return false;
      if (!needle) return true;
      return [conflict.title,conflict.territory_name,conflict.region,conflict.type,...conflict.locations,...conflict.parties_a,...conflict.parties_b,...conflict.secondary_parties].join(' ').toLowerCase().includes(needle);
    }).sort((a,b)=>b.last_active_year-a.last_active_year||a.title.localeCompare(b.title));
    $('#war-dialog-count').textContent = `${matches.length} conflict${matches.length===1?'':'s'}`;
    $('#war-dialog-list').innerHTML = matches.map(conflict=>`<button type="button" data-war-id="${esc(conflict.id)}"><span><strong>${esc(conflict.title)}</strong><small>${esc(conflict.region)} · ${esc(conflict.type)} · ${esc(conflict.incompatibility)}</small></span><b>${conflict.first_active_year}-${conflict.active_at_source_boundary?'present':conflict.last_active_year}</b></button>`).join('') || '<p class="boundary-note">No conflict matches this address.</p>';
    document.querySelectorAll('[data-war-id]').forEach(button=>button.addEventListener('click',()=>{$('#war-dialog').close();selectConflict(button.dataset.warId);}));
  }

  function openWarDialog() {
    noteInteraction();
    $('#war-dialog-search').value = '';
    $('#war-dialog-region').value = 'all';
    renderWarDialog();
    $('#war-dialog').showModal();
    requestAnimationFrame(()=>$('#war-dialog-search').focus());
  }

  $('#war-dialog-open').addEventListener('click',openWarDialog);
  $('#network-war-select').addEventListener('click',openWarDialog);
  $('#war-dialog-search').addEventListener('input',renderWarDialog);
  $('#war-dialog-region').addEventListener('change',renderWarDialog);
  $('#war-dialog').addEventListener('click',event=>{if(event.target===$('#war-dialog'))$('#war-dialog').close();});
  $('#network-start').addEventListener('change',event=>{state.start=event.target.value;if(state.start>state.end){state.end=state.start;$('#network-end').value=state.end;}renderGraph();});
  $('#network-end').addEventListener('change',event=>{state.end=event.target.value;if(state.end<state.start){state.start=state.end;$('#network-start').value=state.start;}renderGraph();});
  $('#network-fit').addEventListener('click',()=>{noteInteraction();if(state.forceGraph&&state.renderMode==='3d')state.forceGraph.zoomToFit(500,70);else if(state.renderMode==='svg3d'&&state.svgScene){Object.assign(state.svgScene,{yaw:-.32,pitch:.22,zoom:1});state.svgScene.draw();}else if(window.Plotly)Plotly.relayout('network-canvas',{'xaxis.autorange':true,'yaxis.autorange':true});});
  $('#network-search').addEventListener('input',event=>{
    noteInteraction();
    const needle=event.target.value.trim().toLowerCase();
    if(!needle||!state.nodeMap.size)return;
    const match=[...state.nodeMap.values()].find(node=>node.label.toLowerCase().includes(needle));
    if(match){focusNode(match.id);selectGraphNode(match.id);}
  });
  $('#network-type').addEventListener('change',event=>{
    noteInteraction();
    state.nodeType=event.target.value;
    if(state.renderMode==='3d')update3DStyles();else if(state.graph)renderPlot();
  });
  $('#theme-toggle').addEventListener('click',()=>{
    const theme=currentTheme()?'light':'dark';
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('war-maps-theme',theme);}catch(error){ /* Theme still applies for this page. */ }
    if(state.conflictId)renderGraph();
  });

  renderWarDialog();
  const requested = new URLSearchParams(location.search).get('conflict');
  selectConflict(conflictsById.has(requested) ? requested : (conflictsById.has('ucdp-candidate-16905') ? 'ucdp-candidate-16905' : data.conflicts.at(-1).id), false);
})();
