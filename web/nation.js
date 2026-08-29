(() => {
  const data = window.WAR_MAPS_DATA;
  if (!data) return;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const requested = new URLSearchParams(location.search).get('country') || '';
  const nation = data.nations.find(item => item.country === requested || item.map_name === requested);
  if (!nation) {
    $('#nation-name').textContent = 'Nation not found';
    $('#nation-summary').innerHTML = '<a href="./">Return to the world map</a>';
    return;
  }

  const conflictsById = new Map(data.conflicts.map(item => [item.id, item]));
  const activeYears = new Set(nation.years_active);
  const currentTheme = () => document.documentElement.dataset.theme === 'dark';
  const countryMatches = value => value === nation.country || value === nation.map_name;
  const relevantRows = data.conflict_years.filter(row => row.plot_locations.some(countryMatches) || row.side_a_states.some(countryMatches) || row.side_b_states.some(countryMatches));
  const relevantConditions = data.state_conditions.filter(row => row.country === nation.country);
  const relevantEvents = data.events.filter(event => countryMatches(event.country) || event.side_a_states.some(countryMatches) || event.side_b_states.some(countryMatches));
  const selectedYear = Math.max(...nation.years_active, 2026);
  const state = {year: Math.min(2026, selectedYear), tab:'date'};

  document.title = `${nation.country} · The War Maps Project`;
  $('#nation-name').textContent = nation.country;
  $('#raw-title').textContent = `${nation.country} source rows`;
  $('#nation-summary').innerHTML = [
    ['Conflicts', nation.conflict_count],
    ['Active years', nation.years_active.length],
    ['Same-side partners', nation.same_side_partners.length],
    ['Opposing states', nation.opposing_states.length]
  ].map(([label,value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

  const nationLink = country => `nation.html?country=${encodeURIComponent(country)}`;
  const traceForCountries = (countries, values, colorscale, name, showscale=false) => ({
    type:'choropleth', locationmode:'country names', locations:countries, z:values, text:countries, name,
    hovertemplate:`<b>%{location}</b><br>%{z} coded year%{z}<extra>${name}</extra>`,
    colorscale, zmin:0, zmax:Math.max(1,...values), showscale,
    marker:{line:{color:currentTheme()?'#343934':'#f4f3ed',width:.55}}
  });
  const baseGeo = projection => ({
    projection, bgcolor:'rgba(0,0,0,0)', showframe:false, showcoastlines:true,
    coastlinecolor:currentTheme()?'#6d8b91':'#234f5b', coastlinewidth:.75, showcountries:true,
    countrycolor:currentTheme()?'#809397':'#ffffff', countrywidth:.6, showland:true,
    landcolor:currentTheme()?'#222b2b':'#e7ece4', showocean:true,
    oceancolor:currentTheme()?'#071a24':'#79b4c1', showlakes:true,
    lakecolor:currentTheme()?'#0c2732':'#65a5b3',
    lonaxis:{showgrid:true,gridcolor:currentTheme()?'#173944':'#55929f',gridwidth:.4},
    lataxis:{showgrid:true,gridcolor:currentTheme()?'#173944':'#55929f',gridwidth:.4}
  });
  const mapLayout = geo => ({margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',geo,legend:{orientation:'h'}});

  function rolesForYear(year) {
    const allies = new Set();
    const adversaries = new Set();
    const locations = new Set();
    const conflictIds = new Set();
    relevantRows.filter(row => row.year === year).forEach(row => {
      conflictIds.add(row.conflict_id);
      row.plot_locations.forEach(item => locations.add(item));
      const inA = row.side_a_states.some(countryMatches);
      const inB = row.side_b_states.some(countryMatches);
      if (inA) {
        row.side_a_states.filter(item => !countryMatches(item)).forEach(item => allies.add(item));
        row.side_b_states.forEach(item => adversaries.add(item));
      }
      if (inB) {
        row.side_b_states.filter(item => !countryMatches(item)).forEach(item => allies.add(item));
        row.side_a_states.forEach(item => adversaries.add(item));
      }
    });
    const events = year === 2026 ? relevantEvents : [];
    events.forEach(event => {
      if (event.conflict_id) conflictIds.add(event.conflict_id);
      const inA = event.side_a_states.some(countryMatches);
      const inB = event.side_b_states.some(countryMatches);
      if (inA) {
        event.side_a_states.filter(item => !countryMatches(item)).forEach(item => allies.add(item));
        event.side_b_states.forEach(item => adversaries.add(item));
      }
      if (inB) {
        event.side_b_states.filter(item => !countryMatches(item)).forEach(item => allies.add(item));
        event.side_a_states.forEach(item => adversaries.add(item));
      }
    });
    return {allies:[...allies],adversaries:[...adversaries],locations:[...locations],conflictIds:[...conflictIds],events};
  }

  function drawDateMap() {
    if (!window.Plotly) return;
    const roles = rolesForYear(state.year);
    const traces = [
      traceForCountries([nation.map_name],[1],[[0,'#e7a33d'],[1,'#e7a33d']],'Selected nation'),
      traceForCountries(roles.allies,roles.allies.map(()=>1),[[0,'#9da7ad'],[1,'#65717b']],'Same-side'),
      traceForCountries(roles.adversaries,roles.adversaries.map(()=>1),[[0,'#b8a0c6'],[1,'#6f3d89']],'Opposing state'),
      traceForCountries(roles.locations.filter(name=>name!==nation.map_name),roles.locations.filter(name=>name!==nation.map_name).map(()=>1),[[0,'#d88773'],[1,'#c95442']],'Conflict location')
    ].filter(trace => trace.locations.length);
    const points = roles.events.filter(event => event.latitude !== null && event.longitude !== null);
    if (points.length) traces.push({type:'scattergeo',mode:'markers',lat:points.map(e=>e.latitude),lon:points.map(e=>e.longitude),text:points.map(e=>`${e.date_start} · ${e.place || e.country}`),hovertemplate:'%{text}<extra>candidate event</extra>',marker:{size:5,color:'#ef7458',opacity:.82,line:{color:'#f8d35e',width:.6}}});
    const centroid = nation.centroid || [0,20];
    const geo = baseGeo({type:'natural earth',scale:3.1});
    geo.center = {lon:centroid[0],lat:centroid[1]};
    Plotly.react('nation-date-map',traces,mapLayout(geo),{responsive:true,displayModeBar:false,scrollZoom:true});
    attachMapLinks('nation-date-map');
    renderYearData(roles);
  }

  function drawAllTimeMap() {
    if (!window.Plotly) return;
    const allies = nation.same_side_partners;
    const adversaries = nation.opposing_states;
    const traces = [
      traceForCountries([nation.map_name],[1],[[0,'#e7a33d'],[1,'#e7a33d']],'Selected nation'),
      traceForCountries(allies.map(item=>item.map_name),allies.map(item=>item.duration_years),[[0,'#d7dce0'],[1,'#4f5b66']],'Same-side years'),
      traceForCountries(adversaries.map(item=>item.map_name),adversaries.map(item=>item.duration_years),[[0,'#e1d7e7'],[1,'#56246f']],'Opposing years')
    ].filter(trace => trace.locations.length);
    const centroid = nation.centroid || [0,20];
    const geo = baseGeo({type:'orthographic',rotation:{lon:centroid[0],lat:centroid[1]},scale:.72});
    Plotly.react('nation-all-map',traces,mapLayout(geo),{responsive:true,displayModeBar:false,scrollZoom:true});
    attachMapLinks('nation-all-map');
  }

  function attachMapLinks(id) {
    const map = document.getElementById(id);
    map.removeAllListeners?.('plotly_click');
    map.on('plotly_click',event => {
      const locationName = event.points?.[0]?.location;
      if (!locationName) return;
      const target = data.nations.find(item => item.map_name === locationName || item.country === locationName);
      if (target && target.country !== nation.country) location.href = nationLink(target.country);
    });
  }

  function renderYearData(roles) {
    $('#date-heading').textContent = `${nation.country} · ${state.year}`;
    $('#nation-year-output').value = state.year;
    const condition = relevantConditions.find(item => item.year === state.year) || relevantConditions.filter(item => item.year <= state.year).at(-1);
    const fatalities = roles.events.reduce((sum,event)=>{sum.low+=event.fatalities.low;sum.best+=event.fatalities.best;sum.high+=event.fatalities.high;return sum},{low:0,best:0,high:0});
    const stats = [
      [`V-Dem regime${condition?` (${condition.year})`:''}`,condition?.regime?.name || 'No observation'],
      ['Conflict records',roles.conflictIds.length],
      ['Same-side states',roles.allies.length],
      ['Opposing states',roles.adversaries.length],
      ['Candidate events',roles.events.length],
      ['Fatalities low / best / high',roles.events.length?`${fatalities.low.toLocaleString()} / ${fatalities.best.toLocaleString()} / ${fatalities.high.toLocaleString()}`:'Not available']
    ];
    $('#nation-year-stats').innerHTML=stats.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    const records=roles.conflictIds.map(id=>conflictsById.get(id)).filter(Boolean);
    $('#nation-year-records').innerHTML=records.length?records.map(item=>`<a class="record-link" href="index.html?conflict=${encodeURIComponent(item.id)}#detail"><strong>${esc(item.title)}</strong><span>${esc(item.type)} · ${esc(item.incompatibility)}</span></a>`).join(''):'<p class="boundary-note">No conflict-profile record occupies this nation-year. Candidate source rows may still appear in Raw data.</p>';
  }

  function renderTimeline() {
    $('#nation-timeline-band').innerHTML=Array.from({length:81},(_,index)=>{
      const year=1946+index;
      const count=relevantRows.filter(row=>row.year===year).length+(year===2026?new Set(relevantEvents.map(item=>item.conflict_id)).size:0);
      return `<button type="button" data-year="${year}" class="${activeYears.has(year)||count?'active':''} ${year===state.year?'selected':''}" style="--level:${Math.min(4,count)}" title="${year}: ${count} records"><span>${year}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-year]').forEach(button=>button.addEventListener('click',()=>{state.year=Number(button.dataset.year);$('#nation-year').value=state.year;renderTimeline();drawDateMap();}));
  }

  function relationMarkup(items) {
    if (!items.length) return '<p class="boundary-note">No state relationship of this type is coded.</p>';
    return items.map(item=>`<a href="${nationLink(item.country)}"><strong>${esc(item.country)}</strong><span>${item.duration_years} year${item.duration_years===1?'':'s'} · ${item.first_year}-${item.last_year} · ${item.conflict_ids.length} conflict${item.conflict_ids.length===1?'':'s'}</span></a>`).join('');
  }

  function renderRaw() {
    $('#raw-conflicts').innerHTML=relevantRows.map(row=>{const conflict=conflictsById.get(row.conflict_id);return `<tr><td>${row.year}</td><td>${esc(conflict?.title||row.conflict_id)}</td><td>${esc(row.side_a)}</td><td>${esc(row.side_b)}</td><td>${row.intensity}</td><td>${esc(row.locations.join('; '))}</td></tr>`}).join('')||'<tr><td colspan="6">No conflict-year rows.</td></tr>';
    $('#raw-vdem').innerHTML=relevantConditions.map(row=>`<tr><td>${row.year}</td><td>${esc(row.regime.name||'NA')}</td><td>${row.regime.code??'NA'}</td><td>${Object.entries(row.conditions).map(([key,value])=>`${esc(key)}=${value===null?'NA':value.toFixed(3)}`).join(' · ')}</td></tr>`).join('')||'<tr><td colspan="4">No V-Dem rows.</td></tr>';
    $('#raw-events').innerHTML=relevantEvents.map(event=>`<tr><td>${esc(event.date_start)}</td><td>${esc(event.conflict_name)}</td><td>${esc(event.place||event.country)}</td><td>${esc(event.side_a)} / ${esc(event.side_b)}</td><td>${event.fatalities.low} / ${event.fatalities.best} / ${event.fatalities.high}</td><td>${esc(event.code_status)}</td></tr>`).join('')||'<tr><td colspan="6">No candidate event rows.</td></tr>';
  }

  function setTab(tab) {
    state.tab=tab;
    document.querySelectorAll('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!==tab);
    document.querySelectorAll('[role="tab"]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===tab)));
    history.replaceState(null,'',`?country=${encodeURIComponent(nation.country)}#${tab}`);
    if(tab==='date')setTimeout(drawDateMap,0);
    if(tab==='all-time')setTimeout(drawAllTimeMap,0);
  }

  $('#nation-year').value=state.year;
  $('#nation-year').addEventListener('input',event=>{state.year=Number(event.target.value);renderTimeline();drawDateMap();});
  document.querySelectorAll('[role="tab"]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  document.querySelectorAll('[data-nav-tab]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();setTab(link.dataset.navTab);document.querySelector('.tab-bar').scrollIntoView({behavior:'smooth',block:'start'});}));
  $('#ally-list').innerHTML=relationMarkup(nation.same_side_partners);
  $('#adversary-list').innerHTML=relationMarkup(nation.opposing_states);
  $('#download-raw').addEventListener('click',()=>{
    const payload={nation,relevant_conflict_years:relevantRows,vdem_country_years:relevantConditions,candidate_events:relevantEvents};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`${nation.country.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-war-maps.json`;link.click();URL.revokeObjectURL(url);
  });
  $('#theme-toggle').addEventListener('click',()=>{document.documentElement.dataset.theme=currentTheme()?'light':'dark';if(state.tab==='date')drawDateMap();if(state.tab==='all-time')drawAllTimeMap();});

  renderTimeline();renderRaw();
  const initial=['date','all-time','raw'].includes(location.hash.slice(1))?location.hash.slice(1):'date';
  setTab(initial);
  requestAnimationFrame(()=>window.scrollTo(0,0));
})();
