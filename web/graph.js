(()=>{
  'use strict';
  const data=window.WAR_MAPS_DATA;
  const $=selector=>document.querySelector(selector);
  if(!data?.nations){$('#global-graph').innerHTML='<p class="boundary-note network-error">The global atlas relationship data is unavailable.</p>';return;}
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const profileByName=new Map(data.nations.map(profile=>[profile.country,profile]));
  const state={minYears:1,throughYear:2025,view:'network',relationship:'observed',organizations:[],includeUngrouped:false,topology:'observed',selected:'',nodes:new Map(),links:[],model:null,adjacency:new Map(),opponents:new Map(),bridges:new Map(),svgScene:null};
  const colors={base:'#7b8051',isolated:'#4e5145',selected:'#ffd500',ally:'#8b989b',bridge:'#ff8a1f',opponent:'#8f2f27',dim:'#34372f'};
  const relationshipLabel=()=>state.relationship==='observed'?'same-side participation':state.relationship==='organization'?'organization co-membership':'displayed relationship';
  const linkDescription=link=>link.kind==='organization'?`Shared ${link.organizations?.join(', ')||'organization'} membership`:link.kind==='synthetic'?`Synthetic ${link.model} edge`:`${link.years} shared years`;

  function selectedOrganizations(){return (data.organizations||[]).filter(item=>state.organizations.includes(item.id));}
  function organizationMembers(organization){return organization.member_count?organization.members:(organization.entity_nations||[]);}

  function updatePageDescription(){
    const selected=selectedOrganizations(),names=selected.map(item=>item.name).join(', '),wef=selected.some(item=>item.id==='wef'),synthetic=state.topology!=='observed',title=wef&&selected.length===1?'WEF partner home-nation network':selected.length?`Membership network: ${names}`:state.relationship==='organization'?'Organization membership network':'States joined by conflict and organization records';
    const scopeNote=state.includeUngrouped?' Ungrouped nations are included.':' Only nations belonging to a selected organization are included.';
    const description=synthetic?`This is a deterministic ${state.topology} comparison graph. Its edges are modeled, not observed evidence.`:wef?'WEF partner companies are resolved to disclosed home nations for graph placement. The organization node connects those nations; this does not infer state membership, conflict participation, or corporate control.':selected.length&&state.relationship==='observed'?`Observed same-side participation is filtered to members of ${names}.${scopeNote} Organization nodes are hidden in this view.`:selected.length?`Each selected organization is a node connected to its sourced member states.${scopeNote} Membership is not treated as alliance, coordination, or causation.`:'Every line is an observed same-side state participation record, or an explicitly selected organization relationship. Historic opposing participation remains disclosed rather than fabricated as a direct edge.';
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

  function syntheticLinks(nodes,basis,model){
    const ordered=[...nodes].sort((a,b)=>a.id.localeCompare(b.id)),n=ordered.length,random=seededRandom(`${model}|${ordered.map(node=>node.id).join('|')}`),links=[],keys=new Set();
    const add=(left,right)=>{if(left===right)return;const pair=[left,right].sort(),key=pair.join('\u0000');if(keys.has(key))return;keys.add(key);links.push({source:pair[0],target:pair[1],years:0,firstYear:null,lastYear:null,conflictIds:[],kind:'synthetic',model});};
    if(n<2)return links;
    const density=Math.max(0.01,Math.min(.35,basis.length/Math.max(1,n*(n-1)/2)));
    if(model==='erdos-renyi'){for(let left=0;left<n;left++)for(let right=left+1;right<n;right++)if(random()<density)add(ordered[left].id,ordered[right].id);}
    else if(model==='barabasi-albert'){
      const m=Math.max(1,Math.min(4,n-1)),degrees=new Map(ordered.map(node=>[node.id,0]));
      for(let left=0;left<m+1;left++)for(let right=left+1;right<m+1;right++){add(ordered[left].id,ordered[right].id);degrees.set(ordered[left].id,degrees.get(ordered[left].id)+1);degrees.set(ordered[right].id,degrees.get(ordered[right].id)+1);}
      for(let index=m+1;index<n;index++){const chosen=new Set(),total=[...degrees.values()].reduce((sum,value)=>sum+value,0)||1;while(chosen.size<m){let cursor=random()*total;for(const node of ordered.slice(0,index)){cursor-=degrees.get(node.id);if(cursor<=0){chosen.add(node.id);break;}}}chosen.forEach(target=>{add(ordered[index].id,target);degrees.set(ordered[index].id,degrees.get(ordered[index].id)+1);degrees.set(target,degrees.get(target)+1);});}
    }else{
      const k=Math.max(2,Math.min(n-1,Math.floor(Math.sqrt(n))|1)),half=Math.floor(k/2),rewire=.12;
      for(let index=0;index<n;index++)for(let step=1;step<=half;step++){let target=(index+step)%n;if(random()<rewire){const candidates=ordered.filter((_,candidate)=>candidate!==index&&!keys.has([ordered[index].id,ordered[candidate].id].sort().join('\u0000')));if(candidates.length)target=ordered.indexOf(candidates[Math.floor(random()*candidates.length)]);}add(ordered[index].id,ordered[target].id);}
    }
    return links;
  }

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
    state.nodes=new Map(visibleNodes.map(node=>[node.id,node]));
    state.links=state.topology==='observed'?visibleBasis:syntheticLinks(visibleNodes,visibleBasis,state.topology);
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
    if(!state.selected)return link.kind==='synthetic'?'#b46b52':link.kind==='organization'?'#d78b2f':'#686d55';
    const source=endpointId(link.source),target=endpointId(link.target);
    if(source===state.selected||target===state.selected)return colors.ally;
    const bridges=selectedBridges(),opponents=selectedOpponents();
    if((bridges.has(source)&&opponents.has(target))||(bridges.has(target)&&opponents.has(source)))return colors.bridge;
    return '#33362f';
  }

  function setSelection(id){
    state.selected=state.nodes.has(id)?id:'';
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
    if(!state.nodes.has(id))return;
    setSelection(id);state.svgScene?.focus(id);
  }

  function renderSummary(){
    const components=connectedComponents(),active=[...state.nodes.values()].filter(node=>node.degree>0),possible=state.nodes.size*(state.nodes.size-1)/2,density=possible?state.links.length/possible:0;
    const organizationScope=selectedOrganizations().length,scope=organizationScope?'nodes':'states',rule=state.relationship==='observed'?'Observed same-side records':state.relationship==='organization'?'Organization nodes connected to members':'Observed records plus organization membership',model=state.topology==='observed'?'Observed topology':`${state.topology} model generated on the selected node set`;
    $('#global-graph-summary').innerHTML=`<div><span>Displayed ${scope}</span><strong>${state.nodes.size.toLocaleString()}</strong></div><div><span>${scope[0].toUpperCase()+scope.slice(1)} with ties</span><strong>${active.length.toLocaleString()}</strong></div><div><span>Displayed ties</span><strong>${state.links.length.toLocaleString()}</strong></div><div><span>Graph density</span><strong>${(density*100).toFixed(2)}%</strong></div><div><span>Largest component</span><strong>${components.largest.toLocaleString()} ${scope}</strong></div><div><span>Connection rule</span><strong>${esc(rule)}</strong></div><div><span>Topology</span><strong>${esc(model)}</strong></div>`;
  }

  function forceLayout(model,spread=1){
    // The previous 2D collision pass used minimum=leftSpace+rightSpace; 3D repulsion now supplies that spacing in all axes.
    const width=1200,height=780,nodes=model.nodes,byId=new Map(nodes.map(node=>[node.id,node])),random=seededRandom(nodes.map(node=>node.id).join('|'));
    const hubs=[...nodes].sort((a,b)=>b.degree-a.degree||a.label.localeCompare(b.label)).slice(0,Math.max(3,Math.min(12,Math.ceil(Math.sqrt(nodes.length)))));
    const hubSet=new Set(hubs.map(node=>node.id));
    nodes.forEach((node,index)=>{const hub=hubSet.has(node.id)?node:hubs[index%hubs.length]||node,angle=index*2.3999632297,rad=hub===node?120:245+random()*100;node.x=600+(hub===node?Math.cos(angle)*rad:Math.cos(angle)*rad);node.y=390+Math.sin(angle)*rad*.62;node.z=(hub===node?0:(random()-.5)*340)*spread;node.vx=node.vy=node.vz=0;node.topLabel=index<Math.min(16,nodes.length);});
    for(let step=0;step<150;step++){
      const cooling=1-step/150;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j],dx=a.x-b.x||.01,dy=a.y-b.y||.01,dz=a.z-b.z||.01,d=Math.max(12,Math.hypot(dx,dy,dz)),f=7200/(d*d)*cooling,fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;a.vx+=fx;a.vy+=fy;a.vz+=fz;b.vx-=fx;b.vy-=fy;b.vz-=fz;
      }
      model.links.forEach(link=>{const a=byId.get(link.source),b=byId.get(link.target),dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.max(8,Math.hypot(dx,dy,dz)),desired=(link.kind==='organization'?95:145)+Math.min(80,link.years*2),f=(d-desired)*.012*cooling,fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;a.vx+=fx;a.vy+=fy;a.vz+=fz;b.vx-=fx;b.vy-=fy;b.vz-=fz;});
      nodes.forEach(node=>{node.vx+=(600-node.x)*.0007;node.vy+=(390-node.y)*.0007;node.vz-=node.z*.0005;node.vx*=.82;node.vy*=.82;node.vz*=.82;node.x+=node.vx;node.y+=node.vy;node.z+=node.vz;});
    }
    const max=Math.max(1,...nodes.map(node=>Math.hypot(node.x-600,(node.y-390)*1.1,node.z*.45)));nodes.forEach(node=>{node.x=600+(node.x-600)*Math.min(1,520/max);node.y=390+(node.y-390)*Math.min(1,330/max);node.z*=Math.min(1,520/max);});
    return byId;
  }

  function renderSVG(model){
    const container=$('#global-graph'),ns='http://www.w3.org/2000/svg',byId=forceLayout(model);container.innerHTML='';
    const svg=document.createElementNS(ns,'svg');svg.classList.add('global-graph-svg');svg.setAttribute('viewBox','0 0 1200 780');svg.setAttribute('aria-label',`Interactive force-directed ${relationshipLabel()} graph`);
    const viewport=document.createElementNS(ns,'g'),edgeLayer=document.createElementNS(ns,'g'),nodeLayer=document.createElementNS(ns,'g');viewport.append(edgeLayer,nodeLayer);svg.append(viewport);container.append(svg);
    const incident=new Map(model.nodes.map(node=>[node.id,[]]));
    const edgeElements=model.links.map(link=>{const line=document.createElementNS(ns,'line'),source=byId.get(link.source),target=byId.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);line.setAttribute('stroke-width',link.kind==='organization'?2.2:link.kind==='synthetic'?1.35:.85+Math.log2(1+link.years)*.3);edgeLayer.append(line);const item={link,line};incident.get(link.source).push(item);incident.get(link.target).push(item);return item;});
    const nodeElements=new Map();
    model.nodes.forEach(node=>{const group=document.createElementNS(ns,'g'),title=document.createElementNS(ns,'title'),label=document.createElementNS(ns,'text'),radius=nodeRadius(node);group.classList.add('global-graph-node');group.dataset.nodeId=node.id;group.setAttribute('transform',`translate(${node.x} ${node.y})`);title.textContent=`${node.label} · ${node.degree} displayed connections · ${node.weightedDegree} observed partner-years`;let shapes=[];if(node.entityKind==='organization'){const diamond=document.createElementNS(ns,'polygon');diamond.setAttribute('points',`0,-${radius} ${radius},0 0,${radius} -${radius},0`);group.append(diamond);shapes=[diamond];}else{const top=document.createElementNS(ns,'polygon'),left=document.createElementNS(ns,'polygon'),right=document.createElementNS(ns,'polygon');top.setAttribute('points',`0,-${radius} ${radius*.82},${radius*.5} 0,${radius*.82} -${radius*.82},${radius*.5}`);left.setAttribute('points',`0,-${radius} -${radius*.82},${radius*.5} 0,${radius*.82}`);right.setAttribute('points',`0,-${radius} ${radius*.82},${radius*.5} 0,${radius*.82}`);group.append(top,left,right);shapes=[top,left,right];}group.append(title);label.textContent=node.label;label.setAttribute('y',-(radius+5));label.hidden=!node.topLabel;group.append(label);nodeLayer.append(group);nodeElements.set(node.id,{group,shapes,label,node});});
    const scene={svg,viewport,byId,edgeElements,nodeElements,zoom:.92,panX:0,panY:0,yaw:-.18,pitch:.1,drag:null,moved:false,animation:null,momentumFrame:null};
    scene.transform=()=>viewport.setAttribute('transform',`translate(${scene.panX} ${scene.panY}) scale(${scene.zoom})`);
    scene.project=node=>{const x=node.x-600,y=node.y-390,z=node.z||0,cy=Math.cos(scene.yaw),sy=Math.sin(scene.yaw),cp=Math.cos(scene.pitch),sp=Math.sin(scene.pitch),x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp,perspective=900/(900+z2);return {x:600+x1*perspective,y:390+y1*perspective,z:z2,scale:Math.max(.62,Math.min(1.45,perspective))};};
    scene.draw=()=>{const projected=new Map(model.nodes.map(node=>[node.id,scene.project(node)]));edgeElements.forEach(({link,line})=>{const source=projected.get(link.source),target=projected.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);});[...model.nodes].sort((a,b)=>projected.get(a.id).z-projected.get(b.id).z).forEach(node=>{const point=projected.get(node.id),parts=nodeElements.get(node.id);parts.group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${point.scale})`);nodeLayer.append(parts.group);});};
    scene.update=()=>{scene.draw();const allies=selectedAllies(),opponents=selectedOpponents(),bridges=selectedBridges();edgeElements.forEach(({link,line})=>{const color=linkColor(link);line.setAttribute('stroke',color);line.setAttribute('opacity',state.selected?(color==='#33362f'?'.06':'.88'):'.34');});nodeElements.forEach(({group,shapes,label,node},id)=>{const color=nodeColor(node),active=!state.selected||id===state.selected||allies.has(id)||opponents.has(id)||bridges.has(id);shapes.forEach((shape,index)=>{shape.setAttribute('fill',index===0?color:(node.entityKind==='organization'?color:index===1?'#555b3d':'#a49a55'));shape.setAttribute('stroke',id===state.selected?'#fff0a8':'#171a14');shape.setAttribute('stroke-width',id===state.selected?'2.5':'.8');});group.setAttribute('opacity',active?'1':'.14');label.hidden=!(node.topLabel||id===state.selected);});};
    scene.focus=id=>{const node=byId.get(id);if(!node)return;const projected=scene.project(node);scene.zoom=1.35;scene.panX=600-projected.x*scene.zoom;scene.panY=390-projected.y*scene.zoom;scene.transform();};
    scene.fit=()=>{scene.zoom=.92;scene.panX=0;scene.panY=0;scene.yaw=-.18;scene.pitch=.1;scene.transform();scene.draw();};
    scene.optimize=()=>{cancelAnimationFrame(scene.animation);const starts=new Map(model.nodes.map(node=>[node.id,{x:node.x,y:node.y,z:node.z}]));const targetModel={nodes:model.nodes.map(node=>({...node})),links:model.links};const targetById=forceLayout(targetModel,1.25),started=performance.now();scene.zoom=.86;scene.panX=0;scene.panY=0;const tick=timestamp=>{const progress=Math.min(1,(timestamp-started)/1000),eased=1-Math.pow(1-progress,3);model.nodes.forEach(node=>{const from=starts.get(node.id),to=targetById.get(node.id);node.x=from.x+(to.x-from.x)*eased;node.y=from.y+(to.y-from.y)*eased;node.z=from.z+(to.z-from.z)*eased;});scene.transform();scene.draw();if(progress<1)scene.animation=requestAnimationFrame(tick);else scene.update();};scene.animation=requestAnimationFrame(tick);};
    scene.startMomentum=(node,vx,vy)=>{cancelAnimationFrame(scene.momentumFrame);let speed=Math.hypot(vx,vy);const tick=()=>{if(speed<.15)return;node.x+=vx;node.y+=vy;model.links.forEach(link=>{if(link.source!==node.id&&link.target!==node.id)return;const other=byId.get(link.source===node.id?link.target:link.source);other.x+=(node.x-other.x)*.018;other.y+=(node.y-other.y)*.018;});vx*=.9;vy*=.9;speed=Math.hypot(vx,vy);scene.draw();scene.momentumFrame=requestAnimationFrame(tick);};scene.momentumFrame=requestAnimationFrame(tick);};
    const point=event=>{const value=svg.createSVGPoint();value.x=event.clientX;value.y=event.clientY;return value.matrixTransform(viewport.getScreenCTM().inverse());};
    svg.addEventListener('pointerdown',event=>{cancelAnimationFrame(scene.animation);const group=event.target.closest?.('[data-node-id]'),node=group?byId.get(group.dataset.nodeId):null;scene.drag={node,x:event.clientX,y:event.clientY,vx:0,vy:0,mode:!node&&(event.shiftKey||event.altKey)?'rotate':'pan'};scene.moved=false;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)scene.moved=true;if(scene.drag.node){scene.drag.node.x+=dx/scene.zoom;scene.drag.node.y+=dy/scene.zoom;scene.drag.vx=dx/scene.zoom;scene.drag.vy=dy/scene.zoom;}else if(scene.drag.mode==='rotate'){scene.yaw+=dx*.007;scene.pitch=Math.max(-1.15,Math.min(1.15,scene.pitch+dy*.006));}else{scene.panX+=dx;scene.panY+=dy;scene.transform();}scene.drag.x=event.clientX;scene.drag.y=event.clientY;scene.draw();});
    svg.addEventListener('pointerup',event=>{if(!scene.drag)return;const drag=scene.drag,id=drag.node?.id,moved=scene.moved;scene.drag=null;svg.releasePointerCapture(event.pointerId);if(drag.node&&moved)scene.startMomentum(drag.node,drag.vx,drag.vy);if(!moved)setSelection(id||'');});
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
    if(!links.length){container.innerHTML=`<p class="boundary-note">${state.topology!=='observed'?'Synthetic topology has no historical interval.':'Organization co-membership has no time interval in this layer.'} Choose the Network or Adjacency matrix view.</p>`;return;}
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
  $('#graph-topology').addEventListener('change',event=>{state.topology=event.target.value;state.selected='';render();});
  $('#graph-through-year').addEventListener('input',event=>{$('#graph-year-value').textContent=event.target.value;state.throughYear=Number(event.target.value);state.selected='';render();});
  $('#graph-reset').addEventListener('click',()=>{setSelection('');$('#graph-search').value='';state.svgScene?.fit();});
  $('#graph-optimize').addEventListener('click',()=>state.svgScene?.optimize());
  $('#graph-data').addEventListener('click',viewGraphData);
  $('#graph-help').addEventListener('click',()=>$('#graph-help-dialog').showModal());
  $('#graph-fit').addEventListener('click',()=>state.svgScene?.fit());
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='o'||event.metaKey||event.ctrlKey||event.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)||event.target.isContentEditable)return;event.preventDefault();state.svgScene?.optimize();});
  $('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme);}catch(error){}setSelection(state.selected);});
  render();
})();
