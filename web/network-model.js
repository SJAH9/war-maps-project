(() => {
  const LAND_WEIGHT=.70,ASYMMETRY_BONUS=.15;
  const aliases={'Bosnia-Herzegovina':'Bosnia and Herzegovina','Cambodia (Kampuchea)':'Cambodia','DR Congo (Zaire)':'Democratic Republic of the Congo','Ivory Coast':"Cote d'Ivoire",'Myanmar (Burma)':'Myanmar','Russia (Soviet Union)':'Russia','Serbia (Yugoslavia)':'Serbia','South Vietnam':'Vietnam','Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'Yemen','Zimbabwe (Rhodesia)':'Zimbabwe'};
  const display=value=>aliases[value]||value;
  const split=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
  const regimeCountry=(name,nations)=>{
    const match=String(name||'').match(/^Government of (.+)$/i);if(!match)return '';
    const country=display(match[1].trim());return nations.has(country)?country:'';
  };
  const eventPosture=event=>{
    const host=display(event.country||event.network_location||''),a=(event.side_a_states||[]).map(display),b=(event.side_b_states||[]).map(display);
    const hostSide=a.includes(host)&&!b.includes(host)?'A':b.includes(host)&&!a.includes(host)?'B':'';
    const foreignSide=hostSide==='A'?'B':hostSide==='B'?'A':'';
    const fa=Number(event.fatalities?.side_a||0),fb=Number(event.fatalities?.side_b||0);
    const reciprocal=fa>0&&fb>0,asymmetrical=(fa>0)!==(fb>0);
    const casualtySide=fa>fb?'A':fb>fa?'B':'';
    const recovery=/\b(recaptur|retak|regain|recover(?:ed|ing)? territory|liberat(?:e|ed|ing))\b/i.test(`${event.description||''} ${event.source_headline||''}`);
    let role='indeterminate',certainty=.5;
    if(hostSide&&casualtySide){role=casualtySide===hostSide?'defensive':'offensive';certainty=LAND_WEIGHT+(asymmetrical?ASYMMETRY_BONUS:0);}
    else if(hostSide){role='mixed';certainty=LAND_WEIGHT;}
    if(recovery&&casualtySide===hostSide){role='defensive';certainty=Math.max(certainty,.8);}
    certainty=Math.min(.95,certainty);
    const reasons=[];
    if(hostSide)reasons.push(`territorial host is coded on Side ${hostSide} (70% base weight)`);else reasons.push('no belligerent side matches the reported territory');
    if(asymmetrical)reasons.push('one-sided reported military casualties add 15% confidence');
    else if(reciprocal)reasons.push('reciprocal casualties add no directional weight');
    if(recovery)reasons.push('source text contains territorial-recovery language; recovery remains defensive in this model');
    reasons.push('the source schema does not identify the acting party; this is a model, not a legal finding');
    return {host,hostSide,foreignSide,casualtySide,role,certainty,defense:role==='defensive'?certainty:role==='offensive'?1-certainty:.5,offense:role==='offensive'?certainty:role==='defensive'?1-certainty:.5,reciprocal,asymmetrical,recovery,reasons};
  };
  const mix=(a,b,t)=>{const parse=value=>value.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16));const x=parse(a),y=parse(b);return `#${x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')}`;};
  const postureColor=posture=>posture?.role==='indeterminate'||posture?.role==='mixed'?'#9b855f':mix('#3978b8','#c74732',posture.offense);
  const warDates=events=>[...new Map(events.slice().sort((a,b)=>a.date_start.localeCompare(b.date_start)||String(a.id).localeCompare(String(b.id))).map(event=>[event.date_start,event.date_start])).values()];
  const nodeBuffer=node=>({conflict:29,side:27,nation:24,location:18,actor:14,observation:7}[node.kind]||12);
  const collisionForce=(radius=nodeBuffer,padding=3)=>{
    let nodes=[];
    const force=alpha=>{
      const cellSize=58,cells=new Map(),key=(x,y,z)=>`${x}:${y}:${z}`;
      nodes.forEach((node,index)=>{const x=Math.floor((node.x||0)/cellSize),y=Math.floor((node.y||0)/cellSize),z=Math.floor((node.z||0)/cellSize),cell=key(x,y,z);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(index);});
      nodes.forEach((node,index)=>{
        const cx=Math.floor((node.x||0)/cellSize),cy=Math.floor((node.y||0)/cellSize),cz=Math.floor((node.z||0)/cellSize);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)(cells.get(key(cx+dx,cy+dy,cz+dz))||[]).forEach(otherIndex=>{
          if(otherIndex<=index)return;const other=nodes[otherIndex],minimum=radius(node)+radius(other)+padding;
          let x=(other.x||0)-(node.x||0),y=(other.y||0)-(node.y||0),z=(other.z||0)-(node.z||0),distance=Math.hypot(x,y,z);
          if(distance>=minimum)return;if(distance<.001){const angle=((index+1)*2.399963)%6.283185;x=Math.cos(angle);y=Math.sin(angle);z=((index%3)-1)*.35;distance=Math.hypot(x,y,z);}
          const push=(minimum-distance)/distance*.62*Math.max(.18,alpha),px=x*push,py=y*push,pz=z*push,aFixed=node.fx!=null,bFixed=other.fx!=null;
          if(!aFixed){node.vx=(node.vx||0)-px*(bFixed?1:.5);node.vy=(node.vy||0)-py*(bFixed?1:.5);node.vz=(node.vz||0)-pz*(bFixed?1:.5);}
          if(!bFixed){other.vx=(other.vx||0)+px*(aFixed?1:.5);other.vy=(other.vy||0)+py*(aFixed?1:.5);other.vz=(other.vz||0)+pz*(aFixed?1:.5);}
        });
      });
    };
    force.initialize=value=>{nodes=value||[];};return force;
  };
  const anchorForce=(initialTargets,strength=node=>node.kind==='observation'?.16:node.kind==='location'?.12:node.kind==='side'?.13:node.kind==='nation'?.11:node.kind==='actor'?.10:.11)=>{
    let nodes=[],targets=initialTargets;
    const force=alpha=>nodes.forEach(node=>{if(node.fx!=null)return;const target=targets.get(node.id);if(!target)return;const pull=strength(node)*Math.max(.12,alpha);node.vx=(node.vx||0)+(target.x-(node.x||0))*pull;node.vy=(node.vy||0)+(target.y-(node.y||0))*pull;node.vz=(node.vz||0)+(target.z-(node.z||0))*pull;});
    force.initialize=value=>{nodes=value||[];};force.targets=value=>{if(value){targets=value;return force;}return targets;};return force;
  };
  const graphDistances=(start,edges,maxDepth=4)=>{const adjacency=new Map(),id=value=>typeof value==='object'?value.id:value;edges.forEach(edge=>{const a=id(edge.from??edge.source),b=id(edge.to??edge.target);if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);});const distance=new Map([[start,0]]),queue=[start];while(queue.length){const current=queue.shift(),depth=distance.get(current);if(depth>=maxDepth)continue;(adjacency.get(current)||[]).forEach(next=>{if(distance.has(next))return;distance.set(next,depth+1);queue.push(next);});}distance.delete(start);return distance;};
  const dragPullFactor=(depth,distance)=>{const base=[0,.82,.42,.14,.035][depth]||0,scale=Math.min(1.8,.55+distance/180);return base*scale;};
  const weeklyOrbit=(event,anchor,originDate,slot=0)=>{const day=Math.max(0,Math.round((Date.parse(`${event.date_start}T00:00:00Z`)-Date.parse(`${originDate}T00:00:00Z`))/86400000)),weekday=new Date(`${event.date_start}T00:00:00Z`).getUTCDay(),week=Math.floor(day/7),angle=weekday*Math.PI*2/7+slot*.055,radius=31+Math.min(16,slot*3.5);return {x:anchor.x+Math.cos(angle)*radius,y:anchor.y+Math.sin(angle)*radius,z:anchor.z+week*7+(slot%3-1)*1.7};};
  const spherePoint=(index,count,radius,center={x:0,y:0,z:0},phase=0)=>{const y=1-2*(index+.5)/Math.max(1,count),radial=Math.sqrt(Math.max(0,1-y*y)),angle=index*2.399963229728653+phase;return {x:center.x+Math.cos(angle)*radial*radius,y:center.y+y*radius,z:center.z+Math.sin(angle)*radial*radius};};
  const topologyNames={equilibrium:'Equilibrium sphere',coalitions:'Coalition shells',prisoner:"Prisoner's dilemma proxy",'third-party':'Interested third party',pirates:'Pirates allocation proxy',temporal:'Temporal orbits'};
  const topologyPositions=(nodes,{conflictId,method='equilibrium',originDate=''})=>{
    if(!topologyNames[method])method='equilibrium';
    const positions=new Map(),conflict=`conflict:${conflictId}`,centers={A:{x:-255,y:-70,z:0},B:{x:255,y:-70,z:0}};
    if(method==='prisoner'){centers.A={x:-235,y:-105,z:-105};centers.B={x:235,y:105,z:105};}
    if(method==='third-party'){centers.A={x:-275,y:-65,z:0};centers.B={x:275,y:-65,z:0};}
    if(method==='pirates'){centers.A={x:-220,y:-105,z:-55};centers.B={x:220,y:-105,z:55};}
    if(method==='temporal'){centers.A={x:-255,y:-145,z:0};centers.B={x:255,y:-145,z:0};}
    positions.set(conflict,{x:0,y:-205,z:0});positions.set('side:a',centers.A);positions.set('side:b',centers.B);
    const sideOf=node=>node.metadata?.side||node.metadata?.sides?.[0]||'';
    ['A','B'].forEach(side=>{const members=nodes.filter(node=>['nation','actor'].includes(node.kind)&&sideOf(node)===side),nations=members.filter(node=>node.kind==='nation'),actors=members.filter(node=>node.kind==='actor');nations.forEach((node,index)=>positions.set(node.id,spherePoint(index,nations.length,82,centers[side],side==='A'?.4:Math.PI+.4)));actors.forEach((node,index)=>positions.set(node.id,spherePoint(index,actors.length,54,centers[side],side==='A'?1.1:Math.PI+1.1)));});
    const unaffiliated=nodes.filter(node=>['nation','actor'].includes(node.kind)&&!sideOf(node));unaffiliated.forEach((node,index)=>positions.set(node.id,spherePoint(index,unaffiliated.length,method==='third-party'?112:72,{x:0,y:-15,z:0},.7)));
    const locations=nodes.filter(node=>node.kind==='location').sort((a,b)=>a.label.localeCompare(b.label));
    locations.forEach((node,index)=>{let point=spherePoint(index,locations.length,method==='temporal'?195:165,{x:0,y:72,z:0},.25);if(method==='coalitions'){const angle=index/Math.max(1,locations.length)*Math.PI*2;point={x:Math.cos(angle)*145,y:65+Math.sin(angle)*96,z:Math.sin(angle*2)*80};}if(method==='third-party'){const angle=index/Math.max(1,locations.length)*Math.PI*2;point={x:0,y:70+Math.cos(angle)*145,z:Math.sin(angle)*145};}if(method==='prisoner'){const quadrant=index%4,level=Math.floor(index/4);point={x:(quadrant<2?-1:1)*(75+level*26),y:(quadrant%2?-1:1)*(65+level*20),z:(quadrant===0||quadrant===3?-1:1)*(90+level*18)};}if(method==='pirates'){const rank=Number(node.networkScience?.degree||0),angle=index*2.399963;point={x:Math.cos(angle)*(92+index*8),y:35+rank*5,z:Math.sin(angle)*(92+index*8)};}positions.set(node.id,point);});
    const events=nodes.filter(node=>node.metadata?.event).sort((a,b)=>a.metadata.event.date_start.localeCompare(b.metadata.event.date_start)||a.id.localeCompare(b.id)),origin=originDate||events[0]?.metadata.event.date_start||'1970-01-01',last=events.at(-1)?.metadata.event.date_start||origin,weeks=Math.max(0,Math.floor((Date.parse(`${last}T00:00:00Z`)-Date.parse(`${origin}T00:00:00Z`))/604800000)),slots=new Map();
    events.forEach((node,index)=>{const event=node.metadata.event,location=display(event.network_location||event.country||event.place||'Unspecified location'),locationId=`location:${location}`,base=positions.get(locationId)||{x:0,y:55,z:0},key=`${locationId}|${event.date_start}`,slot=slots.get(key)||0;slots.set(key,slot+1);let point=weeklyOrbit(event,{x:base.x,y:base.y,z:base.z-weeks*3.5},origin,slot);if(method==='prisoner'){const reciprocal=node.metadata.posture?.reciprocal,offensive=node.metadata.posture?.role==='offensive';point.x+=(offensive?1:-1)*58;point.z+=(reciprocal?-1:1)*58;}if(method==='pirates'){const angle=index*2.399963,radius=42+Math.sqrt(index)*8;point={x:base.x+Math.cos(angle)*radius,y:base.y+index*2.8,z:base.z+Math.sin(angle)*radius};}positions.set(node.id,point);});
    const annual=nodes.filter(node=>node.kind==='observation'&&!node.metadata?.event);annual.forEach((node,index)=>positions.set(node.id,spherePoint(index,annual.length,105,{x:0,y:60,z:0},1.3)));
    nodes.forEach((node,index)=>{if(!positions.has(node.id))positions.set(node.id,spherePoint(index,nodes.length,120,{x:0,y:30,z:0}));});return positions;
  };
  const strategicModel=graph=>{
    const adjacency=new Map(graph.nodes.map(node=>[node.id,new Set()]));graph.edges.forEach(edge=>{adjacency.get(edge.from)?.add(edge.to);adjacency.get(edge.to)?.add(edge.from);});
    const sideA='side:a',sideB='side:b';let exclusive=0,bilateral=0;
    graph.nodes.filter(node=>!['conflict','side','observation'].includes(node.kind)).forEach(node=>{const links=adjacency.get(node.id)||new Set(),a=links.has(sideA),b=links.has(sideB);if(a&&b)bilateral++;else if(a||b)exclusive++;});
    const denominator=exclusive+bilateral;
    const zeroSumProxy=denominator?exclusive/denominator:0;
    const equilibrium=graph.nodes.filter(node=>{
      if(['conflict','side','observation'].includes(node.kind))return false;
      const links=adjacency.get(node.id)||new Set();
      if(links.has(sideA)&&links.has(sideB))return true;
      return node.networkScience?.role?.includes('bottleneck')&&node.networkScience.betweenness>0;
    }).sort((a,b)=>(b.networkScience?.betweenness||0)-(a.networkScience?.betweenness||0)).slice(0,8);
    return {zeroSumProxy,equilibrium,exclusive,bilateral,disclosure:'Structural proxy: share of side-connected entities attached exclusively to one side. It does not measure utility, intent, legal status, or prove a zero-sum conflict.'};
  };
  window.WAR_MAPS_NETWORK_MODEL={display,split,regimeCountry,eventPosture,postureColor,warDates,nodeBuffer,collisionForce,anchorForce,graphDistances,dragPullFactor,weeklyOrbit,spherePoint,topologyNames,topologyPositions,strategicModel};
})();
