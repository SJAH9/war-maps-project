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
  const state = {conflictId:'', start:'', end:'', graph:null,analysis:null,nodeMap:new Map(),positions:new Map(),nodeType:'all',organization:'force',forceGraph:null,forceNodes:new Map(),selected:'',connected:new Set(),resizeObserver:null,svgScene:null,renderMode:'2d',rotationTimer:null,rotationFrame:null,momentumFrame:null,layoutFrame:null,labelFrame:null,autoRotating:false,optimized:false,optimizedPositions:new Map(),inspectorView:'overview',similarEra:'all',corpusIndex:null};
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
  const inRange = (start, end, range=state) => end >= range.start && start <= range.end;
  const nodeId = (type, value) => `${type}:${value}`;
  const displayLocation = value => aliases[value] || value;
  const fatalityUsable = event => event?.fatality_estimate_valid && !String(event.code_status||'').includes('Check deaths');
  const currentTheme = () => document.documentElement.dataset.theme === 'dark';

  function conflictBounds(conflict) {
    const events = eventsByConflict.get(conflict.id) || [];
    const eventStarts = events.map(item => item.date_start).filter(Boolean).sort();
    const eventEnds = events.map(item => item.date_end || item.date_start).filter(Boolean).sort();
    const start = isoDate(conflict.start_date, eventStarts[0] || `${conflict.first_active_year}-01-01`);
    const observedEnd = eventEnds.at(-1) || conflict.end_date || `${conflict.last_active_year}-12-31`;
    return {start, end:conflict.active_at_source_boundary ? today : conflict.end_date || observedEnd, observedEnd, current:conflict.active_at_source_boundary};
  }

  function buildGraph(conflict, range=state) {
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
    (conflict.network_locations || conflict.plot_locations).forEach(addLocation);

    const rows = (yearsByConflict.get(conflict.id) || []).filter(row => inRange(`${row.year}-01-01`, `${row.year}-12-31`, range));
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

    const events = (eventsByConflict.get(conflict.id) || []).filter(event => inRange(event.date_start, event.date_end || event.date_start, range));
    events.forEach(event => {
      const location = displayLocation(event.network_location || event.country || event.place || 'Unspecified location');
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

  const xml = value => String(value ?? '').replace(/[<>&"']/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
  const graphmlData = (key, value) => value === null || value === undefined || value === '' ? '' : `<data key="${key}">${xml(value)}</data>`;

  function networkDataGraphML() {
    const conflict = conflictsById.get(state.conflictId);
    const graph = state.graph;
    if (!conflict || !graph) return '';
    const exportIds = new Map(graph.nodes.map((node,index)=>[node.id,`n${index}`]));
    const nations = new Map(data.nations.flatMap(nation => [[nation.country,nation],[nation.map_name,nation]]));
    const nodeAttributes = node => {
      const metadata=node.metadata||{},event=metadata.event;
      let latitude=null,longitude=null,fatalities=[null,null,null];
      if(event){
        latitude=Number.isFinite(Number(event.plot_latitude))?Number(event.plot_latitude):null;
        longitude=Number.isFinite(Number(event.plot_longitude))?Number(event.plot_longitude):null;
        if(fatalityUsable(event))fatalities=['low','best','high'].map(key=>Number(event.fatalities?.[key]||0));
      }else if(node.kind==='nation'){
        const centroid=nations.get(metadata.country)?.centroid;
        if(centroid){longitude=Number(centroid[0]);latitude=Number(centroid[1]);}
      }
      return {latitude,longitude,fatalities};
    };
    const observedEnd=graph.events.map(event=>event.date_end||event.date_start).filter(Boolean).sort().at(-1)||state.end;
    const exportDate=new Date().toISOString().slice(0,10);
    const keys = [
      ['g_conflict_id','graph','conflict_id','string'],['g_conflict_title','graph','conflict_title','string'],
      ['g_temporal_start','graph','temporal_start','string'],['g_temporal_end','graph','temporal_end','string'],
      ['g_display_end','graph','display_end','string'],['g_export_date','graph','export_date','string'],
      ['g_layer_scope','graph','layer_scope','string'],['g_included_conflicts','graph','included_conflicts','string'],
      ['g_dyad_ids','graph','dyad_ids','string'],['g_fatality_aggregation','graph','fatality_aggregation','string'],
      ['g_node_count','graph','node_count','int'],['g_edge_count','graph','edge_count','int'],
      ['n_original_id','node','original_id','string'],['n_label','node','label','string'],['n_kind','node','kind','string'],['n_group','node','group','string'],
      ['n_degree','node','degree','int'],['n_degree_centrality','node','degree_centrality','double'],
      ['n_betweenness','node','betweenness','double'],['n_network_role','node','network_role','string'],
      ['n_latitude','node','latitude','double'],['n_longitude','node','longitude','double'],
      ['n_fatalities_low','node','fatalities_low','long'],['n_fatalities_best','node','fatalities_best','long'],['n_fatalities_high','node','fatalities_high','long'],
      ['n_fatalities_side_a','node','fatalities_side_a','long'],['n_fatalities_side_b','node','fatalities_side_b','long'],
      ['n_fatalities_civilians','node','fatalities_civilians','long'],['n_fatalities_unknown','node','fatalities_unknown','long'],
      ['n_fatalities_children','node','fatalities_children','long'],['n_fatalities_children_status','node','fatalities_children_status','string'],
      ['n_fatality_estimate_valid','node','fatality_estimate_valid','boolean'],
      ['n_fatality_validation_issue','node','fatality_validation_issue','string'],['n_fatality_rollup_eligible','node','fatality_rollup_eligible','boolean'],
      ['n_record_class','node','record_class','string'],['n_map_point_eligible','node','map_point_eligible','boolean'],
      ['n_location_kind','node','location_kind','string'],['n_network_location','node','network_location','string'],
      ['n_target_class','node','target_class','string'],['n_alleged_perpetrator','node','alleged_perpetrator','string'],
      ['n_attribution_confidence','node','attribution_confidence','string'],['n_side_a','node','side_a','string'],['n_side_b','node','side_b','string'],
      ['n_record_type','node','record_type','string'],['n_country','node','country','string'],['n_location','node','location','string'],
      ['n_side','node','side','string'],['n_sides','node','sides','string'],['n_actor_name','node','actor_name','string'],
      ['n_date_start','node','date_start','string'],['n_date_end','node','date_end','string'],['n_year','node','year','int'],
      ['n_place','node','place','string'],['n_source_id','node','source_id','string'],['n_source_office','node','source_office','string'],
      ['n_source_headline','node','source_headline','string'],['n_source_count','node','source_count','int'],
      ['n_code_status','node','code_status','string'],['n_location_precision','node','location_precision','int'],
      ['n_intensity','node','intensity','int'],['n_episode_end','node','episode_end','boolean'],
      ['e_relation','edge','relation','string']
    ];
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
      ...keys.map(([id,target,name,type])=>`<key id="${id}" for="${target}" attr.name="${name}" attr.type="${type}"/>`),
      '<graph id="conflict-network" edgedefault="undirected">',
      graphmlData('g_conflict_id',conflict.id),graphmlData('g_conflict_title',conflict.title),
      graphmlData('g_temporal_start',state.start),graphmlData('g_temporal_end',observedEnd),
      graphmlData('g_display_end',state.end),graphmlData('g_export_date',exportDate),
      graphmlData('g_layer_scope',conflict.layer_scope||'UCDP source records for the selected conflict'),
      graphmlData('g_included_conflicts',(conflict.included_conflicts||[conflict.id]).join('|')),
      graphmlData('g_dyad_ids',(conflict.dyad_ids||[]).join('|')),
      graphmlData('g_fatality_aggregation','None. Candidate observations may overlap; location and conflict totals are not computed.'),
      graphmlData('g_node_count',graph.nodes.length),graphmlData('g_edge_count',graph.edges.length)
    ];
    graph.nodes.forEach(node => {
      const topology=node.networkScience||{},metadata=node.metadata||{},event=metadata.event||{},row=metadata.row||{};
      const {latitude,longitude,fatalities}=nodeAttributes(node);
      lines.push(`<node id="${exportIds.get(node.id)}">`,
        graphmlData('n_original_id',node.id),graphmlData('n_label',node.label),graphmlData('n_kind',node.kind),graphmlData('n_group',node.group),
        graphmlData('n_degree',topology.degree),graphmlData('n_degree_centrality',topology.degreeCentrality),
        graphmlData('n_betweenness',topology.betweenness),graphmlData('n_network_role',topology.role),
        graphmlData('n_latitude',latitude),graphmlData('n_longitude',longitude),
        graphmlData('n_fatalities_low',fatalities[0]),graphmlData('n_fatalities_best',fatalities[1]),graphmlData('n_fatalities_high',fatalities[2]),
        graphmlData('n_fatalities_side_a',event.fatalities?.side_a),graphmlData('n_fatalities_side_b',event.fatalities?.side_b),
        graphmlData('n_fatalities_civilians',event.fatalities?.civilians),graphmlData('n_fatalities_unknown',event.fatalities?.unknown),
        graphmlData('n_fatalities_children',event.fatalities_children),graphmlData('n_fatalities_children_status',event.fatalities_children_status),
        graphmlData('n_fatality_estimate_valid',event.fatality_estimate_valid),
        graphmlData('n_fatality_validation_issue',event.fatality_validation_issue),graphmlData('n_fatality_rollup_eligible',event.fatality_rollup_eligible),
        graphmlData('n_record_class',event.record_class),graphmlData('n_map_point_eligible',event.map_point_eligible),
        graphmlData('n_location_kind',event.location_kind),graphmlData('n_network_location',event.network_location),
        graphmlData('n_target_class',event.target_class),graphmlData('n_alleged_perpetrator',event.alleged_perpetrator),
        graphmlData('n_attribution_confidence',event.attribution_confidence),graphmlData('n_side_a',event.side_a),graphmlData('n_side_b',event.side_b),
        graphmlData('n_record_type',metadata.recordType),graphmlData('n_country',metadata.country||event.country),
        graphmlData('n_location',metadata.location),graphmlData('n_side',metadata.side),graphmlData('n_sides',metadata.sides?.join('|')),
        graphmlData('n_actor_name',metadata.name),graphmlData('n_date_start',event.date_start),graphmlData('n_date_end',event.date_end),
        graphmlData('n_year',row.year),graphmlData('n_place',event.place),graphmlData('n_source_id',event.source_id),
        graphmlData('n_source_office',event.source_office),graphmlData('n_source_headline',event.source_headline),
        graphmlData('n_source_count',event.source_count),graphmlData('n_code_status',event.code_status),
        graphmlData('n_location_precision',event.location_precision),graphmlData('n_intensity',row.intensity),
        graphmlData('n_episode_end',row.episode_end),'</node>');
    });
    graph.edges.forEach((edge,index)=>lines.push(`<edge id="e${index}" source="${exportIds.get(edge.from)}" target="${exportIds.get(edge.to)}">`,graphmlData('e_relation',edge.relation),'</edge>'));
    lines.push('</graph>','</graphml>');
    return `${lines.join('\n')}\n`;
  }

  function viewNetworkData() {
    const text = networkDataGraphML();
    if (!text) return;
    const conflict=conflictsById.get(state.conflictId);
    const slug=String(conflict?.title||conflict?.id||'conflict-network').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const observedEnd=state.graph.events.map(event=>event.date_end||event.date_start).filter(Boolean).sort().at(-1)||state.end;
    const filename=`war-maps-${slug}-${state.start}-${observedEnd}.graphml`;
    const url = URL.createObjectURL(new Blob([text], {type:'application/xml;charset=utf-8'}));
    const viewer=window.open('', '_blank');
    if(!viewer){
      const download=document.createElement('a');download.href=url;download.download=filename;download.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);return;
    }
    viewer.document.open();
    viewer.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Conflict network GraphML</title><style>html{color-scheme:dark}body{margin:0;background:#0b0e0c;color:#e7dfbd;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 18px;border-bottom:1px solid #4d4b3c;background:#151914}strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}a{flex:0 0 auto;padding:8px 12px;border:1px solid #f07800;color:#f4f1e4;font:700 13px/1.2 system-ui;text-decoration:none}pre{margin:0;padding:18px;white-space:pre;tab-size:2}</style></head><body><header><strong id="filename"></strong><a id="download">Download GraphML</a></header><pre id="graphml"></pre></body></html>');
    viewer.document.close();
    viewer.document.getElementById('filename').textContent=filename;
    const download=viewer.document.getElementById('download');download.href=url;download.download=filename;
    viewer.document.getElementById('graphml').textContent=text;
    viewer.opener=null;
    window.setTimeout(()=>URL.revokeObjectURL(url),600000);
  }

  function analyzeGraph(graph) {
    const adjacency=new Map(graph.nodes.map(node=>[node.id,new Set()]));
    graph.edges.forEach(edge=>{adjacency.get(edge.from)?.add(edge.to);adjacency.get(edge.to)?.add(edge.from);});
    const uniqueEdges=[...new Set(graph.edges.map(edge=>[edge.from,edge.to].sort().join('|')))];
    const n=graph.nodes.length;
    let betweenness=Object.fromEntries(graph.nodes.map(node=>[node.id,0]));
    let components=[];
    let engine='topology fallback';
    let betweennessScope='all visible nodes';
    try{
      if(!window.graphology||!window.graphologyLibrary)throw new Error('Graphology unavailable');
      const topology=new window.graphology.UndirectedGraph({allowSelfLoops:false});
      graph.nodes.forEach(node=>topology.addNode(node.id));
      graph.edges.forEach(edge=>{if(edge.from!==edge.to)topology.mergeUndirectedEdge(edge.from,edge.to);});
      components=window.graphologyLibrary.components.connectedComponents(topology);
      const centralityIds=n>1200?graph.nodes.filter(node=>node.kind!=='observation').map(node=>node.id):graph.nodes.map(node=>node.id);
      if(n>1200)betweennessScope='structural nodes; observation leaves excluded for responsiveness';
      const centralitySet=new Set(centralityIds);
      const centralityTopology=new window.graphology.UndirectedGraph({allowSelfLoops:false});
      centralityIds.forEach(id=>centralityTopology.addNode(id));
      graph.edges.forEach(edge=>{if(edge.from!==edge.to&&centralitySet.has(edge.from)&&centralitySet.has(edge.to))centralityTopology.mergeUndirectedEdge(edge.from,edge.to);});
      betweenness={...betweenness,...window.graphologyLibrary.metrics.centrality.betweenness(centralityTopology,{getEdgeWeight:null,normalized:true})};
      engine='Graphology';
    }catch(error){
      const unseen=new Set(adjacency.keys());
      while(unseen.size){const first=unseen.values().next().value,component=[],queue=[first];unseen.delete(first);while(queue.length){const id=queue.shift();component.push(id);adjacency.get(id).forEach(neighbor=>{if(unseen.delete(neighbor))queue.push(neighbor);});}components.push(component);}
    }
    const degrees=graph.nodes.map(node=>adjacency.get(node.id).size).sort((a,b)=>a-b);
    const hubThreshold=degrees[Math.max(0,Math.ceil(degrees.length*.9)-1)]||0;
    const positiveBetweenness=Object.values(betweenness).filter(value=>value>0).sort((a,b)=>a-b);
    const bottleneckThreshold=positiveBetweenness[Math.max(0,Math.ceil(positiveBetweenness.length*.9)-1)]||Infinity;
    graph.nodes.forEach(node=>{
      const degree=adjacency.get(node.id).size;
      const between=Number(betweenness[node.id]||0);
      const hub=degree>0&&degree>=hubThreshold;
      const bottleneck=between>0&&between>=bottleneckThreshold;
      node.networkScience={degree,degreeCentrality:n>1?degree/(n-1):0,betweenness:between,role:hub&&bottleneck?'hub + bottleneck':hub?'hub':bottleneck?'bottleneck':'peripheral'};
    });
    const distribution=new Map();degrees.forEach(degree=>distribution.set(degree,(distribution.get(degree)||0)+1));
    return {
      engine,
      betweennessScope,
      components:components.length,
      largestComponent:Math.max(0,...components.map(component=>component.length)),
      density:n>1?(2*uniqueEdges.length)/(n*(n-1)):0,
      maxDegree:degrees.at(-1)||0,
      meanDegree:n?(2*uniqueEdges.length)/n:0,
      hubCount:graph.nodes.filter(node=>node.networkScience.role.includes('hub')).length,
      bottleneckCount:graph.nodes.filter(node=>node.networkScience.role.includes('bottleneck')).length,
      degreeDistribution:[...distribution.entries()].map(([degree,count])=>({degree,count}))
    };
  }

  const nodeTopologyScale = node => 1+Math.min(.72,Math.log2(1+(node.networkScience?.degree||0))*.11);
  const candidateFatalities = node => {
    const event=node.metadata?.recordType==='candidate-event'?node.metadata.event:null;
    const value=fatalityUsable(event)?Number(event.fatalities?.best||0):0;
    return Number.isFinite(value)&&value>0?value:0;
  };
  const nodeVisualScale = node => node.metadata?.recordType==='candidate-event'
    ? .8+Math.min(2.35,Math.log10(1+candidateFatalities(node))*.58)
    : nodeTopologyScale(node);

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
    if(isHighlightedLink(link))return 4.2;
    const relation=linkRelation(link);
    if(relation==='belligerent side')return 3.1;
    if(relation==='participant'||relation==='state participant')return 2.1;
    if(relation==='conflict location')return 2.35;
    return state.graph?.edges.length>900?.9:1.55;
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

  function stopMotion() {
    cancelAnimationFrame(state.momentumFrame);state.momentumFrame=null;
    cancelAnimationFrame(state.layoutFrame);state.layoutFrame=null;
  }

  function optimizedNodePositions(nodes) {
    const kindOrder={conflict:0,side:1,nation:2,actor:3,location:4,observation:5};
    const ordered=[...nodes].sort((a,b)=>(kindOrder[a.kind]??9)-(kindOrder[b.kind]??9)||nodeDisplayLabel(a).localeCompare(nodeDisplayLabel(b))||a.id.localeCompare(b.id));
    const positions=new Map();
    let area=0;
    ordered.forEach((node,index)=>{
      if(index===0&&node.kind==='conflict'){positions.set(node.id,{x:0,y:0,z:0});return;}
      const scale=nodeVisualScale(node);
      area+=1.15+scale*scale*.34;
      const angle=area*2.399963229728653;
      const radius=25*Math.sqrt(area);
      positions.set(node.id,{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,z:0});
    });
    return positions;
  }

  function animateOptimizedLayout(nodes,targets,draw,complete) {
    cancelAnimationFrame(state.layoutFrame);
    const starts=new Map(nodes.map(node=>[node.id,{x:node.x||0,y:node.y||0,z:node.z||0}]));
    const started=performance.now(),duration=1450;
    const tick=timestamp=>{
      const progress=Math.min(1,(timestamp-started)/duration);
      const eased=1-Math.pow(1-progress,3);
      nodes.forEach(node=>{
        const from=starts.get(node.id),to=targets.get(node.id);if(!to)return;
        node.x=from.x+(to.x-from.x)*eased;node.y=from.y+(to.y-from.y)*eased;node.z=from.z+(to.z-from.z)*eased;
        if('fx' in node||state.renderMode==='3d'){node.fx=node.x;node.fy=node.y;node.fz=node.z;}
      });
      draw?.();
      if(progress<1)state.layoutFrame=requestAnimationFrame(tick);
      else{state.layoutFrame=null;complete?.();}
    };
    state.layoutFrame=requestAnimationFrame(tick);
  }

  function optimizeView() {
    if(!state.graph)return;
    noteInteraction();stopMotion();
    state.optimized=true;
    state.optimizedPositions=optimizedNodePositions(state.graph.nodes);
    $('#network-optimize')?.setAttribute('aria-pressed','true');
    if(state.renderMode==='3d'&&state.forceGraph){
      const nodes=state.forceGraph.graphData().nodes;
      animateOptimizedLayout(nodes,state.optimizedPositions,()=>state.forceGraph.refresh(),()=>state.forceGraph.zoomToFit(700,90));
      state.forceGraph.linkCurvature?.(link=>.08+(Math.abs([...`${endpointId(link.source)}|${endpointId(link.target)}`].reduce((sum,char)=>sum+char.charCodeAt(0),0))%5)*.025).refresh();
      return;
    }
    if(state.renderMode==='svg3d'&&state.svgScene){
      const scene=state.svgScene;
      scene.yaw=0;scene.pitch=.12;
      animateOptimizedLayout(scene.nodes,state.optimizedPositions,scene.draw,()=>scene.draw());
      return;
    }
    state.positions=new Map([...state.optimizedPositions].map(([id,point])=>[id,{x:point.x/52,y:point.y/52}]));
    renderPlot();
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
      .linkOpacity(.58)
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
    const size=(sizes[node.kind]||4)*nodeVisualScale(node);
    const geometries={
      conflict:()=>new THREE.OctahedronGeometry(size,0),
      side:()=>new THREE.ConeGeometry(size*.82,size*1.8,8),
      nation:()=>new THREE.BoxGeometry(size*1.45,size*1.45,size*1.45),
      location:()=>new THREE.CylinderGeometry(size*.78,size*.78,size*1.45,8),
      actor:()=>new THREE.SphereGeometry(size,12,8),
      observation:()=>new THREE.TetrahedronGeometry(size,0)
    };
    const color=nodeBaseColor(node),material=new THREE.MeshPhongMaterial({color,emissive:color,emissiveIntensity:.08,shininess:8,flatShading:true,transparent:true,opacity:.96,depthTest:false});
    const mesh=new THREE.Mesh((geometries[node.kind]||geometries.actor)(),material);mesh.userData.nodeId=node.id;mesh.renderOrder=3;return mesh;
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
      const val=({conflict:14,side:10,nation:8,location:7,actor:5,observation:1.4}[node.kind]||3)*nodeVisualScale(node);
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
      .nodeLabel(node=>`<b>${esc(nodeDisplayLabel(node))}</b><br><small>${esc(node.kind)} · degree ${node.networkScience?.degree||0} · ${esc(node.networkScience?.role||'peripheral')}${node.metadata?.recordType==='candidate-event'?` · ${candidateFatalities(node).toLocaleString()} best fatalities`:''}</small>`)
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
      .onNodeDragEnd(node=>{
        noteInteraction();node.fx=node.x;node.fy=node.y;node.fz=node.z;
        clearTimeout(node._settleTimer);
        node._settleTimer=setTimeout(()=>{
          if(state.optimized&&state.optimizedPositions.has(node.id))animateOptimizedLayout([node],state.optimizedPositions,()=>graph.refresh());
          else{node.fx=undefined;node.fy=undefined;node.fz=undefined;graph.d3ReheatSimulation();}
        },320);
      })
      .onBackgroundClick(()=>selectGraphNode(''))
      .onNodeHover(node=>{container.style.cursor=node?'pointer':'grab';})
      .warmupTicks(graphNodes.length>700?35:70)
      .cooldownTicks(graphNodes.length>700?80:150)
      .graphData({nodes:graphNodes,links:graphLinks});
    graph.d3Force('charge')?.strength(graphNodes.length>700?-28:-65);
    graph.d3Force('link')?.distance(link=>link.relation.includes('observation')||link.relation==='candidate event'?24:52);
    graph.d3AlphaDecay?.(.012);
    graph.d3VelocityDecay?.(.18);
    graph.d3ReheatSimulation();
    graph.cameraPosition({x:0,y:0,z:520},{x:0,y:0,z:0},0);
    setTimeout(()=>graph.zoomToFit(600,70),500);
    let initiallyFitted=false;
    graph.onEngineStop(()=>{if(!initiallyFitted){initiallyFitted=true;graph.zoomToFit(550,70);}});
    state.forceGraph=graph;
    state.renderMode='3d';
    const controls=graph.controls();
    controls.enableRotate=true;
    controls.enableZoom=true;
    controls.enablePan=false;
    controls.rotateSpeed=.65;
    controls.enableDamping=true;
    controls.dampingFactor=.06;
    controls.addEventListener('start',noteInteraction);
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
        let paintedPixels=0;const paintedBins=new Set(),binWidth=Math.max(1,width/10),binHeight=Math.max(1,height/8);
        for(let y=0;y<height;y+=4)for(let x=0;x<width;x+=4){const index=(y*width+x)*4;if(pixels[index]>22||pixels[index+1]>22||pixels[index+2]>22){paintedPixels++;paintedBins.add(`${Math.floor(x/binWidth)}:${Math.floor(y/binHeight)}`);}}
        if(paintedPixels<=700||paintedBins.size<12)renderSVG3D();
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
    const nodes=state.graph.nodes.map(node=>{const point=state.positions.get(node.id);let hash=0;for(const char of node.id)hash=(hash*31+char.charCodeAt(0))|0;const x=point.x*52,y=point.y*52,z=((Math.abs(hash)%201)-100)*(node.kind==='observation'?1.1:2.1);return {...node,x,y,z,homeX:x,homeY:y,homeZ:z};});
    const nodeMap=new Map(nodes.map(node=>[node.id,node]));
    const edgeElements=state.graph.edges.map(edge=>{const line=document.createElementNS(ns,'line');line.dataset.source=edge.from;line.dataset.target=edge.to;edgeLayer.append(line);return {edge,line};});
    const radii={conflict:13,side:11,nation:9,location:8,actor:7,observation:3};
    const nodeElements=new Map();
    nodes.forEach(node=>{const group=document.createElementNS(ns,'g');group.dataset.nodeId=node.id;group.dataset.nodeKind=node.kind;group.classList.add('network-svg-node');const glyph=createSvgGlyph(node,ns);const title=document.createElementNS(ns,'title');title.textContent=`${nodeDisplayLabel(node)} · ${node.kind}`;glyph.append(title);group.append(glyph);if(hasPersistentLabel(node)){const label=document.createElementNS(ns,'text');label.textContent=nodeDisplayLabel(node);group.append(label);}nodeLayer.append(group);nodeElements.set(node.id,{group,glyph,label:group.querySelector('text')});});
    const scene={yaw:-.32,pitch:.22,zoom:1,width:1,height:1,nodes,nodeMap,edgeElements,nodeElements,drag:null,moved:false,velocityYaw:0,velocityPitch:0};
    const project=node=>{const cy=Math.cos(scene.yaw),sy=Math.sin(scene.yaw),cp=Math.cos(scene.pitch),sp=Math.sin(scene.pitch);const x1=node.x*cy+node.z*sy;const z1=-node.x*sy+node.z*cy;const y1=node.y*cp-z1*sp;const z2=node.y*sp+z1*cp;const scale=scene.zoom*760/(980+z2);return {x:scene.width/2+x1*scale,y:scene.height/2+y1*scale,z:z2,scale};};
    scene.draw=()=>{
      const projected=new Map(nodes.map(node=>[node.id,project(node)]));
      edgeElements.forEach(({edge,line})=>{const from=projected.get(edge.from),to=projected.get(edge.to);line.setAttribute('x1',from.x);line.setAttribute('y1',from.y);line.setAttribute('x2',to.x);line.setAttribute('y2',to.y);line.setAttribute('stroke',linkBaseColor({source:edge.from,target:edge.to,relation:edge.relation}));line.setAttribute('stroke-width',linkBaseWidth({source:edge.from,target:edge.to,relation:edge.relation}));line.setAttribute('opacity',isHighlightedLink({source:edge.from,target:edge.to})?'1':'.92');});
      nodes.sort((a,b)=>projected.get(a.id).z-projected.get(b.id).z).forEach(node=>nodeLayer.append(nodeElements.get(node.id).group));
      nodes.forEach(node=>{const point=projected.get(node.id),parts=nodeElements.get(node.id);const classMatch=state.nodeType==='all'||node.kind===state.nodeType;const connectionMatch=!state.selected||state.connected.has(node.id);const radius=Math.max(2,radii[node.kind]*nodeVisualScale(node)*point.scale);parts.group.setAttribute('transform',`translate(${point.x} ${point.y})`);parts.group.setAttribute('opacity',classMatch&&connectionMatch?'1':'.13');sizeSvgGlyph(parts.glyph,node.kind,radius);parts.glyph.setAttribute('fill',nodeBaseColor(node));parts.glyph.setAttribute('stroke',state.selected===node.id?'#ffd500':'#d8c58f');parts.glyph.setAttribute('stroke-width',state.selected===node.id?'2.5':'1');if(parts.label){parts.label.setAttribute('y',-(radius+5));parts.label.setAttribute('fill',currentTheme()?'#e4d6ad':'#17150f');}});
    };
    const resize=()=>{const box=container.getBoundingClientRect();scene.width=Math.max(320,box.width);scene.height=Math.max(420,box.height);svg.setAttribute('viewBox',`0 0 ${scene.width} ${scene.height}`);scene.draw();};
    svg.addEventListener('pointerdown',event=>{noteInteraction();stopMotion();const group=event.target.closest?.('[data-node-id]');scene.drag={x:event.clientX,y:event.clientY,node:group?nodeMap.get(group.dataset.nodeId):null};scene.moved=false;scene.velocityYaw=0;scene.velocityPitch=0;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)scene.moved=true;if(scene.drag.node){scene.drag.node.x+=dx/scene.zoom;scene.drag.node.y+=dy/scene.zoom;}else{scene.velocityYaw=dx*.008;scene.velocityPitch=dy*.008;scene.yaw+=scene.velocityYaw;scene.pitch=Math.max(-1.35,Math.min(1.35,scene.pitch+scene.velocityPitch));}scene.drag.x=event.clientX;scene.drag.y=event.clientY;scene.draw();});
    svg.addEventListener('pointerup',event=>{
      if(!scene.drag)return;const node=scene.drag.node,moved=scene.moved;scene.drag=null;svg.releasePointerCapture(event.pointerId);
      if(!moved){selectGraphNode(node?.id||'');return;}
      if(node){const target=state.optimizedPositions.get(node.id)||{x:node.homeX,y:node.homeY,z:node.homeZ};setTimeout(()=>animateOptimizedLayout([node],new Map([[node.id,target]]),scene.draw),320);return;}
      const coast=()=>{scene.velocityYaw*=.94;scene.velocityPitch*=.94;if(Math.abs(scene.velocityYaw)+Math.abs(scene.velocityPitch)<.00025){state.momentumFrame=null;return;}scene.yaw+=scene.velocityYaw;scene.pitch=Math.max(-1.35,Math.min(1.35,scene.pitch+scene.velocityPitch));scene.draw();state.momentumFrame=requestAnimationFrame(coast);};
      state.momentumFrame=requestAnimationFrame(coast);
    });
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
      traces.push({type:'scatter',mode:showText?'markers+text':'markers',name:setting.label,x:nodes.map(node=>state.positions.get(node.id).x),y:nodes.map(node=>state.positions.get(node.id).y),customdata:nodes.map(node=>node.id),hovertext:nodes.map(node=>`${nodeDisplayLabel(node)} · degree ${node.networkScience?.degree||0} · ${node.networkScience?.role||'peripheral'}${node.metadata?.recordType==='candidate-event'?` · ${candidateFatalities(node).toLocaleString()} best fatalities`:''}`),hovertemplate:'<b>%{hovertext}</b><extra>'+setting.label+'</extra>',text:showText?nodes.map(node=>nodeDisplayLabel(node)):undefined,textposition:'top center',textfont:{color:dark?'#d9d9d2':'#303632',size:10,family:'Inter, Arial, sans-serif'},marker:{size:nodes.map(node=>setting.size*nodeVisualScale(node)),symbol:setting.symbol,color:nodeColors[group].background,line:{color:nodeColors[group].border,width:1}},opacity:emphasized?1:.1});
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
    stopAutoRotation();stopMotion();
    state.graph = buildGraph(conflict);
    state.analysis = analyzeGraph(state.graph);
    state.nodeMap = new Map(state.graph.nodes.map(node=>[node.id,node]));
    state.positions = positionGraph(state.graph);
    state.selected='';state.connected=new Set();state.optimized=false;state.optimizedPositions.clear();state.organization='force';if($('#network-organization'))$('#network-organization').value='force';$('#network-optimize')?.setAttribute('aria-pressed','false');
    if(!window.ForceGraph3D)throw new Error('3D network renderer unavailable');
    render3D();
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

  const nodeYear = (node, conflict) => {
    if (node.metadata?.row?.year) return Number(node.metadata.row.year);
    if (node.metadata?.event?.date_start) return Number(node.metadata.event.date_start.slice(0,4));
    return Number(conflict.last_active_year || conflict.first_active_year);
  };

  function buildCorpusIndex() {
    if (state.corpusIndex) return state.corpusIndex;
    const byKind = new Map();
    data.conflicts.forEach(conflict => {
      const bounds = conflictBounds(conflict);
      const graph = buildGraph(conflict, bounds);
      const corpusNodeMap=new Map(graph.nodes.map(node=>[node.id,node]));
      const adjacency = new Map(graph.nodes.map(node=>[node.id,new Set()]));
      graph.edges.forEach(edge=>{adjacency.get(edge.from)?.add(edge.to);adjacency.get(edge.to)?.add(edge.from);});
      const degrees=[...adjacency.values()].map(neighbors=>neighbors.size).sort((a,b)=>a-b);
      graph.nodes.forEach(node => {
        if (!byKind.has(node.kind)) byKind.set(node.kind, []);
        const neighbors=[...(adjacency.get(node.id)||[])].map(id=>corpusNodeMap.get(id)).filter(Boolean);
        const neighborCounts={};neighbors.forEach(item=>{neighborCounts[item.kind]=(neighborCounts[item.kind]||0)+1;});
        const degree=neighbors.length;
        const degreePercentile=degrees.length?degrees.filter(value=>value<=degree).length/degrees.length:0;
        byKind.get(node.kind).push({node,conflict,degree,degreeCentrality:graph.nodes.length>1?degree/(graph.nodes.length-1):0,degreePercentile,neighborCounts,year:nodeYear(node,conflict),current:Boolean(conflict.active_at_source_boundary)});
      });
    });
    state.corpusIndex = byKind;
    return byKind;
  }

  function similarityScore(source, candidate) {
    let score=.15;
    const reasons=['same node type'];
    const percentileMatch=1-Math.abs(source.degreePercentile-candidate.degreePercentile);
    score+=percentileMatch*.30;
    if(percentileMatch>=.85)reasons.push('same relative degree');
    const kinds=new Set([...Object.keys(source.neighborCounts),...Object.keys(candidate.neighborCounts)]);
    const sourceTotal=Math.max(1,source.degree),candidateTotal=Math.max(1,candidate.degree);
    let neighborDistance=0;
    kinds.forEach(kind=>{neighborDistance+=Math.abs((source.neighborCounts[kind]||0)/sourceTotal-(candidate.neighborCounts[kind]||0)/candidateTotal);});
    const neighborMatch=Math.max(0,1-neighborDistance/2);
    score+=neighborMatch*.35;
    if(neighborMatch>=.8)reasons.push('similar connected types');
    const centralityMax=Math.max(.000001,source.degreeCentrality,candidate.degreeCentrality);
    const centralityMatch=1-Math.abs(source.degreeCentrality-candidate.degreeCentrality)/centralityMax;
    score+=Math.max(0,centralityMatch)*.10;
    if(centralityMatch>=.75)reasons.push('similar network share');
    const sourceRole=source.degreePercentile>=.9?'hub':'peripheral';
    const candidateRole=candidate.degreePercentile>=.9?'hub':'peripheral';
    if(sourceRole===candidateRole){score+=.05;reasons.push(`same ${sourceRole} position`);}
    if(source.conflict.type===candidate.conflict.type){score+=.05;reasons.push('same conflict type');}
    return {score,reasons};
  }

  function similarNodes(node) {
    const conflict=conflictsById.get(state.conflictId);
    const connected=connectedNodes(node.id);
    const neighborCounts={};connected.forEach(item=>{neighborCounts[item.kind]=(neighborCounts[item.kind]||0)+1;});
    const degrees=state.graph.nodes.map(item=>item.networkScience?.degree||0).sort((a,b)=>a-b);
    const degree=node.networkScience?.degree||0;
    const source={node,conflict,degree,degreeCentrality:node.networkScience?.degreeCentrality||0,degreePercentile:degrees.length?degrees.filter(value=>value<=degree).length/degrees.length:0,neighborCounts,year:nodeYear(node,conflict),current:Boolean(conflict.active_at_source_boundary)};
    const candidates=buildCorpusIndex().get(node.kind)||[];
    return candidates
      .filter(item=>item.conflict.id!==state.conflictId)
      .filter(item=>state.similarEra==='all'||(state.similarEra==='present'?item.current:!item.current))
      .map(item=>({...item,...similarityScore(source,item)}))
      .filter(item=>item.score>.12)
      .sort((a,b)=>b.score-a.score||b.year-a.year||a.node.label.localeCompare(b.node.label))
      .slice(0,12);
  }

  function bindSimilarResults() {
    document.querySelectorAll('[data-similar-conflict]').forEach(button=>button.addEventListener('click',()=>{
      const conflictId=button.dataset.similarConflict,nodeIdValue=button.dataset.similarNode;
      selectConflict(conflictId);
      const matched=state.nodeMap.get(nodeIdValue);
      if(matched){focusNode(nodeIdValue);selectGraphNode(nodeIdValue);setInspectorView('overview');}
    }));
  }

  function renderSimilarNodes(node) {
    const list=$('#node-similar-list');
    if(!list)return;
    const results=similarNodes(node);
    list.innerHTML=`<p class="similar-disclosure">Structural matches across ${data.conflicts.length.toLocaleString()} conflict records. Scores compare node type, relative degree, degree centrality, and the proportional mix of connected node types. They do not assert equivalence or causation.</p>${results.length?`<div class="similar-list">${results.map(item=>`<button type="button" data-similar-conflict="${esc(item.conflict.id)}" data-similar-node="${esc(item.node.id)}"><i class="node-glyph ${esc(item.node.group)}" aria-hidden="true"></i><span><strong>${esc(item.node.label)}</strong><small>${esc(item.conflict.title)} · ${item.conflict.first_active_year}-${item.current?'present':item.conflict.last_active_year}</small><em>${esc(item.reasons.slice(0,3).join(' · '))}</em></span><b>${Math.round(Math.min(1,item.score)*100)}%</b></button>`).join('')}</div>`:'<p class="similar-status">No comparable nodes meet this period and structural threshold.</p>'}`;
    bindSimilarResults();
  }

  function setInspectorView(view) {
    if(view==='similar'&&!state.selected)return;
    state.inspectorView=view;
    document.querySelectorAll('[data-inspector-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.inspectorView===view)));
    $('#node-overview').hidden=view!=='overview';
    $('#node-similar').hidden=view!=='similar';
    if(view==='similar')renderSimilarNodes(state.nodeMap.get(state.selected));
  }

  function showNode(id) {
    const node = state.nodeMap.get(id);
    if (!node) return;
    const connected = connectedNodes(id);
    $('#node-type').textContent = `Selected node · ${node.kind}`;
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
      const fatalityLabel=fatalityUsable(event)?`${event.fatalities.low} / ${event.fatalities.best} / ${event.fatalities.high}`:`Not used (${event.fatality_validation_issue||event.code_status||'source range unavailable'})`;
      meta = [['Date',event.date_start],['Place',event.place||event.country],['Network location',event.network_location],['Location kind',event.location_kind],['Fatalities low / best / high',fatalityLabel],['Record class',event.record_class],['Sources',event.source_count],['Code status',event.code_status],['Location precision',event.location_precision],['Map point',event.map_point_eligible?'Eligible':'Withheld']];
      content = `<div class="node-record"><h3>Source enclosure</h3><p>${esc(event.source_office||'No source office recorded')}</p><p>${esc(event.source_headline||'No source headline recorded')}</p><small>${esc(event.source_id)} · event ${esc(event.id)}</small></div>`;
    } else if (node.kind === 'observation') {
      const row = node.metadata.row;
      meta = [['Year',row.year],['Intensity',row.intensity],['Episode end',row.episode_end?'Yes':'No'],['Side A',row.side_a],['Side B',row.side_b]];
    } else if (node.kind === 'conflict') {
      showSummary(node.metadata.conflict);
      return;
    }
    const topology=node.networkScience;
    if(topology){
      const degrees=state.graph.nodes.map(item=>item.networkScience?.degree||0).sort((a,b)=>a-b);
      const percentile=degrees.length?degrees.filter(value=>value<=topology.degree).length/degrees.length:0;
      const connectedTypes={};connected.forEach(item=>{connectedTypes[item.kind]=(connectedTypes[item.kind]||0)+1;});
      meta.push(
        ['Degree',topology.degree],
        ['Relative degree',`${Math.round(percentile*100)}% of nodes or lower`],
        ['Degree centrality',`${(topology.degreeCentrality*100).toFixed(2)}%`],
        ['Betweenness',topology.betweenness?topology.betweenness.toFixed(4):'0'],
        ['Network role',topology.role],
        ['Connected types',Object.entries(connectedTypes).sort((a,b)=>b[1]-a[1]).map(([kind,count])=>`${kind} ${count}`).join(' · ')||'None']
      );
    }
    $('#node-meta').innerHTML = meta.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('#node-overview').innerHTML = `${content}<button class="find-similar-button" id="find-similar-nodes" type="button">Find similar nodes</button>${connectionMarkup(connected)}`;
    const similarTab=$('[data-inspector-view="similar"]');
    similarTab.disabled=false;
    state.inspectorView='overview';
    setInspectorView('overview');
    $('#find-similar-nodes').addEventListener('click',()=>setInspectorView('similar'));
    bindConnectionButtons();
  }

  function showSummary(conflict) {
    const graph = state.graph;
    const counts = kind => graph.nodes.filter(node=>node.kind===kind).length;
    $('#node-type').textContent = 'Network extent';
    $('#node-title').textContent = conflict.title;
    const analysis=state.analysis;
    $('#node-meta').innerHTML = [['Side nodes',2],['Nations',counts('nation')],['Locations',counts('location')],['Observations',counts('observation')],['Actors',counts('actor')],['Components',analysis.components],['Density',analysis.density.toFixed(4)],['Peak degree',analysis.maxDegree]].map(([label,value])=>`<div><span>${label}</span><strong>${typeof value==='number'?value.toLocaleString():esc(value)}</strong></div>`).join('');
    const observedEnd=graph.events.map(event=>event.date_end||event.date_start).filter(Boolean).sort().at(-1)||state.end;
    const staleDays=Math.max(0,Math.floor((Date.now()-new Date(`${observedEnd}T00:00:00Z`).getTime())/86400000));
    $('#node-overview').innerHTML = `<div class="node-record"><h3>Layer scope</h3><p>${esc(conflict.layer_scope||'UCDP records for the selected conflict')}</p><small>${esc(conflict.excluded_fronts||'Other conflict records are outside this graph.')} Fatality totals are not computed because candidate observations may overlap.</small></div><div class="node-record"><h3>Temporal enclosure</h3><p>${esc(state.start)} through ${esc(state.end)}</p><small>Observed through ${esc(observedEnd)}.${staleDays>30?` Source boundary is ${staleDays.toLocaleString()} days behind the export clock.`:''}</small></div><div class="node-record"><h3>Network-science reading</h3><p>Node size responds to observed degree. Hub marks the top degree decile in this selected conflict and period; bottleneck marks the top positive betweenness decile.</p><small>${esc(analysis.engine)} · Betweenness scope: ${esc(analysis.betweennessScope)}. These are structural descriptions, not claims of command, intent, or causation.</small></div>`;
    state.inspectorView='overview';
    state.selected='';
    $('[data-inspector-view="similar"]').disabled=true;
    $('#node-similar-list').innerHTML='';
    setInspectorView('overview');
  }

  function renderNetworkStats(conflict) {
    const graph = state.graph;
    const stats = [
      ['Side A', conflict.parties_a.join('; ') || 'Not coded'],
      ['Side B', conflict.parties_b.join('; ') || 'Not coded'],
      ['Network nodes', graph.nodes.length.toLocaleString()],
      ['Network relations', graph.edges.length.toLocaleString()],
      ['Density', state.analysis.density.toFixed(4)],
      ['Components', state.analysis.components.toLocaleString()],
      ['Hubs', state.analysis.hubCount.toLocaleString()],
      ['Bottlenecks', state.analysis.bottleneckCount.toLocaleString()],
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
    $('#conflict-record-link').href = `map.html?conflict=${encodeURIComponent(id)}#detail`;
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
  $('#network-optimize').addEventListener('click',optimizeView);
  $('#network-data').addEventListener('click',viewNetworkData);
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
  document.querySelectorAll('[data-inspector-view]').forEach(button=>button.addEventListener('click',()=>setInspectorView(button.dataset.inspectorView)));
  document.querySelectorAll('[data-similar-era]').forEach(button=>button.addEventListener('click',()=>{
    state.similarEra=button.dataset.similarEra;
    document.querySelectorAll('[data-similar-era]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if(state.selected)renderSimilarNodes(state.nodeMap.get(state.selected));
  }));
  $('#theme-toggle').addEventListener('click',()=>{
    const theme=currentTheme()?'light':'dark';
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('war-maps-theme',theme);}catch(error){ /* Theme still applies for this page. */ }
    if(state.conflictId)renderGraph();
  });

  renderWarDialog();
  const initialParams = new URLSearchParams(location.search);
  const requested = initialParams.get('conflict');
  selectConflict(conflictsById.has(requested) ? requested : (conflictsById.has('ucdp-candidate-16905') ? 'ucdp-candidate-16905' : data.conflicts.at(-1).id), false);
  const requestedNode=initialParams.get('node');
  if(requestedNode&&state.nodeMap.has(requestedNode)){
    selectGraphNode(requestedNode);
    if(initialParams.get('inspector')==='similar')setInspectorView('similar');
  }
})();
