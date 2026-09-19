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
  window.WAR_MAPS_NETWORK_MODEL={display,split,regimeCountry,eventPosture,postureColor,warDates,strategicModel};
})();
