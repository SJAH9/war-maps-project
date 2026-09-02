(() => {
  const data = window.WAR_MAPS_DATA;
  const health = window.LIFE_DEATH_METRICS;
  if (!data) return;

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const conflictsById = new Map(data.conflicts.map(item => [item.id, item]));
  const nationsByName = new Map(data.nations.map(item => [item.country, item]));
  const nationsByMapName = new Map(data.nations.map(item => [item.map_name, item]));
  const yearsByConflict = new Map();
  const eventsByConflict = new Map();
  const vdemBoundaryYear = Math.max(...data.state_conditions.map(item => item.year));
  const conditionsByCountryYear = new Map(data.state_conditions.map(item => [`${item.country}|${item.year}`, item]));
  const vdemAliases = {'Cambodia (Kampuchea)':'Cambodia','DR Congo (Zaire)':'Democratic Republic of the Congo','Myanmar (Burma)':'Burma/Myanmar','Myanmar':'Burma/Myanmar','Russia (Soviet Union)':'Russia','South Vietnam':'Republic of Vietnam','Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'South Yemen','Bosnia-Herzegovina':'Bosnia and Herzegovina'};
  data.conflict_years.forEach(row => {
    if (!yearsByConflict.has(row.conflict_id)) yearsByConflict.set(row.conflict_id, []);
    yearsByConflict.get(row.conflict_id).push(row);
  });
  data.events.forEach(event => {
    if (!event.conflict_id) return;
    if (!eventsByConflict.has(event.conflict_id)) eventsByConflict.set(event.conflict_id, []);
    eventsByConflict.get(event.conflict_id).push(event);
  });

  const healthAliases = {'Bolivia (Plurinational State of)':'Bolivia','Cabo Verde':'Cape Verde',"Côte d'Ivoire":"Cote d'Ivoire",'Democratic Republic of the Congo':'Democratic Republic of the Congo','Iran (Islamic Republic of)':'Iran','Lao People\'s Democratic Republic':'Laos','Micronesia (Federated States of)':'Micronesia','Republic of Korea':'South Korea','Republic of Moldova':'Moldova','Russian Federation':'Russia','Syrian Arab Republic':'Syria','Türkiye':'Turkey','United Republic of Tanzania':'Tanzania','United States of America':'United States','Venezuela (Bolivarian Republic of)':'Venezuela','Viet Nam':'Vietnam'};
  const healthByMap = new Map((health?.locations||[]).map(location=>[healthAliases[location.name]||location.name,{...location,mortality:new Map(location.mortality.map(row=>[row[0],row[1]])),fertility:new Map(location.fertility.map(row=>[row[0],row[1]]))}]));
  const state = {start:2026,end:2026,windowSize:1,type:'all',regime:'all',search:'',activeOnly:false,selected:'',satellites:false,satelliteConstellation:'iceye-ukraine-support',healthLayer:'none',healthYear:2023,transitions:false};
  const satellitePathCache = new Map();
  const currentTheme = () => document.documentElement.dataset.theme === 'dark';
  const nationUrl = country => `nation.html?country=${encodeURIComponent(country)}`;
  const openNation = country => { location.href = nationUrl(country); };
  const overlaps = (start, end) => end >= state.start && start <= state.end;
  const conflictInWindow = conflict => conflict.years_active.some(year => year >= state.start && year <= state.end);
  const regimeInWindow = nation => {
    if (state.start > vdemBoundaryYear) {
      const latest = nation.regime_periods.at(-1);
      return latest && String(latest.code) === state.regime;
    }
    return nation.regime_periods.some(period => String(period.code) === state.regime && period.end_year >= state.start && period.start_year <= Math.min(state.end, vdemBoundaryYear));
  };

  function filteredConflicts() {
    const needle = state.search.toLowerCase();
    return data.conflicts.filter(conflict => {
      if (!conflictInWindow(conflict)) return false;
      if (state.type !== 'all' && conflict.type !== state.type) return false;
      if (state.activeOnly && !conflict.active_at_source_boundary) return false;
      if (!needle) return true;
      return [conflict.title, conflict.region, conflict.type, conflict.incompatibility, ...conflict.locations, ...conflict.parties_a, ...conflict.parties_b, ...conflict.secondary_parties]
        .join(' ').toLowerCase().includes(needle);
    });
  }

  function mapPacket(conflicts) {
    const counts = new Map(data.nations.map(nation => [nation.map_name, 0]));
    conflicts.forEach(conflict => conflict.plot_locations.forEach(location => counts.set(location, (counts.get(location) || 0) + 1)));
    return {locations:[...counts.keys()], counts:[...counts.values()]};
  }

  function highlightedNations(conflicts) {
    if (state.regime !== 'all') return data.nations.filter(nation=>state.healthLayer!=='none'?String(regimeAtYear(nation,state.healthYear)?.code)===state.regime:regimeInWindow(nation));
    const names = new Set(conflicts.flatMap(conflict => conflict.plot_locations));
    return data.nations.filter(nation => names.has(nation.map_name));
  }

  const regimeAtYear = (nation,year) => nation?.regime_periods.find(period=>period.start_year<=year&&period.end_year>=year) || null;
  const transitionsInWindow = nation => nation.regime_periods.some((period,index)=>index>0&&period.start_year>=state.start&&period.start_year<=Math.min(state.end,vdemBoundaryYear));
  function healthRows() {
    return [...healthByMap].map(([country,record])=>({country,record,nation:nationsByMapName.get(country)||nationsByName.get(country),value:record[state.healthLayer]?.get(state.healthYear)})).filter(item=>Number.isFinite(item.value));
  }

  function satelliteTraces() {
    if (!state.satellites || !window.satellite) return [];
    const relation=data.satellite_constellations.find(item=>item.constellation_id===state.satelliteConstellation);
    if(!relation)return [];
    if(satellitePathCache.has(relation.constellation_id))return satellitePathCache.get(relation.constellation_id);
    const snapshot=new Date(Math.max(...relation.objects.map(item=>new Date(item.EPOCH).getTime())));
    const lat=[];const lon=[];const text=[];const markerLat=[];const markerLon=[];const markerText=[];
    relation.objects.forEach(object=>{
      try{
        const satrec=window.satellite.json2satrec(object);
        let previous=null;
        for(let minute=-50;minute<=50;minute+=2){
          const time=new Date(snapshot.getTime()+minute*60000);
          const position=window.satellite.propagate(satrec,time).position;
          if(!position)continue;
          const point=window.satellite.eciToGeodetic(position,window.satellite.gstime(time));
          const latitude=point.latitude*180/Math.PI;
          const longitude=((point.longitude*180/Math.PI+540)%360)-180;
          if(previous!==null&&Math.abs(longitude-previous)>180){lat.push(null);lon.push(null);text.push(null);}
          lat.push(latitude);lon.push(longitude);text.push(`${object.OBJECT_NAME} · public GP ground track`);previous=longitude;
          if(minute===0){markerLat.push(latitude);markerLon.push(longitude);markerText.push(`${object.OBJECT_NAME} · NORAD ${object.NORAD_CAT_ID}`);}
        }
        lat.push(null);lon.push(null);text.push(null);
      }catch(error){ /* A malformed public element remains omitted at this render frontier. */ }
    });
    const traces=[
      {type:'scattergeo',mode:'lines',lat,lon,text,hovertemplate:'%{text}<extra>approximate path</extra>',line:{color:relation.display_color,width:1},opacity:.32,name:'Public satellite paths'},
      {type:'scattergeo',mode:'markers',lat:markerLat,lon:markerLon,text:markerText,hovertemplate:'%{text}<extra>snapshot position</extra>',marker:{size:4,color:'#f8d35e',line:{color:relation.display_color,width:1}},name:'Snapshot positions'}
    ];
    satellitePathCache.set(relation.constellation_id,traces);
    return traces;
  }

  function drawMap(conflicts) {
    if (!window.Plotly) {
      $('#map').innerHTML = '<p style="padding:24px">The map library is unavailable. The conflict register and nation pages remain usable.</p>';
      return;
    }
    const packet = mapPacket(conflicts);
    const regimeMode = state.regime !== 'all';
    const healthMode = state.healthLayer !== 'none' && health;
    const regimeColors = {'0':'#3e1e18','1':'#9a5a43','2':'#6d7442','3':'#657078'};
    const regimeColor = regimeColors[state.regime] || '#f07800';
    const regimeSet = new Set(regimeMode ? data.nations.filter(nation=>healthMode?String(regimeAtYear(nation,state.healthYear)?.code)===state.regime:regimeInWindow(nation)).map(item => item.map_name) : []);
    const rows = healthMode ? healthRows() : [];
    const locations = healthMode ? rows.map(item=>item.country) : packet.locations;
    const values = healthMode ? rows.map(item=>item.value) : packet.counts;
    const healthLabel = state.healthLayer==='mortality'?'deaths per 100,000':'births per woman';
    const traces = [{
      type:'choropleth', locationmode:'country names', locations, z:values,
      text:locations,
      hovertemplate:healthMode?`<b>%{location}</b><br>%{z:.2f} ${healthLabel}<extra>${state.healthYear}</extra>`:'<b>%{location}</b><br>%{z} recorded conflicts in window<extra></extra>',
      colorscale:healthMode?(state.healthLayer==='mortality'?[[0,'#d8c58f'],[.45,'#6f7568'],[1,'#273849']]:[[0,'#d8c58f'],[.5,'#9a5a43'],[1,'#4b3045']]):[[0,'#d8c58f'],[.2,'#aaa071'],[.48,'#9a5a43'],[.72,'#b95235'],[1,'#3e1e18']],
      zmin:Math.min(0,...values),zmax:Math.max(1,...values), marker:{line:{color:currentTheme()?'#454637':'#d8c99a',width:.55}}, colorbar:{title:healthMode?healthLabel:'conflicts',thickness:9,len:.55}
    }];
    if(regimeMode){const matched=[...regimeSet].filter(name=>healthMode?healthByMap.has(name):true);traces.push({type:'scattergeo',mode:'markers',locationmode:'country names',locations:matched,text:matched,hovertemplate:`<b>%{location}</b><br>V-Dem ${data.regime_types.find(item=>String(item.code)===state.regime)?.name||'regime'}<extra></extra>`,marker:{size:9,color:regimeColor,symbol:'square-open',line:{color:regimeColor,width:2.4}}});}
    if(state.transitions){const changed=data.nations.filter(transitionsInWindow).map(item=>item.map_name);traces.push({type:'scattergeo',mode:'markers',locationmode:'country names',locations:changed,text:changed,hovertemplate:'<b>%{location}</b><br>V-Dem category transition in selected window<extra></extra>',marker:{size:11,color:'#7dff36',symbol:'circle-open',line:{color:'#7dff36',width:2.6}}});}
    if (state.start <= 2026 && state.end >= 2026) {
      const visibleIds = new Set(conflicts.map(item => item.id));
      const events = data.events.filter(event => visibleIds.has(event.conflict_id) && event.latitude !== null && event.longitude !== null);
      if (events.length) traces.push({type:'scattergeo',mode:'markers',lat:events.map(e=>e.latitude),lon:events.map(e=>e.longitude),text:events.map(e=>`${e.date_start} · ${e.place || e.country}`),hovertemplate:'%{text}<extra>candidate event</extra>',marker:{size:5,color:'#d52222',opacity:.86,line:{color:'#ffd500',width:.7}}});
    }
    traces.push(...satelliteTraces());
    const dark=currentTheme();
    const layout = {margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',showlegend:false,geo:{projection:{type:'natural earth'},bgcolor:'rgba(0,0,0,0)',showframe:false,showcoastlines:true,coastlinecolor:dark?'#7b8067':'#555b2f',coastlinewidth:.75,showcountries:true,countrycolor:dark?'#aaa071':'#e6d9b0',countrywidth:.6,showocean:true,oceancolor:dark?'#1b2019':'#8e9271',showlakes:true,lakecolor:dark?'#242a21':'#9da080',lonaxis:{showgrid:true,gridcolor:dark?'#343a2d':'#74785d',gridwidth:.4},lataxis:{showgrid:true,gridcolor:dark?'#343a2d':'#74785d',gridwidth:.4}}};
    Plotly.react('map', traces, layout, {responsive:true,displayModeBar:false,scrollZoom:true});
    const map = $('#map');
    map.removeAllListeners?.('plotly_click');
    map.on('plotly_click', event => {
      const point = event.points?.[0];
      if (!point || !point.location) return;
      const nation = nationsByMapName.get(point.location) || nationsByName.get(point.location);
      if (nation) openNation(nation.country);
    });
    $('#map-note').textContent = healthMode ? `${health.metrics[state.healthLayer].label}, ${state.healthYear}; conflict events remain overlaid where the selected window supports them.` : 'Select any nation to open its map, timeline, relations, and raw records.';
  }

  function renderList(conflicts) {
    const label = state.start === state.end ? String(state.end) : `${state.start}-${state.end}`;
    $('#result-title').textContent = `${label} observations`;
    $('#result-count').textContent = conflicts.length;
    const list = $('#conflict-list');
    const needle = state.search.trim().toLowerCase();
    const nationHits = needle ? data.nations.filter(item => item.country.toLowerCase().includes(needle)).slice(0,8) : [];
    const nationMarkup = nationHits.map(item => `<button class="conflict-item nation-result" data-nation="${esc(item.country)}"><strong>${esc(item.country)}</strong><span>Nation record · ${item.conflict_count} conflicts · ${item.years_active.length} active years</span></button>`).join('');
    const conflictMarkup = conflicts.map(conflict => `<button class="conflict-item ${state.selected===conflict.id?'active':''}" data-id="${esc(conflict.id)}"><strong>${esc(conflict.title)}</strong><span>${esc(conflict.type)} · ${esc(conflict.incompatibility)} · ${conflict.first_active_year}-${conflict.last_active_year}</span></button>`).join('');
    list.innerHTML = nationMarkup + conflictMarkup || '<p class="boundary-note" style="margin:18px">No nation or conflict record occupies the selected address.</p>';
    list.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openConflict(button.dataset.id)));
    list.querySelectorAll('[data-nation]').forEach(button => button.addEventListener('click', () => openNation(button.dataset.nation)));
  }

  function enclosureMarkup(enclosure) {
    if (!enclosure) return '<p class="boundary-note">No enclosure address has been encoded.</p>';
    const statement = node => esc(node?.departure?.statement || 'Unopened E frontier');
    const departure = enclosure.departure || {};
    const metadata = [...(departure.measurements || []).map(item=>`measure: ${item}`),...(departure.join_keys || []).map(item=>`join: ${item}`)];
    return `<div class="enclosure-address"><div><b>Outer E</b>${statement(enclosure.outer)}<small>${esc(enclosure.outer?.address||'')}</small></div><div><b>Specified departure</b>${esc(departure.statement)}<small>${esc(departure.id||'')}</small></div><div><b>Inner E</b>${statement(enclosure.inner)}<small>${esc(enclosure.inner?.address||'')}</small></div></div>${metadata.length?`<div class="departure-meta">${metadata.map(item=>`<span>${esc(item)}</span>`).join('')}</div>`:''}<div class="frontier"><p class="eyebrow">Final Frontier · next questions</p><ul>${(enclosure.frontier_questions||[]).map(question=>`<li>${esc(question)}</li>`).join('')}</ul></div>`;
  }

  function openConflict(id, updateUrl=true) {
    const conflict = conflictsById.get(id);
    if (!conflict) return;
    state.selected=id; $('#detail').hidden=false;
    $('#detail-network-link').href=`network.html?conflict=${encodeURIComponent(id)}`;
    $('#detail-kicker').textContent=`${conflict.region} · ${conflict.type}`;
    $('#detail-title').textContent=conflict.title;
    $('#detail-meta').innerHTML=[`${conflict.first_active_year}-${conflict.last_active_year}`,conflict.incompatibility,`${conflict.years_active.length} conflict-year${conflict.years_active.length===1?'':'s'}`,conflict.source_id,conflict.active_at_source_boundary?'active at source boundary':'closed before source boundary'].map(item=>`<span>${esc(item)}</span>`).join('');
    const nationNames=[...new Set(conflict.plot_locations)].filter(name=>nationsByMapName.has(name)||nationsByName.has(name));
    $('#nation-chips').innerHTML=nationNames.map(name=>{const nation=nationsByMapName.get(name)||nationsByName.get(name);return `<a href="${nationUrl(nation.country)}">${esc(nation.country)}</a>`}).join('');
    const rows=yearsByConflict.get(id)||[];
    $('#timeline').innerHTML=rows.length?rows.map(row=>`<div class="year-mark ${row.intensity===2?'war':''}" style="height:${row.intensity===2?82:38}px" title="${row.year}: intensity ${row.intensity}"><em>${row.year}</em></div>`).join(''):'<p>Candidate event chronology begins below.</p>';
    const events=eventsByConflict.get(id)||[];
    $('#event-stream').innerHTML=events.length?[...events].reverse().map(event=>`<article class="event"><time>${esc(event.date_start)}</time><p><b>${esc(event.place||event.country)}</b><br>${esc(event.side_a)} ↔ ${esc(event.side_b)}</p><small>${esc(event.code_status)} · ${event.source_count} source${event.source_count===1?'':'s'} · fatalities ${event.fatalities.low}/${event.fatalities.best}/${event.fatalities.high}</small></article>`).join(''):'<p class="boundary-note">No event-level source is loaded for this conflict. The annual conflict-year record remains available.</p>';
    $('#enclosure').innerHTML=enclosureMarkup(conflict.enclosure);
    const claims=data.claims.filter(claim=>claim.conflict_id===id);
    $('#claims').innerHTML=claims.length?claims.map(claim=>`<article class="claim"><p>${esc(claim.claim)}</p><small>${esc(claim.source_type)} · ${esc(claim.observed_at)}</small>${enclosureMarkup(claim.enclosure)}</article>`).join(''):'<p class="boundary-note">No curated claim occupies this address yet.</p>';
    const conditionYear=Math.min(conflict.last_active_year,2024);
    const conditions=conflict.locations.map(location=>conditionsByCountryYear.get(`${vdemAliases[location]||location}|${conditionYear}`)).filter(Boolean);
    $('#state-conditions').innerHTML=conditions.length?conditions.map(item=>`<article class="claim"><p><b>${esc(item.country)} · ${item.year}</b></p><small>${esc(item.regime.name||'No regime classification')} · ${Object.entries(item.conditions).map(([key,value])=>`${esc(key)} ${value===null?'NA':value.toFixed(2)}`).join(' · ')}</small></article>`).join(''):'<p class="boundary-note">No V-Dem condition row occupies this country-year address.</p>';
    const projections=data.prompted_projections.filter(item=>item.conflict_id===null||item.conflict_id===id);
    $('#projections').innerHTML=projections.map(item=>`<article class="claim"><p>${esc(item.claim||item.prompt)}</p><small>${esc(item.branch_class||item.source_type)}${item.branch_point?` · branch: ${esc(item.branch_point)}`:''}</small>${enclosureMarkup(item.enclosure)}</article>`).join('')||'<p class="boundary-note">No prompted branch occupies this conflict address yet.</p>';
    if(updateUrl) history.replaceState(null,'',`?conflict=${encodeURIComponent(id)}#detail`);
    drawMap(filteredConflicts()); $('#detail').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderRelated(conflicts) {
    const nations=highlightedNations(conflicts);
    const names=new Set(nations.map(item=>item.map_name));
    const territoryNames=new Set(nations.flatMap(item=>[item.country,item.map_name]));
    const conflictIds=new Set(conflicts.filter(conflict=>conflict.plot_locations.some(name=>names.has(name))).map(item=>item.id));
    const relevant=data.conflicts.filter(item=>conflictIds.has(item.id));
    const fatalities=data.events.filter(event=>state.start<=2026&&state.end>=2026&&territoryNames.has(event.country)).reduce((sum,event)=>{sum.low+=event.fatalities.low;sum.best+=event.fatalities.best;sum.high+=event.fatalities.high;sum.events++;return sum},{low:0,best:0,high:0,events:0});
    const regime=data.regime_types.find(item=>String(item.code)===state.regime);
    $('#related-title').textContent=regime?regime.name:'World conflict field';
    const regimeWindow=state.healthLayer!=='none'?`health observation year ${state.healthYear}`:state.start>vdemBoundaryYear?`latest available classification (${vdemBoundaryYear}), carried to the map boundary`:`at least once in ${state.start}-${Math.min(state.end,vdemBoundaryYear)}`;
    $('#related-note').textContent=regime?`Nations classified by V-Dem as ${regime.name.toLowerCase()} using the ${regimeWindow}.`:'Statistics describe nations and conflict records visible in the current map enclosure.';
    const satelliteRelation=data.satellite_constellations.find(item=>item.constellation_id===state.satelliteConstellation);
    const stats=[['Highlighted nations',nations.length],['Unique conflicts',conflictIds.size],['Interstate conflicts',relevant.filter(item=>item.type==='interstate').length],['Territorial incompatibilities',relevant.filter(item=>item.incompatibility==='territory').length],['Candidate event fatalities',fatalities.events?`${fatalities.low.toLocaleString()} / ${fatalities.best.toLocaleString()} / ${fatalities.high.toLocaleString()}`:'Not available'],['Public satellite paths',state.satellites&&satelliteRelation?`${satelliteRelation.object_count} approximate tracks`:'Layer off'],['Military spending','Not available in UCDP/V-Dem']];
    $('#related-stats').innerHTML=stats.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    renderRegimeHealth();
  }

  function renderRegimeHealth(){
    if(!health){$('#regime-health-comparison').innerHTML='<p class="boundary-note">Population-health data are unavailable in this build.</p>';return;}
    const groups=new Map(data.regime_types.map(item=>[String(item.code),{name:item.name,mortality:[],fertility:[]}]))
    healthByMap.forEach((record,country)=>{
      const nation=nationsByMapName.get(country)||nationsByName.get(country),period=regimeAtYear(nation,state.healthYear),group=period&&groups.get(String(period.code));
      if(!group)return;
      const mortality=record.mortality.get(state.healthYear),fertility=record.fertility.get(state.healthYear);
      if(Number.isFinite(mortality))group.mortality.push(mortality);if(Number.isFinite(fertility))group.fertility.push(fertility);
    });
    const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
    $('#regime-health-comparison').innerHTML=`<div class="comparison-table"><div class="comparison-head"><b>V-Dem class</b><b>Mortality</b><b>Fertility</b><b>n</b></div>${[...groups.values()].map(group=>`<div><span>${esc(group.name)}</span><span>${mean(group.mortality)?.toFixed(1)??'NA'}</span><span>${mean(group.fertility)?.toFixed(2)??'NA'}</span><span>${Math.max(group.mortality.length,group.fertility.length)}</span></div>`).join('')}</div><p class="boundary-note">${state.healthYear} descriptive means: mortality deaths per 100,000; fertility births per woman. Association is not a causal estimate.</p>`;
    const transitions=[];
    data.nations.forEach(nation=>nation.regime_periods.forEach((period,index)=>{
      if(!index||period.start_year<1980||period.start_year>2023||period.start_year<state.start||period.start_year>state.end)return;
      const record=healthByMap.get(nation.map_name),prior=nation.regime_periods[index-1];if(!record)return;
      const beforeF=record.fertility.get(period.start_year-1),afterF=record.fertility.get(period.start_year),beforeM=record.mortality.get(period.start_year-1),afterM=record.mortality.get(period.start_year);
      transitions.push({nation:nation.country,year:period.start_year,from:prior.name,to:period.name,fertility:Number.isFinite(beforeF)&&Number.isFinite(afterF)?afterF-beforeF:null,mortality:Number.isFinite(beforeM)&&Number.isFinite(afterM)?afterM-beforeM:null});
    }));
    $('#transition-health-list').innerHTML=state.transitions?(transitions.length?`<h3>Transitions in ${state.start}-${state.end}</h3>${transitions.slice(0,18).map(item=>`<article><b>${esc(item.nation)} · ${item.year}</b><span>${esc(item.from)} → ${esc(item.to)}</span><small>one-year change: mortality ${item.mortality===null?'NA':item.mortality.toFixed(1)} · fertility ${item.fertility===null?'NA':item.fertility.toFixed(2)}</small></article>`).join('')}`:`<p class="boundary-note">No overlapping regime transition and health observation occupies the selected window.</p>`):'<p class="boundary-note">Enable regime transitions to map category changes and inspect adjacent-year health observations.</p>';
  }

  function renderStates() {
    $('#state-table').innerHTML=data.states.map(item=>`<tr data-state="${esc(item.state)}"><td><button class="state-link" type="button">${esc(item.state)}</button></td><td>${item.conflict_count}</td><td>${item.territorial_conflict_count}</td><td>${item.interstate_conflict_count}</td><td>${item.active_at_source_boundary_count}</td></tr>`).join('');
    document.querySelectorAll('[data-state]').forEach(row=>row.querySelector('button').addEventListener('click',()=>openNation(row.dataset.state)));
  }
  function renderWarDialog() {
    const needle=$('#war-dialog-search').value.trim().toLowerCase();
    const region=$('#war-dialog-region').value;
    const matches=data.conflicts.filter(conflict=>{
      if(region!=='all'&&conflict.region!==region)return false;
      if(!needle)return true;
      return [conflict.title,conflict.territory_name,conflict.region,conflict.type,...conflict.locations,...conflict.parties_a,...conflict.parties_b,...conflict.secondary_parties].join(' ').toLowerCase().includes(needle);
    }).sort((a,b)=>b.last_active_year-a.last_active_year||a.title.localeCompare(b.title));
    $('#war-dialog-count').textContent=`${matches.length} conflict${matches.length===1?'':'s'}`;
    const list=$('#war-dialog-list');
    list.innerHTML=matches.map(conflict=>`<button type="button" data-war-id="${esc(conflict.id)}"><span><strong>${esc(conflict.title)}</strong><small>${esc(conflict.region)} · ${esc(conflict.type)} · ${esc(conflict.incompatibility)}</small></span><b>${conflict.first_active_year}-${conflict.last_active_year}</b></button>`).join('')||'<p class="boundary-note">No conflict matches this address.</p>';
    list.scrollTop=0;
    document.querySelectorAll('[data-war-id]').forEach(button=>button.addEventListener('click',()=>{$('#war-dialog').close();openConflict(button.dataset.warId);}));
  }
  function renderSources(){ $('#source-list').innerHTML=data.sources.map(source=>`<article class="source-item"><h3>${esc(source.title)}</h3><p>${esc(source.coverage)}</p><p><b>${esc(source.enclosure)}</b><br>${esc(source.publisher)} · ${esc(source.license)} · retrieved ${esc(source.retrieved)}</p><a href="${esc(source.url)}">Source and download</a></article>`).join(''); }
  function updateWindowLabels(){ $('#year-start-output').value=state.start;$('#year-end-output').value=state.end;$('#health-map-year-output').value=state.healthYear; }
  function render(){ const conflicts=filteredConflicts();renderList(conflicts);drawMap(conflicts);renderRelated(conflicts);updateWindowLabels(); }

  $('#year-start').addEventListener('input',event=>{state.start=Math.min(Number(event.target.value),state.end);event.target.value=state.start;state.windowSize=null;$('#window-size').value='';render();});
  $('#year-end').addEventListener('input',event=>{state.end=Math.max(Number(event.target.value),state.start);if(state.windowSize){state.start=Math.max(1946,state.end-state.windowSize+1);$('#year-start').value=state.start;}render();});
  $('#window-size').addEventListener('change',event=>{state.windowSize=Number(event.target.value);state.start=state.windowSize>=100?1946:Math.max(1946,state.end-state.windowSize+1);$('#year-start').value=state.start;render();});
  $('#search').addEventListener('input',event=>{state.search=event.target.value;render();});
  $('#type-filter').addEventListener('change',event=>{state.type=event.target.value;render();});
  $('#regime-filter').addEventListener('change',event=>{state.regime=event.target.value;render();});
  $('#health-layer').addEventListener('change',event=>{state.healthLayer=event.target.value;render();});
  $('#health-map-year').addEventListener('input',event=>{state.healthYear=Number(event.target.value);render();});
  $('#transition-toggle').addEventListener('change',event=>{state.transitions=event.target.checked;render();});
  $('#active-only').addEventListener('change',event=>{state.activeOnly=event.target.checked;render();});
  $('#satellite-toggle').addEventListener('change',event=>{state.satellites=event.target.checked;if(state.satellites&&!window.satellite){state.satellites=false;event.target.checked=false;$('#satellite-note').textContent='Orbit library unavailable · layer remains off';}else{const relation=data.satellite_constellations.find(item=>item.constellation_id===state.satelliteConstellation);$('#satellite-note').textContent=state.satellites?`${relation?.object_count||0} approximate tracks · frozen public snapshot`:'Frozen public orbit snapshot · constellation relation';}render();});
  $('#satellite-constellation').addEventListener('change',event=>{state.satelliteConstellation=event.target.value;satellitePathCache.clear();render();});
  $('#reset').addEventListener('click',()=>{Object.assign(state,{start:2026,end:2026,windowSize:1,type:'all',regime:'all',search:'',activeOnly:false,selected:'',satellites:false,healthLayer:'none',healthYear:2023,transitions:false});$('#year-start').value=2026;$('#year-end').value=2026;$('#window-size').value='1';$('#search').value='';$('#type-filter').value='all';$('#regime-filter').value='all';$('#health-layer').value='none';$('#health-map-year').value=2023;$('#transition-toggle').checked=false;$('#active-only').checked=false;$('#satellite-toggle').checked=false;$('#satellite-note').textContent='Frozen public orbit snapshot · constellation relation';$('#detail').hidden=true;history.replaceState(null,'','./');render();});
  $('#close-detail').addEventListener('click',()=>{state.selected='';$('#detail').hidden=true;history.replaceState(null,'','./');render();});
  $('#theme-toggle').addEventListener('click',()=>{const theme=currentTheme()?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('war-maps-theme',theme);}catch(error){ /* Theme still applies for this page. */ }render();});
  $('#war-dialog-open').addEventListener('click',()=>{$('#war-dialog-search').value='';$('#war-dialog-region').value='all';renderWarDialog();$('#war-dialog').showModal();requestAnimationFrame(()=>$('#war-dialog-search').focus());});
  $('#war-dialog-search').addEventListener('input',renderWarDialog);
  $('#war-dialog-region').addEventListener('change',renderWarDialog);
  $('#war-dialog').addEventListener('click',event=>{if(event.target===$('#war-dialog'))$('#war-dialog').close();});

  renderStates();renderSources();renderWarDialog();render();
  const initial=new URLSearchParams(location.search).get('conflict');
  if(initial)setTimeout(()=>openConflict(initial,false),100);
})();
