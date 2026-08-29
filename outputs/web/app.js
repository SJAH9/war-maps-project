(() => {
  const data = window.WAR_MAPS_DATA;
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

  const state = {start:2026,end:2026,windowSize:1,type:'all',regime:'all',search:'',activeOnly:false,selected:'',satellites:false,satelliteConstellation:'iceye-ukraine-support'};
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
    if (state.regime !== 'all') return data.nations.filter(regimeInWindow);
    const names = new Set(conflicts.flatMap(conflict => conflict.plot_locations));
    return data.nations.filter(nation => names.has(nation.map_name));
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
    const regimeColors = {'0':'#7c3f93','1':'#ef6a5b','2':'#16a6a0','3':'#36a269'};
    const regimeColor = regimeColors[state.regime] || '#e7a33d';
    const regimeSet = new Set(regimeMode ? data.nations.filter(regimeInWindow).map(item => item.map_name) : []);
    const values = regimeMode ? packet.locations.map(name => regimeSet.has(name) ? 1 : 0) : packet.counts;
    const traces = [{
      type:'choropleth', locationmode:'country names', locations:packet.locations, z:values,
      text:packet.locations,
      hovertemplate: regimeMode ? '<b>%{location}</b><br>V-Dem regime present in window<extra></extra>' : '<b>%{location}</b><br>%{z} recorded conflicts in window<extra></extra>',
      colorscale: regimeMode ? [[0,'#e8eee7'],[.01,'#e8eee7'],[1,regimeColor]] : [[0,'#e8eee7'],[.18,'#65c5b9'],[.42,'#f1c453'],[.68,'#ef7458'],[1,'#6b2a88']],
      zmin:0, zmax:regimeMode ? 1 : Math.max(1,...values), marker:{line:{color:currentTheme()?'#343934':'#f4f3ed',width:.45}}, colorbar:{title:regimeMode?'match':'conflicts',thickness:9,len:.55}
    }];
    if (state.start <= 2026 && state.end >= 2026) {
      const visibleIds = new Set(conflicts.map(item => item.id));
      const events = data.events.filter(event => visibleIds.has(event.conflict_id) && event.latitude !== null && event.longitude !== null);
      if (events.length) traces.push({type:'scattergeo',mode:'markers',lat:events.map(e=>e.latitude),lon:events.map(e=>e.longitude),text:events.map(e=>`${e.date_start} · ${e.place || e.country}`),hovertemplate:'%{text}<extra>candidate event</extra>',marker:{size:5,color:'#ef7458',opacity:.82,line:{color:'#f8d35e',width:.6}}});
    }
    traces.push(...satelliteTraces());
    const dark=currentTheme();
    const layout = {margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',showlegend:false,geo:{projection:{type:'natural earth'},bgcolor:'rgba(0,0,0,0)',showframe:false,showcoastlines:true,coastlinecolor:dark?'#6d8b91':'#234f5b',coastlinewidth:.75,showcountries:true,countrycolor:dark?'#809397':'#ffffff',countrywidth:.6,showocean:true,oceancolor:dark?'#071a24':'#79b4c1',showlakes:true,lakecolor:dark?'#0c2732':'#65a5b3',lonaxis:{showgrid:true,gridcolor:dark?'#173944':'#55929f',gridwidth:.4},lataxis:{showgrid:true,gridcolor:dark?'#173944':'#55929f',gridwidth:.4}}};
    Plotly.react('map', traces, layout, {responsive:true,displayModeBar:false,scrollZoom:true});
    const map = $('#map');
    map.removeAllListeners?.('plotly_click');
    map.on('plotly_click', event => {
      const point = event.points?.[0];
      if (!point || point.data.type !== 'choropleth') return;
      const nation = nationsByMapName.get(point.location) || nationsByName.get(point.location);
      if (nation) openNation(nation.country);
    });
    $('#map-note').textContent = regimeMode ? 'Select an illuminated nation to open its nation record.' : 'Select any nation to open its map, timeline, relations, and raw records.';
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
    const regimeWindow=state.start>vdemBoundaryYear?`latest available classification (${vdemBoundaryYear}), carried to the map boundary`:`at least once in ${state.start}-${Math.min(state.end,vdemBoundaryYear)}`;
    $('#related-note').textContent=regime?`Nations classified by V-Dem as ${regime.name.toLowerCase()} using the ${regimeWindow}.`:'Statistics describe nations and conflict records visible in the current map enclosure.';
    const satelliteRelation=data.satellite_constellations.find(item=>item.constellation_id===state.satelliteConstellation);
    const stats=[['Highlighted nations',nations.length],['Unique conflicts',conflictIds.size],['Interstate conflicts',relevant.filter(item=>item.type==='interstate').length],['Territorial incompatibilities',relevant.filter(item=>item.incompatibility==='territory').length],['Candidate event fatalities',fatalities.events?`${fatalities.low.toLocaleString()} / ${fatalities.best.toLocaleString()} / ${fatalities.high.toLocaleString()}`:'Not available'],['Public satellite paths',state.satellites&&satelliteRelation?`${satelliteRelation.object_count} approximate tracks`:'Layer off'],['Military spending','Not available in UCDP/V-Dem']];
    $('#related-stats').innerHTML=stats.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
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
  function updateWindowLabels(){ $('#year-start-output').value=state.start;$('#year-end-output').value=state.end; }
  function render(){ const conflicts=filteredConflicts();renderList(conflicts);drawMap(conflicts);renderRelated(conflicts);updateWindowLabels(); }

  $('#year-start').addEventListener('input',event=>{state.start=Math.min(Number(event.target.value),state.end);event.target.value=state.start;state.windowSize=null;$('#window-size').value='';render();});
  $('#year-end').addEventListener('input',event=>{state.end=Math.max(Number(event.target.value),state.start);if(state.windowSize){state.start=Math.max(1946,state.end-state.windowSize+1);$('#year-start').value=state.start;}render();});
  $('#window-size').addEventListener('change',event=>{state.windowSize=Number(event.target.value);state.start=state.windowSize>=100?1946:Math.max(1946,state.end-state.windowSize+1);$('#year-start').value=state.start;render();});
  $('#search').addEventListener('input',event=>{state.search=event.target.value;render();});
  $('#type-filter').addEventListener('change',event=>{state.type=event.target.value;render();});
  $('#regime-filter').addEventListener('change',event=>{state.regime=event.target.value;render();});
  $('#active-only').addEventListener('change',event=>{state.activeOnly=event.target.checked;render();});
  $('#satellite-toggle').addEventListener('change',event=>{state.satellites=event.target.checked;if(state.satellites&&!window.satellite){state.satellites=false;event.target.checked=false;$('#satellite-note').textContent='Orbit library unavailable · layer remains off';}else{const relation=data.satellite_constellations.find(item=>item.constellation_id===state.satelliteConstellation);$('#satellite-note').textContent=state.satellites?`${relation?.object_count||0} approximate tracks · frozen public snapshot`:'Frozen public orbit snapshot · constellation relation';}render();});
  $('#satellite-constellation').addEventListener('change',event=>{state.satelliteConstellation=event.target.value;satellitePathCache.clear();render();});
  $('#reset').addEventListener('click',()=>{Object.assign(state,{start:2026,end:2026,windowSize:1,type:'all',regime:'all',search:'',activeOnly:false,selected:'',satellites:false});$('#year-start').value=2026;$('#year-end').value=2026;$('#window-size').value='1';$('#search').value='';$('#type-filter').value='all';$('#regime-filter').value='all';$('#active-only').checked=false;$('#satellite-toggle').checked=false;$('#satellite-note').textContent='Frozen public orbit snapshot · constellation relation';$('#detail').hidden=true;history.replaceState(null,'','./');render();});
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
