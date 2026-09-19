(()=>{
  'use strict';
  const start=()=>{
    const data=window.WAR_MAPS_DATA,model=window.WAR_MAPS_NETWORK_MODEL,root=document.querySelector('#navigator');
    if(!data||!model||!root)return;
    const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    if(!window.ForceGraph3D){root.innerHTML='<p class="navigator-loading">The 3D renderer is unavailable. <a href="graph.html">Open the accessible Network Graph</a>.</p>';return;}
    const params=new URLSearchParams(location.search),catalog=new Map(),edgeIndex=new Map(),adjacency=new Map(),nationNames=new Set();
    const kindLabel={nation:'Nation',conflict:'Conflict',event:'Event',human:'Human',organization:'Organization',location:'Place'};
    const kindColor={nation:'#7e914b',conflict:'#f07800',event:'#d8c58f',human:'#58a7b8',organization:'#b56d4d',location:'#8d79a8'};
    const kindSize={nation:7.5,conflict:11,event:2.6,human:5.5,organization:6.5,location:5};
    const addNode=(id,label,kind,metadata={})=>{if(!catalog.has(id))catalog.set(id,{id,label,kind,metadata});else Object.assign(catalog.get(id).metadata,metadata);return catalog.get(id);};
    const endpoint=value=>typeof value==='object'?value.id:value;
    const addEdge=(source,target,relation,metadata={})=>{
      if(!source||!target||source===target||!catalog.has(source)||!catalog.has(target))return;
      const key=`${[source,target].sort().join('\u0000')}\u0000${relation}`;
      if(edgeIndex.has(key)){Object.assign(edgeIndex.get(key).metadata,metadata);return;}
      const edge={source,target,relation,metadata};edgeIndex.set(key,edge);
      if(!adjacency.has(source))adjacency.set(source,new Map());if(!adjacency.has(target))adjacency.set(target,new Map());
      if(!adjacency.get(source).has(target))adjacency.get(source).set(target,[]);if(!adjacency.get(target).has(source))adjacency.get(target).set(source,[]);
      adjacency.get(source).get(target).push(edge);adjacency.get(target).get(source).push(edge);
    };
    const nationId=name=>{name=model.display(String(name||'').trim());return nationNames.has(name)?`nation:${name}`:'';};
    const personName=value=>{
      const raw=String(value||'').trim(),forced=raw.match(/^Forces of ([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,4})$/u),name=forced?.[1]||raw;
      if(/\b(government|army|forces|front|movement|party|militia|brigade|battalion|tribe|clan|police|council|state|islamic|liberation|insurgents?|faction|community|group)\b/i.test(name)||name.includes(',')||/^[A-Z\d/-]{2,12}$/.test(name))return '';
      return /^[A-Z][\p{L}'’.-]+(?:\s+(?:al-|bin |ibn )?[A-Z][\p{L}'’.-]+){1,4}$/u.test(name)?name:'';
    };
    const actorNode=value=>{
      const label=String(value||'').trim();if(!label)return '';
      const regime=model.regimeCountry(label,nationNames);if(regime)return nationId(regime);
      const person=personName(label);if(person){const id=`human:${person}`;addNode(id,person,'human',{sourceLabel:label});return id;}
      const id=`organization:actor:${label}`;addNode(id,label,'organization',{actor:true});return id;
    };
    (data.nations||[]).forEach(profile=>nationNames.add(model.display(profile.country)));
    (data.nations||[]).forEach(profile=>{const name=model.display(profile.country);addNode(`nation:${name}`,name,'nation',{profile});});
    (data.organizations||[]).forEach(organization=>{
      const id=`organization:${organization.id}`;addNode(id,organization.name,'organization',{organization});
      (organization.members||organization.entity_nations||[]).forEach(member=>{const nation=nationId(member);if(nation)addEdge(id,nation,'member state',{source:organization.source_id});});
    });
    (data.conflicts||[]).forEach(conflict=>addNode(`conflict:${conflict.id}`,conflict.title,'conflict',{conflict}));
    (data.nations||[]).forEach(profile=>(profile.conflict_ids||[]).forEach(conflictId=>addEdge(`nation:${model.display(profile.country)}`,`conflict:${conflictId}`,'recorded participant')));
    (data.conflict_years||[]).forEach(row=>{
      const conflict=`conflict:${row.conflict_id}`;if(!catalog.has(conflict))return;
      (row.side_a_states||[]).forEach(name=>{const id=nationId(name);if(id)addEdge(conflict,id,'Side A participant',{side:'A',year:row.year});});
      (row.side_b_states||[]).forEach(name=>{const id=nationId(name);if(id)addEdge(conflict,id,'Side B participant',{side:'B',year:row.year});});
      model.split(row.side_a).forEach(name=>{const id=actorNode(name);if(id)addEdge(conflict,id,'Side A actor',{side:'A',year:row.year});});
      model.split(row.side_b).forEach(name=>{const id=actorNode(name);if(id)addEdge(conflict,id,'Side B actor',{side:'B',year:row.year});});
    });
    (data.events||[]).forEach(event=>{
      const id=`event:${event.id}`,label=`${event.date_start} · ${event.place||event.country||event.conflict_name||'recorded event'}`;
      addNode(id,label,'event',{event,date:event.date_start});addEdge(id,`conflict:${event.conflict_id}`,'event in conflict',{date:event.date_start});
      const place=model.display(event.network_location||event.place||event.country||'Unspecified location'),placeId=`location:${place}`;addNode(placeId,place,'location',{place});addEdge(id,placeId,'occurred at',{date:event.date_start});
      const territory=nationId(event.country);if(territory)addEdge(id,territory,'occurred in territory',{date:event.date_start});
      (event.side_a_states||[]).forEach(name=>{const nation=nationId(name);if(nation)addEdge(id,nation,'Side A event participant',{side:'A',date:event.date_start});});
      (event.side_b_states||[]).forEach(name=>{const nation=nationId(name);if(nation)addEdge(id,nation,'Side B event participant',{side:'B',date:event.date_start});});
      model.split(event.side_a).forEach(name=>{const actor=actorNode(name);if(actor)addEdge(id,actor,'Side A event actor',{side:'A',date:event.date_start});});
      model.split(event.side_b).forEach(name=>{const actor=actorNode(name);if(actor)addEdge(id,actor,'Side B event actor',{side:'B',date:event.date_start});});
      if(event.alleged_perpetrator){const actor=actorNode(event.alleged_perpetrator);if(actor)addEdge(id,actor,'reported attribution',{confidence:event.attribution_confidence,date:event.date_start});}
    });
    const topologyNames={equilibrium:'Equilibrium sphere',coalitions:'Connection shells',prisoner:'Opposing fields','third-party':'Bridge landscape',pirates:'Influence hierarchy',temporal:'Temporal landscape'};
    const requestedTopology=params.get('topology'),state={center:'',root:'',history:[],nodes:[],links:[],graph:null,positions:new Map(),layoutForce:null,collisionForce:null,type:'all',topology:topologyNames[requestedTopology]?requestedTopology:'equilibrium'};
    const globalDegree=id=>adjacency.get(id)?.size||0;
    const relationToCenter=id=>(adjacency.get(state.center)?.get(id)||[])[0]||null;
    const seeded=value=>{let seed=0;for(const char of String(value))seed=(seed*31+char.charCodeAt(0))>>>0;return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};};
    function localPositions(){
      const positions=new Map([[state.center,{x:0,y:0,z:0}]]),neighbors=state.nodes.filter(node=>node.id!==state.center).sort((a,b)=>a.kind.localeCompare(b.kind)||a.label.localeCompare(b.label)),count=Math.max(1,neighbors.length),random=seeded(`${state.center}|${state.topology}`),sphere=(index,total,radius,center={x:0,y:0,z:0},phase=0)=>model.spherePoint(index,total,radius,center,phase);
      if(state.topology==='coalitions'){
        const groups=[...new Set(neighbors.map(node=>node.kind))];groups.forEach((kind,groupIndex)=>{const members=neighbors.filter(node=>node.kind===kind),angle=groupIndex/Math.max(1,groups.length)*Math.PI*2,center={x:Math.cos(angle)*205,y:Math.sin(angle)*90,z:Math.sin(angle)*205};members.forEach((node,index)=>positions.set(node.id,sphere(index,members.length,Math.min(105,34+Math.sqrt(members.length)*8),center,groupIndex)));});
      }else if(state.topology==='prisoner'){
        const sides={A:[],B:[],other:[]};neighbors.forEach(node=>{const side=relationToCenter(node.id)?.metadata?.side;sides[side==='A'?'A':side==='B'?'B':'other'].push(node);});
        sides.A.forEach((node,index)=>positions.set(node.id,sphere(index,sides.A.length,130,{x:-190,y:0,z:-70},.4)));sides.B.forEach((node,index)=>positions.set(node.id,sphere(index,sides.B.length,130,{x:190,y:0,z:70},Math.PI+.4)));sides.other.forEach((node,index)=>positions.set(node.id,sphere(index,sides.other.length,165,{x:0,y:145,z:0},1.2)));
      }else if(state.topology==='third-party'){
        const ranked=[...neighbors].sort((a,b)=>globalDegree(b.id)-globalDegree(a.id)||a.label.localeCompare(b.label));ranked.forEach((node,index)=>{const reach=globalDegree(node.id),radius=70+Math.min(260,index*3.2),angle=index*2.399963;positions.set(node.id,{x:Math.cos(angle)*radius,y:(reach-Math.sqrt(reach))*4-70,z:Math.sin(angle)*radius});});
      }else if(state.topology==='pirates'){
        const ranked=[...neighbors].sort((a,b)=>globalDegree(b.id)-globalDegree(a.id)||a.label.localeCompare(b.label));ranked.forEach((node,index)=>{const level=Math.floor(Math.sqrt(index)),angle=index*2.399963,radius=58+level*29;positions.set(node.id,{x:Math.cos(angle)*radius,y:190-level*42,z:Math.sin(angle)*radius});});
      }else if(state.topology==='temporal'){
        const dated=neighbors.filter(node=>node.metadata.date||node.metadata.event?.date_start),undated=neighbors.filter(node=>!dated.includes(node)),times=dated.map(node=>Date.parse(`${node.metadata.date||node.metadata.event.date_start}T00:00:00Z`)).filter(Number.isFinite),min=Math.min(...times),max=Math.max(...times),span=Math.max(1,max-min);
        dated.forEach((node,index)=>{const time=Date.parse(`${node.metadata.date||node.metadata.event.date_start}T00:00:00Z`),turn=index*2.399963,radius=115+index%5*9;positions.set(node.id,{x:Math.cos(turn)*radius,y:-190+(time-min)/span*380,z:Math.sin(turn)*radius});});undated.forEach((node,index)=>positions.set(node.id,sphere(index,undated.length,225,{x:0,y:0,z:0},.8)));
      }else neighbors.forEach((node,index)=>positions.set(node.id,sphere(index,count,120+Math.min(210,Math.sqrt(count)*15),{x:0,y:0,z:0},random()*Math.PI*2)));
      return positions;
    }
    function neighborhood(id){const ids=new Set([id,...(adjacency.get(id)?.keys()||[])]),nodes=[...ids].map(nodeId=>catalog.get(nodeId)).filter(Boolean).map(node=>({...node,metadata:node.metadata})),links=[...edgeIndex.values()].filter(edge=>ids.has(endpoint(edge.source))&&ids.has(endpoint(edge.target))).map(edge=>({...edge,source:endpoint(edge.source),target:endpoint(edge.target),metadata:edge.metadata}));return {nodes,links};}
    function updateInspector(){
      const center=catalog.get(state.center),neighbors=adjacency.get(state.center)||new Map(),counts={};neighbors.forEach((_,id)=>{const kind=catalog.get(id)?.kind||'other';counts[kind]=(counts[kind]||0)+1;});
      $('#navigator-kind').textContent=kindLabel[center.kind]||center.kind;$('#navigator-selected').textContent=center.label;
      let detail='';if(center.kind==='nation')detail=`${center.metadata.profile?.conflict_count||0} recorded conflicts`;else if(center.kind==='conflict')detail=`${center.metadata.conflict?.first_active_year||''}–${center.metadata.conflict?.active_at_source_boundary?'present':center.metadata.conflict?.last_active_year||''}`;else if(center.kind==='event'){const event=center.metadata.event;detail=`${event.date_start} · ${event.fatalities?.best||0} best-estimate fatalities`;}else if(center.kind==='organization')detail=center.metadata.organization?.note||'Recorded organization or conflict actor';else if(center.kind==='human')detail='Named human reference in a source record';else detail='Recorded place connection';
      $('#navigator-inspector-content').innerHTML=`<p>${esc(detail)}</p><p><b>${neighbors.size.toLocaleString()}</b> directly connected nodes · <b>${state.links.length.toLocaleString()}</b> relations in this local landscape.</p><div class="navigator-kind-grid">${Object.entries(counts).sort().map(([kind,total])=>`<span><i class="navigator-dot" style="--dot:${kindColor[kind]||'#888'}"></i><b>${total}</b> ${esc(kindLabel[kind]||kind)}</span>`).join('')}</div><small>Only observed source relationships are drawn. The optimization choice changes spatial arrangement, never the underlying evidence.</small>`;
    }
    function updateConnections(){
      const neighbors=adjacency.get(state.center)||new Map(),rows=[...neighbors].map(([id,edges])=>({node:catalog.get(id),edges})).filter(row=>row.node).sort((a,b)=>a.node.kind.localeCompare(b.node.kind)||a.node.label.localeCompare(b.node.label));
      $('#navigator-date').textContent=`${rows.length.toLocaleString()} direct connections · ${topologyNames[state.topology]}`;
      $('#navigator-register-list').innerHTML=rows.map(({node,edges})=>`<button type="button" data-node="${esc(node.id)}"><small>${esc(kindLabel[node.kind]||node.kind)}</small><strong>${esc(node.label)}</strong><span>${esc([...new Set(edges.map(edge=>edge.relation))].join(' · '))}</span></button>`).join('')||'<p class="navigator-loading">No direct connections in the source index.</p>';
    }
    function nodeColor(node){if(node.id===state.center)return '#ffd500';if(state.type!=='all'&&node.kind!==state.type)return '#18201d';return kindColor[node.kind]||'#8a8a72';}
    function nodeLabel(node){const relation=node.id===state.center?'Central node':[...new Set((adjacency.get(state.center)?.get(node.id)||[]).map(edge=>edge.relation))].join(' · ');return `<b>${esc(node.label)}</b><br><small style="color:${kindColor[node.kind]||'#aaa'}">${esc(kindLabel[node.kind]||node.kind)}</small><br><small>${esc(relation)}</small>`;}
    function optimize(duration=900){state.positions=localPositions();state.nodes.forEach(node=>{const point=state.positions.get(node.id)||{x:0,y:0,z:0};node.fx=null;node.fy=null;node.fz=null;node.x=point.x;node.y=point.y;node.z=point.z;});state.layoutForce?.targets(state.positions);state.graph?.graphData({nodes:state.nodes,links:state.links}).refresh();setTimeout(()=>{state.graph?.d3ReheatSimulation();state.graph?.zoomToFit(duration,90);},50);}
    function pullNeighborhood(node,translation){const distance=Math.hypot(translation.x||0,translation.y||0,translation.z||0);if(!distance)return;model.graphDistances(node.id,state.links,3).forEach((depth,id)=>{const neighbor=state.nodes.find(item=>item.id===id),factor=model.dragPullFactor(depth,distance);if(!neighbor||!factor)return;const dx=(translation.x||0)*factor,dy=(translation.y||0)*factor,dz=(translation.z||0)*factor;neighbor.x=(neighbor.x||0)+dx;neighbor.y=(neighbor.y||0)+dy;neighbor.z=(neighbor.z||0)+dz;const target=state.positions.get(id);if(target){target.x+=dx;target.y+=dy;target.z+=dz;}});}
    function focus(id,{remember=true}={}){
      if(!catalog.has(id))return;if(remember&&state.center&&state.center!==id)state.history.push(state.center);state.center=id;const local=neighborhood(id);state.nodes=local.nodes;state.links=local.links;state.positions=localPositions();state.nodes.forEach(node=>Object.assign(node,state.positions.get(node.id)||{}));
      if(!state.graph){renderGraph();return;}state.layoutForce=model.anchorForce(state.positions);state.collisionForce=model.collisionForce(node=>node.id===state.center?34:({nation:24,conflict:28,event:7,human:14,organization:17,location:15}[node.kind]||12),5);
      state.graph.graphData({nodes:state.nodes,links:state.links}).d3Force('layout',state.layoutForce).d3Force('collision',state.collisionForce).nodeColor(nodeColor).nodeVal(node=>node.id===state.center?(kindSize[node.kind]||5)*1.7:kindSize[node.kind]||4).refresh();$('#navigator-title').textContent=centerTitle();$('#navigator-status').textContent=statusText();updateInspector();updateConnections();setTimeout(()=>{state.graph.d3ReheatSimulation();state.graph.zoomToFit(850,90);},30);
    }
    const centerTitle=()=>`${catalog.get(state.center)?.label||'Network'} · Network Browser`,statusText=()=>`${state.nodes.length.toLocaleString()} nodes · ${state.links.length.toLocaleString()} observed relations · click any node to follow it`;
    function renderGraph(){
      root.innerHTML='';const graph=ForceGraph3D()(root).backgroundColor('rgba(0,0,0,0)').showNavInfo(false).nodeLabel(nodeLabel).nodeColor(nodeColor).nodeVal(node=>node.id===state.center?(kindSize[node.kind]||5)*1.7:kindSize[node.kind]||4).nodeOpacity(.98).nodeResolution(12).linkColor(link=>{const source=endpoint(link.source),target=endpoint(link.target);return source===state.center||target===state.center?'#d6c67d':'#59645d';}).linkOpacity(.62).linkWidth(link=>endpoint(link.source)===state.center||endpoint(link.target)===state.center?1.4:.45).enableNodeDrag(true).enableNavigationControls(true).onNodeClick(node=>focus(node.id)).onNodeDrag((node,translation)=>pullNeighborhood(node,translation)).onNodeDragEnd(node=>{node.fx=null;node.fy=null;node.fz=null;state.positions.set(node.id,{x:node.x,y:node.y,z:node.z});state.layoutForce?.targets(state.positions);graph.d3ReheatSimulation();}).graphData({nodes:state.nodes,links:state.links});
      state.graph=graph;state.layoutForce=model.anchorForce(state.positions);state.collisionForce=model.collisionForce(node=>node.id===state.center?34:({nation:24,conflict:28,event:7,human:14,organization:17,location:15}[node.kind]||12),5);graph.d3Force('layout',state.layoutForce);graph.d3Force('collision',state.collisionForce);graph.d3Force('charge')?.strength(state.nodes.length>1200?-22:state.nodes.length>500?-38:-72);graph.d3Force('link')?.distance(link=>endpoint(link.source)===state.center||endpoint(link.target)===state.center?70:42);graph.controls().enableDamping=true;graph.controls().dampingFactor=.075;$('#navigator-title').textContent=centerTitle();$('#navigator-status').textContent=statusText();updateInspector();updateConnections();optimize(700);
    }
    const requestedNode=params.get('node'),requestedConflict=params.get('conflict')?`conflict:${params.get('conflict')}`:'',highest=[...catalog.values()].filter(node=>!['event','location'].includes(node.kind)).sort((a,b)=>globalDegree(b.id)-globalDegree(a.id))[0]?.id;
    state.root=catalog.has(requestedNode)?requestedNode:catalog.has(requestedConflict)?requestedConflict:highest;state.center=state.root;const initial=neighborhood(state.center);state.nodes=initial.nodes;state.links=initial.links;state.positions=localPositions();state.nodes.forEach(node=>Object.assign(node,state.positions.get(node.id)||{}));
    $('#navigator-topology').value=state.topology;$('#navigator-register-list').addEventListener('click',event=>{const button=event.target.closest('[data-node]');if(button)focus(button.dataset.node);});$('#navigator-back').addEventListener('click',()=>{const id=state.history.pop();if(id)focus(id,{remember:false});});$('#navigator-root').addEventListener('click',()=>focus(state.root));$('#navigator-clear').addEventListener('click',()=>{state.history=[];focus(state.root,{remember:false});});
    $('#navigator-fit').addEventListener('click',()=>state.graph?.zoomToFit(650,90));$('#navigator-optimize').addEventListener('click',()=>optimize());$('#navigator-topology').addEventListener('change',event=>{state.topology=event.target.value;optimize();updateConnections();});$('#navigator-type').addEventListener('change',event=>{state.type=event.target.value;state.graph?.nodeColor(nodeColor).refresh();});
    $('#navigator-search').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const query=event.currentTarget.value.trim().toLowerCase();if(!query)return;const matches=[...catalog.values()].filter(node=>state.type==='all'||node.kind===state.type).sort((a,b)=>{const ax=a.label.toLowerCase()===query?0:a.label.toLowerCase().startsWith(query)?1:2,bx=b.label.toLowerCase()===query?0:b.label.toLowerCase().startsWith(query)?1:2;return ax-bx||globalDegree(b.id)-globalDegree(a.id);}),match=matches.find(node=>node.label.toLowerCase().includes(query));if(match)focus(match.id);});
    $('#navigator-close').addEventListener('click',()=>{if(history.length>1)history.back();else location.href='graph.html';});
    try{renderGraph();}catch(error){const fallback=new URL('graph.html',location.href),center=catalog.get(state.center);if(center?.kind==='nation')fallback.searchParams.set('node',center.label);root.innerHTML=`<p class="navigator-loading">The browser could not create a WebGL context. <a href="${fallback.href}">Continue through this node in the Network Graph</a>.</p>`;$('#navigator-title').textContent='3D Network Browser unavailable';$('#navigator-status').textContent=error.message;updateInspector();updateConnections();}
  };
  window.addEventListener('load',start,{once:true});
})();
