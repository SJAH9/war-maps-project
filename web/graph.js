(()=>{
  'use strict';
  const data=window.WAR_MAPS_DATA;
  const $=selector=>document.querySelector(selector);
  if(!data?.nations){$('#global-graph').innerHTML='<p class="boundary-note network-error">The global atlas relationship data is unavailable.</p>';return;}
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const profileByName=new Map(data.nations.map(profile=>[profile.country,profile]));
  const MAX_GRAPH_NODES=120;
  const state={minYears:1,throughYear:2025,view:'network',relationship:'observed',organizations:[],includeUngrouped:false,topology:'equilibrium',selected:'',nodes:new Map(),links:[],model:null,adjacency:new Map(),opponents:new Map(),bridges:new Map(),svgScene:null,omittedNodes:0};
  const colors={base:'#7b8051',isolated:'#4e5145',selected:'#ffd500',ally:'#8b989b',bridge:'#ff8a1f',opponent:'#8f2f27',dim:'#34372f'};
  const relationshipLabel=()=>state.relationship==='observed'?'same-side participation':state.relationship==='organization'?'organization co-membership':'displayed relationship';
  const linkDescription=link=>link.kind==='organization'?`Shared ${link.organizations?.join(', ')||'organization'} membership`:`${link.years} shared years`;
  const nodePriority=(a,b)=>{const aSelected=a.id===state.selected,bSelected=b.id===state.selected;return Number(bSelected)-Number(aSelected)||b.degree-a.degree||b.weightedDegree-a.weightedDegree||a.label.localeCompare(b.label);};

  function selectedOrganizations(){return (data.organizations||[]).filter(item=>state.organizations.includes(item.id));}
  function organizationMembers(organization){return organization.member_count?organization.members:(organization.entity_nations||[]);}

  function updatePageDescription(){
    const selected=selectedOrganizations(),names=selected.map(item=>item.name).join(', '),wef=selected.some(item=>item.id==='wef'),title=wef&&selected.length===1?'WEF partner home-nation network':selected.length?`Membership network: ${names}`:state.relationship==='organization'?'Organization membership network':'Network Graph';
    const scopeNote=state.includeUngrouped?' Ungrouped nations are included.':' Only nations belonging to a selected organization are included.';
    const description=wef?'WEF partner companies are resolved to disclosed home nations for graph placement. The organization node connects those nations; this does not infer state membership, conflict participation, or corporate control.':selected.length&&state.relationship==='observed'?`Observed same-side participation is filtered to members of ${names}.${scopeNote} Organization nodes are hidden in this view.`:selected.length?`Each selected organization is a node connected to its sourced member states.${scopeNote} Membership is not treated as alliance, coordination, or causation.`:'Select any node to make it central and load its immediate observed conflict and organization relationships. Optimization changes the landscape, never the evidence.';
    $('#graph-page-title').textContent=title;$('#graph-rule-description').textContent=description;$('#global-graph').setAttribute('aria-label',`${title}. ${description}`);
  }

  function normalizedRelations(profile,key){
    return (profile?.[key]||[]).filter(item=>profileByName.has(item.country));
  }

  function organizationLinks(nodes){
    const selected=selectedOrganizations(),links=new Map(),nodeIds=new Set(nodes.map(node=>node.id));
    selected.forEach(organization=>{
      const organizationId=`organization:${organization.id}`;
      if(!nodeIds.has(organizationId))return;
      organizationMembers(organization).filter(member=>nodeIds.has(member)).forEach(member=>{
        const pair=[organizationId,member].sort(),key=pair.join('\u0000'),existing=links.get(key),entityMembers=organization.entity_member_nations?Object.entries(organization.entity_member_nations).filter(([,nation])=>nation===member).map(([entity])=>entity):[];
        if(existing){existing.organizations.push(organization.name);existing.entityMembers.push(...entityMembers);}else links.set(key,{source:pair[0],target:pair[1],years:0,firstYear:null,lastYear:null,conflictIds:[],kind:'organization',organizations:[organization.name],entityMembers});
      });
    });
    return [...links.values()];
  }

  function seededRandom(seed){let value=0;for(const char of String(seed))value=(value*31+char.charCodeAt(0))>>>0;return ()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}

  function buildModel(){
    const activeYears=relation=>Math.max(0,Math.min(Number(relation.last_year||state.throughYear),state.throughYear)-Number(relation.first_year||state.throughYear)+1);
    const selected=selectedOrganizations(),selectedMemberNames=selected.length&&!state.includeUngrouped?new Set(selected.flatMap(organizationMembers)):null,includeOrganizationNodes=selected.length&&state.relationship!=='observed';
    const nationNodes=data.nations.filter(profile=>!selectedMemberNames||selectedMemberNames.has(profile.country)).map(profile=>({
      id:profile.country,label:profile.country,profile,
      degree:normalizedRelations(profile,'same_side_partners').filter(item=>Number(item.first_year||0)<=state.throughYear&&activeYears(item)>=state.minYears).length,
      weightedDegree:normalizedRelations(profile,'same_side_partners').filter(item=>Number(item.first_year||0)<=state.throughYear&&activeYears(item)>=state.minYears).reduce((sum,item)=>sum+activeYears(item),0)
    }));
    const organizationNodes=includeOrganizationNodes?selected.map(organization=>({id:`organization:${organization.id}`,label:organization.name,profile:null,degree:0,weightedDegree:0,entityKind:'organization',organizationId:organization.id})):[];
    const nodes=[...nationNodes,...organizationNodes],nodeIds=new Set(nationNodes.map(node=>node.id));
    const edges=new Map();
    data.nations.forEach(profile=>normalizedRelations(profile,'same_side_partners').forEach(relation=>{
      const lastYear=Math.min(Number(relation.last_year||state.throughYear),state.throughYear);
      const years=Math.max(0,lastYear-Number(relation.first_year||lastYear)+1);
      if(!nodeIds.has(profile.country)||!nodeIds.has(relation.country)||years<state.minYears||Number(relation.first_year||0)>state.throughYear||relation.country===profile.country)return;
      const pair=[profile.country,relation.country].sort();const key=pair.join('\u0000');
      const existing=edges.get(key);
      if(!existing||years>existing.years)edges.set(key,{source:pair[0],target:pair[1],years,firstYear:relation.first_year,lastYear,conflictIds:relation.conflict_ids||[]});
    }));
    const observedLinks=[...edges.values()],membershipLinks=organizationLinks(nodes),observedKeys=new Set(observedLinks.map(link=>[link.source,link.target].sort().join('\u0000')));
    const basisLinks=state.relationship==='observed'?observedLinks:state.relationship==='organization'?membershipLinks:[...observedLinks,...membershipLinks.filter(link=>!observedKeys.has([link.source,link.target].sort().join('\u0000')))];
    let visibleNodes=nodes,visibleBasis=basisLinks;
    if(state.selected&&nodes.some(node=>node.id===state.selected)){
      const focus=new Set([state.selected]);
      visibleBasis.forEach(link=>{if(link.source===state.selected)focus.add(link.target);if(link.target===state.selected)focus.add(link.source);});
      visibleBasis.forEach(link=>{if([...focus].some(id=>id.startsWith('organization:'))&&(link.source.startsWith('organization:')||link.target.startsWith('organization:'))){focus.add(link.source);focus.add(link.target);}});
      visibleNodes=nodes.filter(node=>focus.has(node.id));
      visibleBasis=visibleBasis.filter(link=>focus.has(link.source)&&focus.has(link.target));
    }
    const rankedNodes=visibleNodes.slice().sort(nodePriority);
    state.omittedNodes=Math.max(0,rankedNodes.length-MAX_GRAPH_NODES);
    visibleNodes=rankedNodes.slice(0,MAX_GRAPH_NODES);
    if(state.selected&&!visibleNodes.some(node=>node.id===state.selected))visibleNodes=[nodes.find(node=>node.id===state.selected),...visibleNodes].filter(Boolean).slice(0,MAX_GRAPH_NODES);
    const visibleIds=new Set(visibleNodes.map(node=>node.id));
    visibleBasis=visibleBasis.filter(link=>visibleIds.has(link.source)&&visibleIds.has(link.target));
    visibleNodes.forEach((node,index)=>{node.renderRank=index;});
    state.nodes=new Map(visibleNodes.map(node=>[node.id,node]));
    state.links=visibleBasis;
    state.nodes.forEach(node=>{node.degree=0;node.weightedDegree=0;});
    state.links.forEach(link=>{state.nodes.get(link.source).degree++;state.nodes.get(link.target).degree++;state.nodes.get(link.source).weightedDegree+=link.years;state.nodes.get(link.target).weightedDegree+=link.years;});
    state.adjacency=new Map(visibleNodes.map(node=>[node.id,new Set()]));
    state.links.forEach(link=>{state.adjacency.get(link.source)?.add(link.target);state.adjacency.get(link.target)?.add(link.source);});
    state.opponents=new Map(visibleNodes.map(node=>[node.id,new Set(normalizedRelations(node.profile,'opposing_states').map(item=>item.country))]));
    state.bridges=new Map();
    return {nodes:visibleNodes,links:state.links.map(link=>({...link}))};
  }

  function bridgePaths(id){
    if(state.bridges.has(id))return state.bridges.get(id);
    const allies=state.adjacency.get(id)||new Set(),opponents=state.opponents.get(id)||new Set(),paths=[];
    opponents.forEach(opponent=>{
      const opponentAllies=state.adjacency.get(opponent)||new Set();
      const mutual=[...allies].filter(ally=>opponentAllies.has(ally));
      if(mutual.length)paths.push({opponent,mutual:mutual.sort()});
    });
    paths.sort((a,b)=>b.mutual.length-a.mutual.length||a.opponent.localeCompare(b.opponent));state.bridges.set(id,paths);return paths;
  }

  function connectedComponents(){
    const unseen=new Set(state.nodes.keys());let count=0,largest=0;
    while(unseen.size){count++;const queue=[unseen.values().next().value];unseen.delete(queue[0]);let size=0;while(queue.length){const id=queue.shift();size++;state.adjacency.get(id)?.forEach(next=>{if(unseen.delete(next))queue.push(next);});}largest=Math.max(largest,size);}
    return {count,largest};
  }

  const endpointId=value=>typeof value==='object'?value.id:value;
  const nodeRadius=node=>node.entityKind==='organization'?8+Math.sqrt(node.degree)*1.7:3.5+Math.sqrt(node.degree)*1.3;
  const selectedAllies=()=>state.selected?state.adjacency.get(state.selected)||new Set():new Set();
  const selectedOpponents=()=>state.selected?state.opponents.get(state.selected)||new Set():new Set();
  const selectedBridges=()=>new Set(state.selected?bridgePaths(state.selected).flatMap(path=>path.mutual):[]);

  function nodeColor(node){
    if(node.entityKind==='organization')return '#d78b2f';
    if(!state.selected)return node.degree?colors.base:colors.isolated;
    if(node.id===state.selected)return colors.selected;
    if(selectedBridges().has(node.id))return colors.bridge;
    if(selectedAllies().has(node.id))return colors.ally;
    if(selectedOpponents().has(node.id))return colors.opponent;
    return colors.dim;
  }

  function linkColor(link){
    if(!state.selected)return link.kind==='organization'?'#d78b2f':'#686d55';
    const source=endpointId(link.source),target=endpointId(link.target);
    if(source===state.selected||target===state.selected)return colors.ally;
    const bridges=selectedBridges(),opponents=selectedOpponents();
    if((bridges.has(source)&&opponents.has(target))||(bridges.has(target)&&opponents.has(source)))return colors.bridge;
    return '#33362f';
  }

  function setSelection(id){
    const organizationId=String(id||'').startsWith('organization:')&&selectedOrganizations().some(item=>`organization:${item.id}`===id);
    state.selected=profileByName.has(id)||organizationId?id:'';
    render();
  }

  function listBlock(title,items,empty){
    return `<section class="global-relation-list"><h3>${esc(title)}</h3>${items.length?items.map(item=>`<button type="button" data-graph-nation="${esc(item.country)}"><span>${esc(item.country)}</span><small>${esc(item.note)}</small></button>`).join(''):`<p>${esc(empty)}</p>`}</section>`;
  }

  function renderInspector(){
    const metrics=$('#graph-node-metrics'),detail=$('#graph-node-detail');
    if(!state.selected){
      const ranked=[...state.nodes.values()].filter(node=>node.degree).sort((a,b)=>b.degree-a.degree||b.weightedDegree-a.weightedDegree||a.label.localeCompare(b.label)).slice(0,12);
      const organizationScope=selectedOrganizations().length;
      $('#graph-node-type').textContent='Global field';$('#graph-node-title').textContent=organizationScope?'Membership network':'All participating states';
      metrics.innerHTML=`<div><span>${organizationScope?'Nodes':'States'}</span><strong>${state.nodes.size.toLocaleString()}</strong></div><div><span>Displayed ties</span><strong>${state.links.length.toLocaleString()}</strong></div>`;
      detail.innerHTML=listBlock(`Highest ${relationshipLabel()} reach`,ranked.map(node=>({country:node.id,note:`${node.degree} connections · ${node.weightedDegree} observed partner-years`})),'No relationships meet this threshold.');
    }else{
      const node=state.nodes.get(state.selected),profile=node.profile;
      if(!profile){
        const organizationNode=node.entityKind==='organization';
        $('#graph-node-type').textContent=organizationNode?'Organization':'State';$('#graph-node-title').textContent=node.label;
        metrics.innerHTML=`<div><span>Node type</span><strong>${organizationNode?'Organization':'Resolved nation'}</strong></div><div><span>Displayed degree</span><strong>${node.degree}</strong></div>`;
        detail.innerHTML=`<p class="boundary-note">${organizationNode?'This organization node connects its sourced member nations.':'This nation is included by the selected organization membership criterion. WEF partner home-nation resolution does not imply state membership or corporate control.'}</p>`;
      }else{
      const allies=normalizedRelations(profile,'same_side_partners').filter(item=>item.duration_years>=state.minYears).map(item=>({country:item.country,note:`${item.duration_years} year${item.duration_years===1?'':'s'} · ${item.first_year}-${item.last_year}`}));
      const opponents=normalizedRelations(profile,'opposing_states').map(item=>({country:item.country,note:`${item.duration_years} opposing year${item.duration_years===1?'':'s'} · not drawn as an edge`}));
      const paths=bridgePaths(node.id).map(path=>({country:path.opponent,note:`via ${path.mutual.slice(0,3).join(', ')}${path.mutual.length>3?` +${path.mutual.length-3}`:''}`}));
      $('#graph-node-type').textContent='Selected state';$('#graph-node-title').textContent=node.label;
      metrics.innerHTML=`<div><span>Displayed degree</span><strong>${node.degree}</strong></div><div><span>Observed partner-years</span><strong>${node.weightedDegree}</strong></div><div><span>Conflicts</span><strong>${profile.conflict_count||0}</strong></div><div><span>Bridged opponents</span><strong>${paths.length}</strong></div>`;
      detail.innerHTML=`<a class="global-nation-link" href="nation.html?country=${encodeURIComponent(node.id)}">Open nation record</a>${listBlock(`${relationshipLabel()} records`,allies,'No observed same-side record meets this threshold.')}${listBlock('Historic opponents connected through mutual allies',paths,'No two-step mutual-ally path is present at this threshold.')}${listBlock('Historic opponents',opponents,'No opposing state participation is recorded.')}`;
      }
    }
    detail.querySelectorAll('[data-graph-nation]').forEach(button=>button.addEventListener('click',()=>focusNation(button.dataset.graphNation)));
  }

  function focusNation(id){
    if(!profileByName.has(id)&&!String(id).startsWith('organization:'))return;
    setSelection(id);state.svgScene?.focus(id);
  }

  function renderSummary(){
    const components=connectedComponents(),active=[...state.nodes.values()].filter(node=>node.degree>0),possible=state.nodes.size*(state.nodes.size-1)/2,density=possible?state.links.length/possible:0;
    const organizationScope=selectedOrganizations().length,scope=organizationScope?'nodes':'states',rule=state.relationship==='observed'?'Observed same-side records':state.relationship==='organization'?'Organization nodes connected to members':'Observed records plus organization membership',model=`${state.topology} optimization of observed edges`;
    $('#global-graph-summary').innerHTML=`<div><span>Displayed ${scope}</span><strong>${state.nodes.size.toLocaleString()}</strong></div><div><span>${scope[0].toUpperCase()+scope.slice(1)} with ties</span><strong>${active.length.toLocaleString()}</strong></div><div><span>Displayed ties</span><strong>${state.links.length.toLocaleString()}</strong></div><div><span>Graph density</span><strong>${(density*100).toFixed(2)}%</strong></div><div><span>Largest component</span><strong>${components.largest.toLocaleString()} ${scope}</strong></div><div><span>Node cutoff</span><strong>${MAX_GRAPH_NODES} · hubs first${state.omittedNodes?` · ${state.omittedNodes} omitted`:''}</strong></div><div><span>Connection rule</span><strong>${esc(rule)}</strong></div><div><span>Topology</span><strong>${esc(model)}</strong></div>`;
  }

  function forceLayout(model,spread=1){
    const nodes=model.nodes,byId=new Map(nodes.map(node=>[node.id,node])),random=seededRandom(`${state.topology}|${nodes.map(node=>node.id).join('|')}`),centerId=state.selected&&byId.has(state.selected)?state.selected:'',ordered=[...nodes].sort((a,b)=>b.degree-a.degree||a.label.localeCompare(b.label)),allies=selectedAllies(),opponents=selectedOpponents(),firstYear=new Map(nodes.map(node=>[node.id,2025]));
    model.links.forEach(link=>{if(Number.isFinite(link.firstYear)){firstYear.set(link.source,Math.min(firstYear.get(link.source),link.firstYear));firstYear.set(link.target,Math.min(firstYear.get(link.target),link.firstYear));}});
    const place=(node,index,total)=>{
      if(node.id===centerId)return {x:600,y:390,z:0};const angle=index*2.3999632297,unit=(index+.5)/Math.max(1,total),sphereY=1-2*unit,sphereRadius=Math.sqrt(Math.max(0,1-sphereY*sphereY)),radius=245+Math.min(125,Math.sqrt(total)*8);
      if(state.topology==='coalitions'){const group=node.entityKind==='organization'?0:allies.has(node.id)?1:opponents.has(node.id)?2:3,groupAngle=group*Math.PI/2;return {x:600+Math.cos(groupAngle)*220+Math.cos(angle)*75,y:390+Math.sin(angle)*95,z:Math.sin(groupAngle)*220+Math.sin(angle*1.7)*75};}
      if(state.topology==='barabasi'){const rank=ordered.indexOf(node),rad=62+Math.sqrt(rank+1)*38;return {x:600+Math.cos(angle)*rad,y:390+(node.degree-Math.sqrt(node.degree))*8-90,z:Math.sin(angle)*rad};}
      if(state.topology==='erdos-renyi')return {x:600+(random()-.5)*780,y:390+(random()-.5)*560,z:(random()-.5)*620};
      if(state.topology==='watts-strogatz'){const ringAngle=index/Math.max(1,total)*Math.PI*2,rad=285+(index%3-1)*18;return {x:600+Math.cos(ringAngle)*rad,y:390+(index%5-2)*28,z:Math.sin(ringAngle)*rad};}
      if(state.topology==='radial'){const rank=ordered.indexOf(node),ring=1+Math.floor(Math.sqrt(rank)/3),members=ring*8,slot=rank%members,ringAngle=slot/members*Math.PI*2;return {x:600+Math.cos(ringAngle)*ring*88,y:390+(slot%3-1)*22,z:Math.sin(ringAngle)*ring*88};}
      if(state.topology==='lattice'){const side=Math.ceil(Math.cbrt(total)),x=index%side,y=Math.floor(index/side)%side,z=Math.floor(index/(side*side));return {x:600+(x-(side-1)/2)*82,y:390+(y-(side-1)/2)*82,z:(z-(side-1)/2)*82};}
      if(state.topology==='prisoner'){const side=opponents.has(node.id)?1:allies.has(node.id)?-1:index%2?1:-1;return {x:600+side*(170+random()*100),y:390+Math.sin(angle)*210,z:side*95+Math.cos(angle)*125};}
      if(state.topology==='third-party'){const ranked=ordered.indexOf(node),rad=65+ranked*7;return {x:600+Math.cos(angle)*rad,y:390+(node.degree-Math.sqrt(node.degree))*8-95,z:Math.sin(angle)*rad};}
      if(state.topology==='pirates'){const rank=ordered.indexOf(node),level=Math.floor(Math.sqrt(rank));return {x:600+Math.cos(angle)*(65+level*32),y:210+level*54,z:Math.sin(angle)*(65+level*32)};}
      if(state.topology==='temporal'){const year=firstYear.get(node),progress=(year-1946)/(2025-1946);return {x:160+progress*880,y:390+Math.sin(angle)*190,z:Math.cos(angle)*210};}
      return {x:600+Math.cos(angle)*sphereRadius*radius,y:390+sphereY*radius*.72,z:Math.sin(angle)*sphereRadius*radius*spread};
    };
    ordered.forEach((node,index)=>{const point=place(node,index,ordered.length);node.x=point.x;node.y=point.y;node.z=point.z;node.homeX=point.x;node.homeY=point.y;node.homeZ=point.z;node.vx=node.vy=node.vz=0;node.topLabel=index<Math.min(16,nodes.length)||node.id===centerId;});
    for(let step=0;step<170;step++){
      const cooling=1-step/170;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j],dx=a.x-b.x||.01,dy=a.y-b.y||.01,dz=a.z-b.z||.01,d=Math.max(1,Math.hypot(dx,dy,dz)),minimum=nodeRadius(a)+nodeRadius(b)+14,f=(7200/(Math.max(12,d)**2)+(d<minimum?(minimum-d)*.16:0))*cooling,fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;a.vx+=fx;a.vy+=fy;a.vz+=fz;b.vx-=fx;b.vy-=fy;b.vz-=fz;
      }
      model.links.forEach(link=>{const a=byId.get(link.source),b=byId.get(link.target),dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.max(8,Math.hypot(dx,dy,dz)),desired=(link.kind==='organization'?95:145)+Math.min(80,link.years*2),f=(d-desired)*.012*cooling,fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;a.vx+=fx;a.vy+=fy;a.vz+=fz;b.vx-=fx;b.vy-=fy;b.vz-=fz;});
      nodes.forEach(node=>{const anchor=node.id===centerId ? .09 : .008;node.vx+=(node.homeX-node.x)*anchor;node.vy+=(node.homeY-node.y)*anchor;node.vz+=(node.homeZ-node.z)*anchor;node.vx*=.82;node.vy*=.82;node.vz*=.82;node.x+=node.vx;node.y+=node.vy;node.z+=node.vz;});
    }
    const max=Math.max(1,...nodes.map(node=>Math.hypot(node.x-600,(node.y-390)*1.1,node.z*.45)));nodes.forEach(node=>{node.x=600+(node.x-600)*Math.min(1,520/max);node.y=390+(node.y-390)*Math.min(1,330/max);node.z*=Math.min(1,520/max);});
    return byId;
  }

  function connectionDepths(start,maxDepth=3){
    const depths=new Map([[start,0]]),queue=[start];while(queue.length){const current=queue.shift(),depth=depths.get(current);if(depth>=maxDepth)continue;(state.adjacency.get(current)||[]).forEach(next=>{if(depths.has(next))return;depths.set(next,depth+1);queue.push(next);});}depths.delete(start);return depths;
  }

  function renderSVG(model){
    const container=$('#global-graph'),ns='http://www.w3.org/2000/svg',byId=forceLayout(model);container.innerHTML='';
    const svg=document.createElementNS(ns,'svg');svg.classList.add('global-graph-svg');svg.setAttribute('viewBox','0 0 1200 780');svg.setAttribute('aria-label',`Interactive force-directed ${relationshipLabel()} graph`);
    const viewport=document.createElementNS(ns,'g'),edgeLayer=document.createElementNS(ns,'g'),nodeLayer=document.createElementNS(ns,'g');viewport.append(edgeLayer,nodeLayer);svg.append(viewport);container.append(svg);
    const incident=new Map(model.nodes.map(node=>[node.id,[]]));
    const edgeElements=model.links.map(link=>{const line=document.createElementNS(ns,'line'),source=byId.get(link.source),target=byId.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);line.setAttribute('stroke-width',link.kind==='organization'?2.2:.85+Math.log2(1+link.years)*.3);edgeLayer.append(line);const item={link,line};incident.get(link.source).push(item);incident.get(link.target).push(item);return item;});
    const nodeElements=new Map();
    model.nodes.forEach(node=>{const group=document.createElementNS(ns,'g'),title=document.createElementNS(ns,'title'),label=document.createElementNS(ns,'text'),radius=nodeRadius(node),ellipse=document.createElementNS(ns,'ellipse');group.classList.add('global-graph-node');group.dataset.nodeId=node.id;group.setAttribute('transform',`translate(${node.x} ${node.y})`);title.textContent=`${node.label} · ${node.degree} displayed connections · ${node.weightedDegree} observed partner-years`;ellipse.setAttribute('rx',radius*1.25);ellipse.setAttribute('ry',radius*.78);if(node.entityKind==='organization')ellipse.setAttribute('stroke-dasharray','3 2');group.append(ellipse);const shapes=[ellipse];group.append(title);label.textContent=node.label;label.setAttribute('y',-(radius+5));label.hidden=!node.topLabel;group.append(label);nodeLayer.append(group);nodeElements.set(node.id,{group,shapes,label,node});});
    const scene={svg,viewport,byId,edgeElements,nodeElements,zoom:.92,panX:0,panY:0,yaw:-.18,pitch:.1,drag:null,moved:false,animation:null,momentumFrame:null};
    scene.transform=()=>viewport.setAttribute('transform',`translate(${scene.panX} ${scene.panY}) scale(${scene.zoom})`);
    scene.project=node=>{const x=node.x-600,y=node.y-390,z=node.z||0,cy=Math.cos(scene.yaw),sy=Math.sin(scene.yaw),cp=Math.cos(scene.pitch),sp=Math.sin(scene.pitch),x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp,perspective=900/(900+z2);return {x:600+x1*perspective,y:390+y1*perspective,z:z2,scale:Math.max(.62,Math.min(1.45,perspective))};};
    scene.draw=()=>{const projected=new Map(model.nodes.map(node=>[node.id,scene.project(node)]));edgeElements.forEach(({link,line})=>{const source=projected.get(link.source),target=projected.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);});[...model.nodes].sort((a,b)=>a.renderRank-b.renderRank||projected.get(a.id).z-projected.get(b.id).z).forEach(node=>{const point=projected.get(node.id),parts=nodeElements.get(node.id);parts.group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${point.scale})`);nodeLayer.append(parts.group);});};
    scene.update=()=>{scene.draw();const allies=selectedAllies(),opponents=selectedOpponents(),bridges=selectedBridges();edgeElements.forEach(({link,line})=>{const color=linkColor(link);line.setAttribute('stroke',color);line.setAttribute('opacity',state.selected?(color==='#33362f'?'.06':'.88'):'.34');});nodeElements.forEach(({group,shapes,label,node},id)=>{const color=nodeColor(node),active=!state.selected||id===state.selected||allies.has(id)||opponents.has(id)||bridges.has(id);shapes.forEach((shape,index)=>{shape.setAttribute('fill',index===0?color:(node.entityKind==='organization'?color:index===1?'#555b3d':'#a49a55'));shape.setAttribute('stroke',id===state.selected?'#fff0a8':'#171a14');shape.setAttribute('stroke-width',id===state.selected?'2.5':'.8');});group.setAttribute('opacity',active?'1':'.14');label.hidden=!(node.topLabel||id===state.selected);});};
    scene.focus=id=>{const node=byId.get(id);if(!node)return;const projected=scene.project(node);scene.zoom=1.35;scene.panX=600-projected.x*scene.zoom;scene.panY=390-projected.y*scene.zoom;scene.transform();};
    scene.fit=()=>{scene.zoom=.92;scene.panX=0;scene.panY=0;scene.yaw=-.18;scene.pitch=.1;scene.transform();scene.draw();};
    scene.optimize=()=>{cancelAnimationFrame(scene.animation);const starts=new Map(model.nodes.map(node=>[node.id,{x:node.x,y:node.y,z:node.z}]));const targetModel={nodes:model.nodes.map(node=>({...node})),links:model.links};const targetById=forceLayout(targetModel,1.25),started=performance.now();scene.zoom=.86;scene.panX=0;scene.panY=0;const tick=timestamp=>{const progress=Math.min(1,(timestamp-started)/1000),eased=1-Math.pow(1-progress,3);model.nodes.forEach(node=>{const from=starts.get(node.id),to=targetById.get(node.id);node.x=from.x+(to.x-from.x)*eased;node.y=from.y+(to.y-from.y)*eased;node.z=from.z+(to.z-from.z)*eased;});scene.transform();scene.draw();if(progress<1)scene.animation=requestAnimationFrame(tick);else scene.update();};scene.animation=requestAnimationFrame(tick);};
    scene.startMomentum=(node,vx,vy)=>{cancelAnimationFrame(scene.momentumFrame);let speed=Math.hypot(vx,vy);const depths=connectionDepths(node.id);const tick=()=>{if(speed<.15)return;node.x+=vx;node.y+=vy;depths.forEach((depth,id)=>{const other=byId.get(id),factor=[0,.22,.07,.018][depth]||0;if(other){other.x+=vx*factor;other.y+=vy*factor;}});vx*=.9;vy*=.9;speed=Math.hypot(vx,vy);scene.draw();scene.momentumFrame=requestAnimationFrame(tick);};scene.momentumFrame=requestAnimationFrame(tick);};
    const point=event=>{const value=svg.createSVGPoint();value.x=event.clientX;value.y=event.clientY;return value.matrixTransform(viewport.getScreenCTM().inverse());};
    svg.addEventListener('pointerdown',event=>{cancelAnimationFrame(scene.animation);const group=event.target.closest?.('[data-node-id]'),node=group?byId.get(group.dataset.nodeId):null;scene.drag={node,x:event.clientX,y:event.clientY,vx:0,vy:0,mode:!node?'rotate':'node'};scene.moved=false;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)scene.moved=true;if(scene.drag.mode==='node'){const mx=dx/scene.zoom,my=dy/scene.zoom;scene.drag.node.x+=mx;scene.drag.node.y+=my;connectionDepths(scene.drag.node.id).forEach((depth,id)=>{const other=byId.get(id),factor=[0,.34,.12,.035][depth]||0;if(other){other.x+=mx*factor;other.y+=my*factor;}});scene.drag.vx=mx;scene.drag.vy=my;}else{scene.yaw+=dx*.007;scene.pitch=Math.max(-1.15,Math.min(1.15,scene.pitch+dy*.006));}scene.drag.x=event.clientX;scene.drag.y=event.clientY;scene.draw();});
    svg.addEventListener('pointerup',event=>{if(!scene.drag)return;const drag=scene.drag,id=drag.node?.id,moved=scene.moved;scene.drag=null;svg.releasePointerCapture(event.pointerId);if(drag.node&&moved)scene.startMomentum(drag.node,drag.vx,drag.vy);if(!moved){if(id)focusNation(id);else setSelection('');}});
    svg.addEventListener('click',event=>{if(event.target===svg)setSelection('');});
    svg.addEventListener('wheel',event=>{event.preventDefault();scene.zoom=Math.max(.55,Math.min(3,scene.zoom*Math.exp(-event.deltaY*.001)));scene.transform();},{passive:false});
    state.svgScene=scene;scene.update();scene.fit();
  }

  function renderMatrix(model){
    const container=$('#global-graph'),nodes=[...model.nodes].filter(node=>node.degree).sort((a,b)=>b.degree-a.degree||a.label.localeCompare(b.label)).slice(0,80),byPair=new Map(model.links.map(link=>[[link.source,link.target].sort().join('\u0000'),link])),heading=selectedOrganizations().length?'Node':'State';
    container.innerHTML=`<div class="global-graph-matrix"><table><thead><tr><th>${heading}</th>${nodes.map(node=>`<th title="${esc(node.label)}">${esc(node.label.slice(0,3))}</th>`).join('')}</tr></thead><tbody>${nodes.map(row=>`<tr><th>${esc(row.label)}</th>${nodes.map(column=>{const link=byPair.get([row.id,column.id].sort().join('\u0000')),selected=state.selected&&(row.id===state.selected||column.id===state.selected),strength=link?(link.kind==='organization'?1:link.kind==='synthetic'?.7:Math.min(1,link.years/30)):0;return `<td class="${selected?'is-selected':''}" ${link?`data-years="${link.years}" style="--cell-strength:${strength}" data-source="${esc(row.id)}" data-target="${esc(column.id)}" title="${esc(row.label)} · ${esc(column.label)} · ${esc(linkDescription(link))}`:''}></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
    container.querySelectorAll('[data-source]').forEach(cell=>cell.addEventListener('click',()=>focusNation(cell.dataset.source)));
  }

  function renderTimeline(model){
    const container=$('#global-graph'),links=[...model.links].filter(link=>Number.isFinite(link.firstYear)).sort((a,b)=>b.years-a.years||a.firstYear-b.firstYear).slice(0,70),left=250,right=30,top=30,row=24,width=1150,height=top+links.length*row+45,x=year=>left+(year-1946)/(2025-1946)*(width-left-right);
    if(!links.length){container.innerHTML='<p class="boundary-note">This relationship selection has no historical interval. Choose the Network or Adjacency matrix view.</p>';return;}
    container.innerHTML=`<div class="global-graph-timeline"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Timeline of shared-side state relationships"><line class="axis" x1="${left}" x2="${width-right}" y1="${top-10}" y2="${top-10}"></line><text x="${left}" y="${top-17}">1946</text><text x="${width-right-30}" y="${top-17}">2025</text>${links.map((link,index)=>{const selected=state.selected&&(link.source===state.selected||link.target===state.selected);return `<g data-source="${esc(link.source)}" data-target="${esc(link.target)}"><text x="${left-10}" y="${top+index*row+9}" text-anchor="end">${esc(link.source)} · ${esc(link.target)}</text><rect class="bar ${selected?'selected':''}" x="${x(link.firstYear)}" y="${top+index*row}" width="${Math.max(3,x(link.lastYear)-x(link.firstYear))}" height="14" rx="3"><title>${esc(link.source)} · ${esc(link.target)} · ${esc(linkDescription(link))}</title></rect></g>`;}).join('')}</svg></div>`;
    container.querySelectorAll('[data-source]').forEach(item=>item.addEventListener('click',()=>focusNation(item.dataset.source)));
  }

  function renderCurrentView(model){
    state.svgScene=null;
    if(state.view==='matrix')renderMatrix(model);else if(state.view==='timeline')renderTimeline(model);else renderSVG(model);
  }

  function render(){
    updatePageDescription();const model=buildModel();state.model=model;renderCurrentView(model);renderInspector();renderSummary();
  }

  function graphDataGraphML(){
    const model=state.model;if(!model)return '';
    const key=(id,target,name,type)=>`<key id="${id}" for="${target}" attr.name="${name}" attr.type="${type}"/>`;
    const value=(id,v)=>v===undefined||v===null||v===''?'':`<data key="${id}">${esc(v)}</data>`;
    const lines=['<?xml version="1.0" encoding="UTF-8"?>','<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',key('label','node','label','string'),key('kind','node','kind','string'),key('degree','node','degree','int'),key('relation','edge','relation','string'),'<graph id="global-relationship-graph" edgedefault="undirected">',value('label',`War Maps · ${relationshipLabel()}`),value('kind',`${model.nodes.length} nodes · ${model.links.length} edges`)];
    model.nodes.forEach((node,index)=>lines.push(`<node id="n${index}">`,value('label',node.label),value('kind',node.entityKind||'nation'),value('degree',node.degree),'</node>'));
    const ids=new Map(model.nodes.map((node,index)=>[node.id,`n${index}`]));model.links.forEach((link,index)=>lines.push(`<edge id="e${index}" source="${ids.get(link.source)}" target="${ids.get(link.target)}">`,value('relation',linkDescription(link)),'</edge>'));lines.push('</graph>','</graphml>');return `${lines.join('\n')}\n`;
  }

  function viewGraphData(){
    const text=graphDataGraphML(),filename='war-maps-global-graph.graphml',url=URL.createObjectURL(new Blob([text],{type:'application/xml;charset=utf-8'})),viewer=window.open('','_blank');
    if(!viewer){const link=document.createElement('a');link.href=url;link.download=filename;link.click();return;}
    viewer.document.write(`<title>Global network data</title><style>body{margin:0;background:#0b0e0c;color:#e7dfbd;font:14px monospace}header{padding:14px;border-bottom:1px solid #555}pre{padding:18px;white-space:pre-wrap}a{color:#ff8a1f}</style><header><strong>${filename}</strong> · <a id="download">Download GraphML</a></header><pre id="graphml"></pre>`);viewer.document.close();viewer.document.getElementById('download').href=url;viewer.document.getElementById('download').download=filename;viewer.document.getElementById('graphml').textContent=text;viewer.opener=null;
  }

  $('#graph-search').addEventListener('input',event=>{const needle=event.target.value.trim().toLowerCase();if(!needle)return;const match=[...state.nodes.values()].find(node=>node.label.toLowerCase().includes(needle));if(match)focusNation(match.id);});
  $('#graph-min-years').addEventListener('change',event=>{state.minYears=Number(event.target.value);state.selected='';render();});
  $('#graph-view').addEventListener('change',event=>{state.view=event.target.value;render();});
  $('#graph-relationship').addEventListener('change',event=>{state.relationship=event.target.value;state.selected='';render();});
  document.querySelectorAll('[data-organization]').forEach(input=>input.addEventListener('change',()=>{state.organizations=[...document.querySelectorAll('[data-organization]:checked')].map(item=>item.dataset.organization);if(state.organizations.length){state.relationship='organization';$('#graph-relationship').value='organization';state.selected=state.organizations.includes(input.dataset.organization)?`organization:${input.dataset.organization}`:'';}else{state.relationship='observed';$('#graph-relationship').value='observed';state.selected='';}render();state.svgScene?.focus(state.selected);}));
  $('#graph-include-ungrouped').addEventListener('change',event=>{state.includeUngrouped=event.target.checked;state.selected='';render();});
  $('#graph-topology').addEventListener('change',event=>{state.topology=event.target.value;const selected=state.selected;render();if(selected)state.svgScene?.focus(selected);});
  $('#graph-through-year').addEventListener('input',event=>{$('#graph-year-value').textContent=event.target.value;state.throughYear=Number(event.target.value);state.selected='';render();});
  $('#graph-reset').addEventListener('click',()=>{setSelection('');$('#graph-search').value='';state.svgScene?.fit();});
  $('#graph-optimize').addEventListener('click',()=>state.svgScene?.optimize());
  $('#graph-browser').addEventListener('click',()=>{const url=new URL('network-3d.html',location.href),hub=[...state.nodes.values()].sort(nodePriority)[0]?.id||'';url.searchParams.set('source','graph');url.searchParams.set('node',(state.selected||hub).startsWith('organization:')?state.selected||hub:`nation:${state.selected||hub}`);url.searchParams.set('topology',state.topology);url.searchParams.set('through',String(state.throughYear));url.searchParams.set('minYears',String(state.minYears));url.searchParams.set('relationship',state.relationship);if(state.organizations.length)url.searchParams.set('organizations',state.organizations.join(','));if(state.includeUngrouped)url.searchParams.set('includeUngrouped','1');location.href=url;});
  $('#graph-data').addEventListener('click',viewGraphData);
  $('#graph-help').addEventListener('click',()=>$('#graph-help-dialog').showModal());
  $('#graph-fit').addEventListener('click',()=>state.svgScene?.fit());
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='o'||event.metaKey||event.ctrlKey||event.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)||event.target.isContentEditable)return;event.preventDefault();state.svgScene?.optimize();});
  $('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme);}catch(error){}setSelection(state.selected);});
  const initialNode=new URLSearchParams(location.search).get('node')||'',initialNation=initialNode.startsWith('nation:')?initialNode.slice(7):initialNode;
  if(profileByName.has(initialNation))state.selected=initialNation;
  render();
})();
