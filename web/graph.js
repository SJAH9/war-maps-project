(()=>{
  'use strict';
  const data=window.WAR_MAPS_DATA;
  const $=selector=>document.querySelector(selector);
  if(!data?.nations){$('#global-graph').innerHTML='<p class="boundary-note network-error">The global atlas relationship data is unavailable.</p>';return;}
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const profileByName=new Map(data.nations.map(profile=>[profile.country,profile]));
  const state={minYears:1,throughYear:2025,view:'network',relationship:'observed',organization:'all',topology:'observed',selected:'',nodes:new Map(),links:[],adjacency:new Map(),opponents:new Map(),bridges:new Map(),svgScene:null};
  const colors={base:'#7b8051',isolated:'#4e5145',selected:'#ffd500',ally:'#8b989b',bridge:'#ff8a1f',opponent:'#8f2f27',dim:'#34372f'};
  const relationshipLabel=()=>state.relationship==='observed'?'same-side participation':state.relationship==='organization'?'organization co-membership':'displayed relationship';
  const linkDescription=link=>link.kind==='organization'?`Shared ${link.organizations?.join(', ')||'organization'} membership`:link.kind==='synthetic'?`Synthetic ${link.model} edge`:`${link.years} shared years`;

  function updatePageDescription(){
    const entityScope=state.organization==='wef',synthetic=state.topology!=='observed',title=entityScope?'World Economic Forum partner entities':state.relationship==='organization'?'States joined by organization membership':'States joined by conflict and organization records';
    const description=synthetic?`This is a deterministic ${state.topology} comparison graph. Its edges are modeled, not observed evidence.`:entityScope?'The graph connects the World Economic Forum to the sourced partner entities retained in the organization layer. These are company relationships, not state membership or conflict participation.':state.relationship==='organization'?'Each line represents shared membership in the selected sourced organization set; membership is not treated as alliance or causation.':'Every line is an observed same-side state participation record, or an explicitly selected organization relationship. Historic opposing participation remains disclosed rather than fabricated as a direct edge.';
    $('#graph-page-title').textContent=title;$('#graph-rule-description').textContent=description;$('#global-graph').setAttribute('aria-label',`${title}. ${description}`);
  }

  function normalizedRelations(profile,key){
    return (profile?.[key]||[]).filter(item=>profileByName.has(item.country));
  }

  function organizationLinks(nodes){
    const selected=state.organization==='all'?data.organizations||[]:(data.organizations||[]).filter(item=>item.id===state.organization),links=new Map(),nodeIds=new Set(nodes.map(node=>node.id));
    selected.filter(item=>item.member_count||item.entity_member_count).forEach(organization=>{
      if(organization.entity_member_count){
        const organizationId=`organization:${organization.id}`;
        if(!nodeIds.has(organizationId))return;
        organization.entity_members.forEach(member=>{
          const pair=[organizationId,`entity:${organization.id}:${member}`].sort(),key=pair.join('\u0000'),existing=links.get(key);
          if(existing)existing.organizations.push(organization.name);else links.set(key,{source:pair[0],target:pair[1],years:0,firstYear:null,lastYear:null,conflictIds:[],kind:'organization',organizations:[organization.name]});
        });
        return;
      }
      const members=organization.members.filter(member=>nodeIds.has(member));
      for(let left=0;left<members.length;left++)for(let right=left+1;right<members.length;right++){
        const pair=[members[left],members[right]].sort(),key=pair.join('\u0000'),existing=links.get(key);
        if(existing)existing.organizations.push(organization.name);else links.set(key,{source:pair[0],target:pair[1],years:0,firstYear:null,lastYear:null,conflictIds:[],kind:'organization',organizations:[organization.name]});
      }
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
    const entityOrganization=state.organization!=='all'?(data.organizations||[]).find(item=>item.id===state.organization&&item.entity_member_count):null;
    const nodes=entityOrganization?[{id:`organization:${entityOrganization.id}`,label:entityOrganization.name,profile:null,degree:0,weightedDegree:0,entityKind:'organization'},...entityOrganization.entity_members.map(member=>({id:`entity:${entityOrganization.id}:${member}`,label:member,profile:null,degree:0,weightedDegree:0,entityKind:'company'}))]:data.nations.map(profile=>({
      id:profile.country,label:profile.country,profile,
      degree:normalizedRelations(profile,'same_side_partners').filter(item=>Number(item.first_year||0)<=state.throughYear&&activeYears(item)>=state.minYears).length,
      weightedDegree:normalizedRelations(profile,'same_side_partners').filter(item=>Number(item.first_year||0)<=state.throughYear&&activeYears(item)>=state.minYears).reduce((sum,item)=>sum+activeYears(item),0)
    }));
    const edges=new Map();
    if(!entityOrganization)data.nations.forEach(profile=>normalizedRelations(profile,'same_side_partners').forEach(relation=>{
      const lastYear=Math.min(Number(relation.last_year||state.throughYear),state.throughYear);
      const years=Math.max(0,lastYear-Number(relation.first_year||lastYear)+1);
      if(years<state.minYears||Number(relation.first_year||0)>state.throughYear||relation.country===profile.country)return;
      const pair=[profile.country,relation.country].sort();const key=pair.join('\u0000');
      const existing=edges.get(key);
      if(!existing||years>existing.years)edges.set(key,{source:pair[0],target:pair[1],years,firstYear:relation.first_year,lastYear,conflictIds:relation.conflict_ids||[]});
    }));
    const observedLinks=[...edges.values()],membershipLinks=organizationLinks(nodes),observedKeys=new Set(observedLinks.map(link=>[link.source,link.target].sort().join('\u0000')));
    state.nodes=new Map(nodes.map(node=>[node.id,node]));
    const basisLinks=state.relationship==='observed'?observedLinks:state.relationship==='organization'?membershipLinks:[...observedLinks,...membershipLinks.filter(link=>!observedKeys.has([link.source,link.target].sort().join('\u0000')))];
    state.links=state.topology==='observed'?basisLinks:syntheticLinks(nodes,basisLinks,state.topology);
    state.nodes.forEach(node=>{node.degree=0;node.weightedDegree=0;});
    state.links.forEach(link=>{state.nodes.get(link.source).degree++;state.nodes.get(link.target).degree++;state.nodes.get(link.source).weightedDegree+=link.years;state.nodes.get(link.target).weightedDegree+=link.years;});
    state.adjacency=new Map(nodes.map(node=>[node.id,new Set()]));
    state.links.forEach(link=>{state.adjacency.get(link.source)?.add(link.target);state.adjacency.get(link.target)?.add(link.source);});
    state.opponents=new Map(nodes.map(node=>[node.id,new Set(normalizedRelations(node.profile,'opposing_states').map(item=>item.country))]));
    state.bridges=new Map();
    return {nodes,links:state.links.map(link=>({...link}))};
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
  const nodeRadius=node=>3.5+Math.sqrt(node.degree)*1.3;
  const selectedAllies=()=>state.selected?state.adjacency.get(state.selected)||new Set():new Set();
  const selectedOpponents=()=>state.selected?state.opponents.get(state.selected)||new Set():new Set();
  const selectedBridges=()=>new Set(state.selected?bridgePaths(state.selected).flatMap(path=>path.mutual):[]);

  function nodeColor(node){
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
    if(state.view==='network')state.svgScene?.update();else renderCurrentView(buildModel());
    renderInspector();
  }

  function listBlock(title,items,empty){
    return `<section class="global-relation-list"><h3>${esc(title)}</h3>${items.length?items.map(item=>`<button type="button" data-graph-nation="${esc(item.country)}"><span>${esc(item.country)}</span><small>${esc(item.note)}</small></button>`).join(''):`<p>${esc(empty)}</p>`}</section>`;
  }

  function renderInspector(){
    const metrics=$('#graph-node-metrics'),detail=$('#graph-node-detail');
    if(!state.selected){
      const ranked=[...state.nodes.values()].filter(node=>node.degree).sort((a,b)=>b.degree-a.degree||b.weightedDegree-a.weightedDegree||a.label.localeCompare(b.label)).slice(0,12);
      const entityScope=state.organization==='wef';
      $('#graph-node-type').textContent='Global field';$('#graph-node-title').textContent=entityScope?'Organization entity field':'All participating states';
      metrics.innerHTML=`<div><span>${entityScope?'Entities':'States'}</span><strong>${state.nodes.size.toLocaleString()}</strong></div><div><span>Displayed ties</span><strong>${state.links.length.toLocaleString()}</strong></div>`;
      detail.innerHTML=listBlock(`Highest ${relationshipLabel()} reach`,ranked.map(node=>({country:node.id,note:`${node.degree} connections · ${node.weightedDegree} observed partner-years`})),'No relationships meet this threshold.');
    }else{
      const node=state.nodes.get(state.selected),profile=node.profile;
      if(!profile){
        const organizationNode=node.entityKind==='organization';
        $('#graph-node-type').textContent=organizationNode?'Organization':'Organization partner';$('#graph-node-title').textContent=node.label;
        metrics.innerHTML=`<div><span>Entity type</span><strong>${organizationNode?'Organization':'Company'}</strong></div><div><span>Displayed degree</span><strong>${node.degree}</strong></div>`;
        detail.innerHTML=`<p class="boundary-note">This is a sourced ${organizationNode?'organization':'partner entity'} relationship. It is not a state-membership or conflict-participation claim.</p>`;
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
    const entityScope=state.organization==='wef',scope=entityScope?'entities':'states',rule=state.relationship==='observed'?'Observed same-side records':state.relationship==='organization'?'Shared organization membership':'Observed records plus shared organization membership',model=state.topology==='observed'?'Observed topology':`${state.topology} model generated on the selected node set`;
    $('#global-graph-summary').innerHTML=`<div><span>Displayed ${scope}</span><strong>${state.nodes.size.toLocaleString()}</strong></div><div><span>${scope[0].toUpperCase()+scope.slice(1)} with ties</span><strong>${active.length.toLocaleString()}</strong></div><div><span>Displayed ties</span><strong>${state.links.length.toLocaleString()}</strong></div><div><span>Graph density</span><strong>${(density*100).toFixed(2)}%</strong></div><div><span>Largest component</span><strong>${components.largest.toLocaleString()} ${scope}</strong></div><div><span>Connection rule</span><strong>${esc(rule)}</strong></div><div><span>Topology</span><strong>${esc(model)}</strong></div>`;
  }

  function forceLayout(model){
    const width=1200,height=780,nodes=model.nodes,byId=new Map(nodes.map(node=>[node.id,node]));
    nodes.sort((a,b)=>b.degree-a.degree||a.label.localeCompare(b.label)).forEach((node,index)=>{const angle=index*2.3999632297,radius=29*Math.sqrt(index+1);node.topLabel=index<12;node.x=width/2+Math.cos(angle)*radius;node.y=height/2+Math.sin(angle)*radius;node.vx=0;node.vy=0;});
    const k=Math.sqrt((width*height)/Math.max(1,nodes.length));
    for(let step=0;step<110;step++){
      const cooling=1-step/110;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const left=nodes[i],right=nodes[j],dx=left.x-right.x||.01,dy=left.y-right.y||.01,distance=Math.max(4,Math.hypot(dx,dy)),force=(k*k/distance)*.032*cooling,fx=dx/distance*force,fy=dy/distance*force;
        left.vx+=fx;left.vy+=fy;right.vx-=fx;right.vy-=fy;
      }
      model.links.forEach(link=>{const left=byId.get(link.source),right=byId.get(link.target),dx=right.x-left.x,dy=right.y-left.y,distance=Math.max(4,Math.hypot(dx,dy)),desired=54+Math.min(54,link.years*1.8),normalizer=Math.sqrt(Math.max(1,left.degree*right.degree)),force=(distance-desired)*.026*cooling/normalizer,fx=dx/distance*force,fy=dy/distance*force;left.vx+=fx;left.vy+=fy;right.vx-=fx;right.vy-=fy;});
      nodes.forEach(node=>{node.vx+=(width/2-node.x)*.00045;node.vy+=(height/2-node.y)*.00045;node.vx*=.8;node.vy*=.8;const limit=12*cooling+1,speed=Math.hypot(node.vx,node.vy);if(speed>limit){node.vx=node.vx/speed*limit;node.vy=node.vy/speed*limit;}node.x+=node.vx;node.y+=node.vy;});
    }
    const xs=nodes.map(node=>node.x),ys=nodes.map(node=>node.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(1080/Math.max(1,maxX-minX),660/Math.max(1,maxY-minY));
    nodes.forEach(node=>{node.x=60+(node.x-minX)*scale;node.y=60+(node.y-minY)*scale;});
    for(let pass=0;pass<90;pass++){
      let moved=false;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const left=nodes[i],right=nodes[j],leftSpace=nodeRadius(left)+(left.topLabel?13:3),rightSpace=nodeRadius(right)+(right.topLabel?13:3),minimum=leftSpace+rightSpace,dx=right.x-left.x||.01,dy=right.y-left.y||.01,distance=Math.max(.01,Math.hypot(dx,dy));
        if(distance>=minimum)continue;
        const shift=(minimum-distance)*.52,nx=dx/distance,ny=dy/distance;left.x-=nx*shift;left.y-=ny*shift;right.x+=nx*shift;right.y+=ny*shift;moved=true;
      }
      if(!moved)break;
    }
    nodes.forEach((node,index)=>{node.z=Math.sin(index*2.3999632297)*185;});
    return byId;
  }

  function renderSVG(model){
    const container=$('#global-graph'),ns='http://www.w3.org/2000/svg',byId=forceLayout(model);container.innerHTML='';
    const svg=document.createElementNS(ns,'svg');svg.classList.add('global-graph-svg');svg.setAttribute('viewBox','0 0 1200 780');svg.setAttribute('aria-label',`Interactive force-directed ${relationshipLabel()} graph`);
    const viewport=document.createElementNS(ns,'g'),edgeLayer=document.createElementNS(ns,'g'),nodeLayer=document.createElementNS(ns,'g');viewport.append(edgeLayer,nodeLayer);svg.append(viewport);container.append(svg);
    const incident=new Map(model.nodes.map(node=>[node.id,[]]));
    const edgeElements=model.links.map(link=>{const line=document.createElementNS(ns,'line'),source=byId.get(link.source),target=byId.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);line.setAttribute('stroke-width',.35+Math.log2(1+link.years)*.28);edgeLayer.append(line);const item={link,line};incident.get(link.source).push(item);incident.get(link.target).push(item);return item;});
    const nodeElements=new Map();
    model.nodes.forEach(node=>{const group=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),title=document.createElementNS(ns,'title'),label=document.createElementNS(ns,'text'),radius=nodeRadius(node);group.classList.add('global-graph-node');group.dataset.nodeId=node.id;group.setAttribute('transform',`translate(${node.x} ${node.y})`);circle.setAttribute('r',radius);title.textContent=`${node.label} · ${node.degree} displayed connections · ${node.weightedDegree} observed partner-years`;circle.append(title);group.append(circle);label.textContent=node.label;label.setAttribute('y',-(radius+5));label.hidden=!node.topLabel;group.append(label);nodeLayer.append(group);nodeElements.set(node.id,{group,circle,label,node});});
    const scene={svg,viewport,byId,edgeElements,nodeElements,zoom:.92,panX:0,panY:0,yaw:-.18,pitch:.1,drag:null,moved:false,animation:null};
    scene.transform=()=>viewport.setAttribute('transform',`translate(${scene.panX} ${scene.panY}) scale(${scene.zoom})`);
    scene.project=node=>{const x=node.x-600,y=node.y-390,z=node.z||0,cy=Math.cos(scene.yaw),sy=Math.sin(scene.yaw),cp=Math.cos(scene.pitch),sp=Math.sin(scene.pitch),x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp,perspective=900/(900+z2);return {x:600+x1*perspective,y:390+y1*perspective,z:z2,scale:Math.max(.62,Math.min(1.45,perspective))};};
    scene.draw=()=>{const projected=new Map(model.nodes.map(node=>[node.id,scene.project(node)]));edgeElements.forEach(({link,line})=>{const source=projected.get(link.source),target=projected.get(link.target);line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);line.setAttribute('x2',target.x);line.setAttribute('y2',target.y);});[...model.nodes].sort((a,b)=>projected.get(a.id).z-projected.get(b.id).z).forEach(node=>{const point=projected.get(node.id),parts=nodeElements.get(node.id);parts.group.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${point.scale})`);nodeLayer.append(parts.group);});};
    scene.update=()=>{scene.draw();const allies=selectedAllies(),opponents=selectedOpponents(),bridges=selectedBridges();edgeElements.forEach(({link,line})=>{const color=linkColor(link);line.setAttribute('stroke',color);line.setAttribute('opacity',state.selected?(color==='#33362f'?'.035':'.78'):'.11');});nodeElements.forEach(({group,circle,label,node},id)=>{circle.setAttribute('fill',nodeColor(node));const active=!state.selected||id===state.selected||allies.has(id)||opponents.has(id)||bridges.has(id);group.setAttribute('opacity',active?'1':'.14');circle.setAttribute('stroke',id===state.selected?'#fff0a8':'#171a14');circle.setAttribute('stroke-width',id===state.selected?'2.5':'.8');label.hidden=!(node.topLabel||id===state.selected);});};
    scene.focus=id=>{const node=byId.get(id);if(!node)return;const projected=scene.project(node);scene.zoom=1.35;scene.panX=600-projected.x*scene.zoom;scene.panY=390-projected.y*scene.zoom;scene.transform();};
    scene.fit=()=>{scene.zoom=.92;scene.panX=0;scene.panY=0;scene.yaw=-.18;scene.pitch=.1;scene.transform();scene.draw();};
    scene.optimize=()=>{cancelAnimationFrame(scene.animation);const starts=new Map(model.nodes.map(node=>[node.id,{x:node.x,y:node.y,z:node.z}])),targets=new Map(model.nodes.map((node,index)=>[node.id,{x:600+(node.x-600)*1.32,y:390+(node.y-390)*1.32,z:Math.sin(index*2.3999632297)*275}])),started=performance.now();scene.zoom=.74;scene.panX=0;scene.panY=0;const tick=timestamp=>{const progress=Math.min(1,(timestamp-started)/900),eased=1-Math.pow(1-progress,3);model.nodes.forEach(node=>{const from=starts.get(node.id),to=targets.get(node.id);node.x=from.x+(to.x-from.x)*eased;node.y=from.y+(to.y-from.y)*eased;node.z=from.z+(to.z-from.z)*eased;});scene.transform();scene.draw();if(progress<1)scene.animation=requestAnimationFrame(tick);};scene.animation=requestAnimationFrame(tick);};
    const point=event=>{const value=svg.createSVGPoint();value.x=event.clientX;value.y=event.clientY;return value.matrixTransform(viewport.getScreenCTM().inverse());};
    svg.addEventListener('pointerdown',event=>{cancelAnimationFrame(scene.animation);const group=event.target.closest?.('[data-node-id]'),node=group?byId.get(group.dataset.nodeId):null,position=point(event);scene.drag={node,x:event.clientX,y:event.clientY,px:position.x,py:position.y};scene.moved=false;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!scene.drag)return;const dx=event.clientX-scene.drag.x,dy=event.clientY-scene.drag.y;if(Math.abs(dx)+Math.abs(dy)>2)scene.moved=true;if(scene.drag.node){scene.drag.node.x+=dx/scene.zoom;scene.drag.node.y+=dy/scene.zoom;}else{scene.yaw+=dx*.007;scene.pitch=Math.max(-1.15,Math.min(1.15,scene.pitch+dy*.006));}scene.drag.x=event.clientX;scene.drag.y=event.clientY;scene.draw();});
    svg.addEventListener('pointerup',event=>{if(!scene.drag)return;const id=scene.drag.node?.id,moved=scene.moved;scene.drag=null;svg.releasePointerCapture(event.pointerId);if(!moved)setSelection(id||'');});
    svg.addEventListener('click',event=>{if(event.target===svg)setSelection('');});
    svg.addEventListener('wheel',event=>{event.preventDefault();scene.zoom=Math.max(.55,Math.min(3,scene.zoom*Math.exp(-event.deltaY*.001)));scene.transform();},{passive:false});
    state.svgScene=scene;scene.update();scene.fit();
  }

  function renderMatrix(model){
    const container=$('#global-graph'),nodes=[...model.nodes].filter(node=>node.degree).sort((a,b)=>b.degree-a.degree||a.label.localeCompare(b.label)).slice(0,80),byPair=new Map(model.links.map(link=>[[link.source,link.target].sort().join('\u0000'),link])),heading=state.organization==='wef'?'Entity': 'State';
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
    updatePageDescription();const model=buildModel();renderCurrentView(model);renderInspector();renderSummary();
  }

  $('#graph-search').addEventListener('input',event=>{const needle=event.target.value.trim().toLowerCase();if(!needle)return;const match=[...state.nodes.values()].find(node=>node.label.toLowerCase().includes(needle));if(match)focusNation(match.id);});
  $('#graph-min-years').addEventListener('change',event=>{state.minYears=Number(event.target.value);state.selected='';render();});
  $('#graph-view').addEventListener('change',event=>{state.view=event.target.value;render();});
  $('#graph-relationship').addEventListener('change',event=>{state.relationship=event.target.value;state.selected='';render();});
  $('#graph-organization').addEventListener('change',event=>{state.organization=event.target.value;state.relationship='organization';$('#graph-relationship').value='organization';state.selected='';render();});
  $('#graph-topology').addEventListener('change',event=>{state.topology=event.target.value;state.selected='';render();});
  $('#graph-through-year').addEventListener('input',event=>{$('#graph-year-value').textContent=event.target.value;state.throughYear=Number(event.target.value);state.selected='';render();});
  $('#graph-reset').addEventListener('click',()=>{setSelection('');$('#graph-search').value='';state.svgScene?.fit();});
  $('#graph-optimize').addEventListener('click',()=>state.svgScene?.optimize());
  $('#graph-fit').addEventListener('click',()=>state.svgScene?.fit());
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='o'||event.metaKey||event.ctrlKey||event.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)||event.target.isContentEditable)return;event.preventDefault();state.svgScene?.optimize();});
  $('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme);}catch(error){}setSelection(state.selected);});
  render();
})();
