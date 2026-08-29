(() => {
  const data = window.WAR_MAPS_DATA;
  if (!data) return;

  const $ = (selector) => document.querySelector(selector);
  const conflictsById = new Map(data.conflicts.map(item => [item.id, item]));
  const yearsByConflict = new Map();
  const eventsByConflict = new Map();
  const conditionsByCountryYear = new Map(data.state_conditions.map(item => [`${item.country}|${item.year}`, item]));
  const vdemAliases = {'Cambodia (Kampuchea)':'Cambodia','DR Congo (Zaire)':'Democratic Republic of the Congo','Myanmar (Burma)':'Burma/Myanmar','Myanmar':'Burma/Myanmar','Russia (Soviet Union)':'Russia','South Vietnam':'Republic of Vietnam','Yemen (North Yemen)':'Yemen','Yemen (South Yemen)':'South Yemen','Bosnia-Herzegovina':'Bosnia and Herzegovina'};
  for (const row of data.conflict_years) {
    if (!yearsByConflict.has(row.conflict_id)) yearsByConflict.set(row.conflict_id, []);
    yearsByConflict.get(row.conflict_id).push(row);
  }
  for (const event of data.events) {
    if (!event.conflict_id) continue;
    if (!eventsByConflict.has(event.conflict_id)) eventsByConflict.set(event.conflict_id, []);
    eventsByConflict.get(event.conflict_id).push(event);
  }

  const state = {year: 2026, type: 'all', search: '', activeOnly: false, country: '', selected: ''};
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const yearRows = conflict => yearsByConflict.get(conflict.id) || [];
  const isActiveInYear = (conflict, year) => conflict.years_active.includes(year);
  const currentTheme = () => document.documentElement.dataset.theme === 'dark';

  function filteredConflicts() {
    const needle = state.search.toLowerCase();
    return data.conflicts.filter(conflict => {
      if (!isActiveInYear(conflict, state.year)) return false;
      if (state.type !== 'all' && conflict.type !== state.type) return false;
      if (state.activeOnly && !conflict.active_at_source_boundary) return false;
      if (state.country && !conflict.plot_locations.includes(state.country) && !conflict.locations.includes(state.country)) return false;
      if (!needle) return true;
      return [conflict.title, conflict.region, conflict.type, conflict.incompatibility, ...conflict.locations, ...conflict.parties_a, ...conflict.parties_b, ...conflict.secondary_parties]
        .join(' ').toLowerCase().includes(needle);
    });
  }

  function mapPacket(conflicts) {
    const counts = new Map();
    for (const conflict of conflicts) for (const location of conflict.plot_locations) counts.set(location, (counts.get(location) || 0) + 1);
    return {locations: [...counts.keys()], counts: [...counts.values()]};
  }

  function drawMap(conflicts) {
    if (!window.Plotly) {
      $('#map').innerHTML = '<p style="padding:24px">The map library is unavailable. The conflict register remains usable.</p>';
      return;
    }
    const packet = mapPacket(conflicts);
    const traces = [{
      type: 'choropleth', locationmode: 'country names', locations: packet.locations, z: packet.counts,
      text: packet.locations, hovertemplate: '<b>%{location}</b><br>%{z} recorded conflict%{z}<extra></extra>',
      colorscale: [[0,'#deddd5'],[.25,'#d7a848'],[.58,'#c95442'],[1,'#741c2a']], zmin: 0, showscale: false,
      marker: {line: {color: currentTheme() ? '#303530' : '#ffffff', width: .45}}
    }];
    if (state.selected) {
      const selectedEvents = eventsByConflict.get(state.selected) || [];
      const points = selectedEvents.filter(event => event.latitude !== null && event.longitude !== null);
      if (points.length) traces.push({
        type: 'scattergeo', mode: 'markers', lat: points.map(item => item.latitude), lon: points.map(item => item.longitude),
        text: points.map(item => `${item.date_start} · ${item.place || item.country} · ${item.code_status}`),
        hovertemplate: '%{text}<extra></extra>', marker: {size: 6, color: '#12a69d', line: {color: '#fff', width: .6}, opacity: .75}, showlegend: false
      });
    }
    const layout = {
      margin: {l:0,r:0,t:0,b:0}, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', dragmode: 'pan',
      geo: {projection:{type:'natural earth'}, bgcolor:'transparent', showframe:false, showcoastlines:true,
        coastlinecolor: currentTheme() ? '#606760' : '#b8bbb4', showland:true, landcolor:currentTheme()?'#252925':'#e7e8e2',
        showocean:true, oceancolor:currentTheme()?'#111411':'#f1f3ef', showcountries:true, countrycolor:currentTheme()?'#414641':'#c9cbc5'}
    };
    Plotly.react('map', traces, layout, {responsive:true,displayModeBar:false,scrollZoom:true});
    const map = $('#map');
    map.removeAllListeners?.('plotly_click');
    map.on('plotly_click', event => {
      const point = event.points?.[0];
      if (!point || point.data.type !== 'choropleth') return;
      state.country = point.location;
      $('#map-note').textContent = `State enclosure: ${state.country}. Reset to return to the world.`;
      render();
    });
  }

  function renderList(conflicts) {
    $('#result-title').textContent = state.country ? `${state.country} · ${state.year}` : `${state.year} observations`;
    $('#result-count').textContent = conflicts.length;
    const list = $('#conflict-list');
    if (!conflicts.length) {
      list.innerHTML = '<p class="boundary-note" style="margin:18px">No conflict record occupies the selected address.</p>';
      return;
    }
    list.innerHTML = conflicts.slice(0, 180).map(conflict => `
      <button class="conflict-item ${state.selected === conflict.id ? 'active' : ''}" data-id="${esc(conflict.id)}">
        <strong>${esc(conflict.title)}</strong>
        <span>${esc(conflict.type)} · ${esc(conflict.incompatibility)} · ${conflict.first_active_year}-${conflict.last_active_year}</span>
      </button>`).join('');
    list.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openConflict(button.dataset.id)));
  }

  function enclosureMarkup(enclosure) {
    if (!enclosure) return '<p class="boundary-note">No enclosure address has been encoded.</p>';
    const statement = node => esc(node?.departure?.statement || 'Unopened E frontier');
    const departure = enclosure.departure || {};
    const metadata = [...(departure.measurements || []).map(item => `measure: ${item}`), ...(departure.join_keys || []).map(item => `join: ${item}`)];
    return `<div class="enclosure-address"><div><b>Outer E</b>${statement(enclosure.outer)}<small>${esc(enclosure.outer?.address || '')}</small></div><div><b>Specified departure</b>${esc(departure.statement)}<small>${esc(departure.id || '')}</small></div><div><b>Inner E</b>${statement(enclosure.inner)}<small>${esc(enclosure.inner?.address || '')}</small></div></div>
      ${metadata.length ? `<div class="departure-meta">${metadata.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}
      <div class="frontier"><p class="eyebrow">Final Frontier · next questions</p><ul>${(enclosure.frontier_questions || []).map(question => `<li>${esc(question)}</li>`).join('')}</ul></div>`;
  }

  function openConflict(id, updateUrl = true) {
    const conflict = conflictsById.get(id);
    if (!conflict) return;
    state.selected = id;
    $('#detail').hidden = false;
    $('#detail-kicker').textContent = `${conflict.region} · ${conflict.type}`;
    $('#detail-title').textContent = conflict.title;
    $('#detail-meta').innerHTML = [
      `${conflict.first_active_year}-${conflict.last_active_year}`,
      conflict.incompatibility,
      `${conflict.years_active.length} conflict-year${conflict.years_active.length === 1 ? '' : 's'}`,
      conflict.source_id,
      conflict.active_at_source_boundary ? 'active at source boundary' : 'closed before source boundary'
    ].map(item => `<span>${esc(item)}</span>`).join('');
    const rows = yearRows(conflict);
    $('#timeline').innerHTML = rows.length ? rows.map(row => `<div class="year-mark ${row.intensity === 2 ? 'war' : ''}" style="height:${row.intensity === 2 ? 82 : 38}px" title="${row.year}: intensity ${row.intensity}"><em>${row.year}</em></div>`).join('') : '<p>Candidate event chronology begins below.</p>';
    const events = eventsByConflict.get(id) || [];
    $('#event-stream').innerHTML = events.length ? events.slice().reverse().slice(0,250).map(event => `
      <article class="event"><time>${esc(event.date_start)}</time><p><b>${esc(event.place || event.country)}</b><br>${esc(event.side_a)} ↔ ${esc(event.side_b)}</p><small>${esc(event.code_status)} · ${event.source_count} source${event.source_count === 1 ? '' : 's'} · fatalities ${event.fatalities.low}/${event.fatalities.best}/${event.fatalities.high}</small></article>`).join('') : '<p class="boundary-note">No event-level source is loaded for this conflict. The annual conflict-year record remains available.</p>';
    $('#enclosure').innerHTML = enclosureMarkup(conflict.enclosure);
    const claims = data.claims.filter(claim => claim.conflict_id === id);
    $('#claims').innerHTML = claims.length ? claims.map(claim => `<article class="claim"><p>${esc(claim.claim)}</p><small>${esc(claim.source_type)} · ${esc(claim.observed_at)}</small>${enclosureMarkup(claim.enclosure)}</article>`).join('') : '<p class="boundary-note">No curated claim occupies this address yet.</p>';
    const conditionYear = Math.min(conflict.last_active_year, 2024);
    const conditions = conflict.locations.map(location => conditionsByCountryYear.get(`${vdemAliases[location] || location}|${conditionYear}`)).filter(Boolean);
    $('#state-conditions').innerHTML = conditions.length ? conditions.map(item => `<article class="claim"><p><b>${esc(item.country)} · ${item.year}</b></p><small>${Object.entries(item.conditions).map(([key,value]) => `${esc(key)} ${value === null ? 'NA' : value.toFixed(2)}`).join(' · ')}</small></article>`).join('') : '<p class="boundary-note">No V-Dem condition row occupies this country-year address.</p>';
    const projections = data.prompted_projections.filter(item => item.conflict_id === null || item.conflict_id === id);
    $('#projections').innerHTML = projections.map(item => `<article class="claim"><p>${esc(item.claim || item.prompt)}</p><small>${esc(item.branch_class || item.source_type)}${item.branch_point ? ` · branch: ${esc(item.branch_point)}` : ''}</small>${enclosureMarkup(item.enclosure)}</article>`).join('') || '<p class="boundary-note">No prompted branch occupies this conflict address yet.</p>';
    if (updateUrl) history.replaceState(null, '', `?conflict=${encodeURIComponent(id)}#detail`);
    drawMap(filteredConflicts());
    $('#detail').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderStates() {
    $('#state-table').innerHTML = data.states.map(item => `<tr data-state="${esc(item.state)}"><td><button class="state-link" type="button">${esc(item.state)}</button></td><td>${item.conflict_count}</td><td>${item.territorial_conflict_count}</td><td>${item.interstate_conflict_count}</td><td>${item.active_at_source_boundary_count}</td></tr>`).join('');
    document.querySelectorAll('[data-state]').forEach(row => row.querySelector('button').addEventListener('click', () => {
      state.country = row.dataset.state; state.year = 2025; $('#year').value = 2025; $('#year-output').value = 2025; render(); $('#explore').scrollIntoView({behavior:'smooth'});
    }));
  }

  function renderSources() {
    $('#source-list').innerHTML = data.sources.map(source => `<article class="source-item"><h3>${esc(source.title)}</h3><p>${esc(source.coverage)}</p><p><b>${esc(source.enclosure)}</b><br>${esc(source.publisher)} · ${esc(source.license)} · retrieved ${esc(source.retrieved)}</p><a href="${esc(source.url)}">Source and download</a></article>`).join('');
  }

  function render() {
    const conflicts = filteredConflicts();
    renderList(conflicts); drawMap(conflicts);
  }

  $('#year').addEventListener('input', event => { state.year = Number(event.target.value); $('#year-output').value = state.year; state.country = ''; render(); });
  $('#search').addEventListener('input', event => { state.search = event.target.value; render(); });
  $('#type-filter').addEventListener('change', event => { state.type = event.target.value; render(); });
  $('#active-only').addEventListener('change', event => { state.activeOnly = event.target.checked; render(); });
  $('#reset').addEventListener('click', () => { state.year=2026;state.type='all';state.search='';state.activeOnly=false;state.country='';state.selected='';$('#year').value=2026;$('#year-output').value=2026;$('#search').value='';$('#type-filter').value='all';$('#active-only').checked=false;$('#detail').hidden=true;history.replaceState(null,'','./');render(); });
  $('#close-detail').addEventListener('click', () => { state.selected='';$('#detail').hidden=true;history.replaceState(null,'','./');render(); });
  $('#theme-toggle').addEventListener('click', () => { document.documentElement.dataset.theme=currentTheme()?'light':'dark';render(); });

  renderStates(); renderSources(); render();
  const initial = new URLSearchParams(location.search).get('conflict');
  if (initial) setTimeout(() => openConflict(initial, false), 100);
})();
