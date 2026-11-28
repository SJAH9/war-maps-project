"""Build the separate War Room edition around the generated native atlas.

No data regeneration, downloads or main-atlas changes. Explicit derivative
rendering seams retain native data calculations and controls.
"""
from pathlib import Path
from src.war_room_adapters import adapt
import hashlib
import json
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]

def adapt_news_transport(player):
    """War Room transport budget; native tuner, sources and decoder stay in charge."""
    def swap(old, new):
        nonlocal player
        if player.count(old) != 1:
            raise RuntimeError('Native NewsBoob transport contract changed: ' + old[:70])
        player = player.replace(old, new, 1)
    swap('    function syncPreviews() {', '    function syncPreviews() {\n      [...previewPlayers.keys()].forEach(killPreview);el.previews.classList.remove("on");return;')
    swap('    async function lock(i) {', '    async function lock(i) {\n      if(!wallOwner){locked=i;el.video.style.display="none";setStatus("shared live source",face(STATIONS[i]));await parent.warRoomPool.tune(wallSlot,i);return;}')
    swap('    async function reloadStream() {', '    async function reloadStream() {\n      if(!wallOwner)return parent.warRoomPool.reloadSlot(wallSlot);')
    swap('    function applyVolume() {', '    function applyVolume() {\n      if(!wallOwner){el.muteBtn.textContent=muted?"Unmute":"Mute";parent.warRoomPool.audio(wallSlot,muted,Number(el.vol.value));return;}')
    swap('        el.video.playsInline = true;', '        el.video.playsInline = true;el.video.crossOrigin="anonymous";')
    swap('    async function go(i) {', '    async function go(i) {\n      if(Date.now()<wallCooldownUntil){setStatus("cooldown","Source cooling down; retry after one minute");return;}')
    swap('      for (const url of urls) {', '      for (const url of urls) {\n        if(Date.now()<wallCooldownUntil)throw new Error("Source cooling down");')
    swap('    function stopHls() {', '    function stopHls() {\n      clearTimeout(wallRecoveryTimer);wallRecoveryTimer=null;')
    swap('capLevelToPlayerSize: false,', 'capLevelToPlayerSize: true,')
    swap('abrEwmaDefaultEstimate: 8000000,', 'abrEwmaDefaultEstimate: 1500000,')
    swap('maxBufferLength: 24,', 'maxBufferLength: 12,')
    swap('maxMaxBufferLength: 48,', 'maxMaxBufferLength: 24,')
    swap('manifestLoadingTimeOut: 15000,', 'manifestLoadingTimeOut: 15000,\n            manifestLoadingMaxRetry: 2,manifestLoadingRetryDelay: 3000,manifestLoadingMaxRetryTimeout: 15000,\n            levelLoadingMaxRetry: 2,levelLoadingRetryDelay: 3000,levelLoadingMaxRetryTimeout: 15000,\n            fragLoadingMaxRetry: 2,fragLoadingRetryDelay: 3000,fragLoadingMaxRetryTimeout: 15000,')
    begin=player.index('            const levels = hls.levels || [];')
    end=player.index('            ok();',begin)
    player=player[:begin]+'            // Native adaptive bitrate, capped to the visible screen.\n'+player[end:]
    begin=player.index('          hls.on(Hls.Events.ERROR, (_, data) => {')
    end=player.index('          hls.loadSource(url);',begin)
    player=player[:begin]+'''          hls.on(Hls.Events.ERROR, (_, data) => {
            if(gen!==token||!hls)return;
            if(!data.fatal&&data.details!=="bufferStalledError")return;
            if(wallRecoveryTimer)return;
            const code=Number(data.response?.code||data.networkDetails?.status||0);
            if(Date.now()-wallLastRecovery>60000)wallRecoveries=0;
            wallLastRecovery=Date.now();wallRecoveries+=1;
            if(code===429||wallRecoveries>3){
              wallCooldownUntil=Date.now()+60000;
              if(!settled){fail(new Error("Source unavailable; cooling down"));return;}
              stopHls();showOffAir(STATIONS[index],"Source unavailable; wait one minute before retrying.");setStatus("cooldown","Source cooling down");return;
            }
            const current=hls;
            wallRecoveryTimer=setTimeout(()=>{
              wallRecoveryTimer=null;if(gen!==token||hls!==current)return;
              if(data.type===Hls.ErrorTypes.MEDIA_ERROR)current.recoverMediaError();
              else current.startLoad();
            },3000*Math.pow(2,wallRecoveries-1));
          });
'''+player[end:]
    swap('      Promise.resolve(reloadStream()).finally(() => { reloading = false; });', '''      if(Date.now()-wallLastRecovery>60000)wallRecoveries=0;
      wallLastRecovery=Date.now();wallRecoveries+=1;
      if(wallRecoveries>2){wallCooldownUntil=Date.now()+60000;showOffAir(STATIONS[index],"Source stalled; wait one minute before retrying.");setStatus("cooldown","Source cooling down");reloading=false;return;}
      Promise.resolve(reloadStream()).finally(() => { reloading = false; });''')
    tail='    go(index);'
    if not player.rstrip().endswith(tail):
        raise RuntimeError('Native NewsBoob startup contract changed')
    player=player.rstrip()[:-len(tail)]+'    setTimeout(()=>go(index),wallSlot*1200);\n'
    return 'const wallOwner=new URLSearchParams(location.search).get("owner");\nlet wallRecoveryTimer=null,wallRecoveries=0,wallLastRecovery=0,wallCooldownUntil=0;\n'+player

def build():
    source = ROOT / 'war-room'
    dest = ROOT / 'outputs/war-room'
    files = {name: (source / name).read_bytes() for name in ['index.html', 'room.css', 'room.js', 'native.css', 'native.js', 'shared-map.js', 'news-bridge.js', 'news-pool.js', 'remote.js']}
    manifest = {'edition': 'War Room', 'built': datetime.now(timezone.utc).isoformat(), 'native_root': '../web/', 'sources': {}, 'coverage': 'Bab el-Mandeb has native terrain reference only; vessel positions and crossing counts cover Hormuz.'}
    # Search indexes only existing atlas names and recorded coordinates.
    search_inputs = {}
    for name in ('data.js', 'assets/world.geojson'):
        raw = (ROOT / 'outputs/web' / name).read_bytes()
        manifest['sources'][name] = hashlib.sha256(raw).hexdigest()
        search_inputs[name] = raw.decode()
    atlas = json.loads(search_inputs['data.js'].split('=', 1)[1].strip().rstrip(';'))
    geometry = json.loads(search_inputs['assets/world.geojson'])
    places = {}
    def place(name, country, lon, lat, kind):
        if not name or lon is None or lat is None:
            return
        key = (name.casefold(), country.casefold())
        if key not in places:
            places[key] = dict(name=name, country=country, lon=float(lon), lat=float(lat), kind=kind)
    for feature in geometry['features']:
        p = feature['properties']
        place(p['ADMIN'], '', p.get('LABEL_X'), p.get('LABEL_Y'), 'country')
    for event in atlas['events']:
        place(event.get('place'), event.get('country', ''), event.get('longitude'), event.get('latitude'), 'recorded place')
    files['search-places.json'] = json.dumps(sorted(places.values(), key=lambda p: (p['name'].casefold(), p['country'].casefold())), ensure_ascii=False, separators=(',', ':')).encode()
    for key, page in [('map', 'map.html'), ('nation', 'nation.html'), ('human', 'civilian-casualties.html'), ('living', 'life-death.html'), ('fuel', 'gas-map.html'), ('hormuz', 'hormuz.html'), ('bab', 'hormuz.html')]:
        path = ROOT / 'outputs/web' / page
        raw = path.read_bytes()
        manifest['sources'][page] = hashlib.sha256(raw).hexdigest()
        text = raw.decode()
        if key == 'map':
            native = (ROOT / 'outputs/web/app.js').read_bytes()
            manifest['sources']['app.js'] = hashlib.sha256(native).hexdigest()
            app = native.decode()
            old = 'const openNation = country => { location.href = nationUrl(country); };'
            if app.count(old) != 1:
                raise RuntimeError('Native nation-navigation contract changed')
            app = app.replace(old, "const openNation = country => { parent.postMessage({type:'war-room-nation',country},location.origin); };")
            app = app.replace("projection:{type:'natural earth'}", "center:{lon:40,lat:35},projection:{type:'natural earth',scale:5.25,rotation:{lon:40,lat:0,roll:0}}")
            draw = "    Plotly.react('map', traces, layout, {responsive:true,displayModeBar:false,scrollZoom:true});"
            if app.count(draw) != 1:
                raise RuntimeError('Native world-map redraw contract changed')
            app = app.replace(draw, """    const currentMap=document.querySelector('#map'),currentGeo=currentMap?._fullLayout?.geo;
    if(currentMap?.dataset.roomOrbitFocus&&currentGeo){
      layout.geo.center={...currentGeo.center};
      layout.geo.projection={...layout.geo.projection,scale:currentGeo.projection.scale,rotation:{...currentGeo.projection.rotation}};
    }
""" + draw)
            # Palette selections load the native record without scrolling away.
            signature = 'function openConflict(id, updateUrl=true) {'
            scroll = "$('#detail').scrollIntoView({behavior:'smooth',block:'start'});"
            if app.count(signature) != 1 or app.count(scroll) != 1:
                raise RuntimeError('Native conflict scroll contract changed')
            app = app.replace(signature, 'function openConflict(id, updateUrl=true, scrollToDetail=true) {')
            app = app.replace(scroll, 'if(scrollToDetail) ' + scroll)
            # Expose only the existing conflict selection plus a dated ranking.
            seam = "  const initial=new URLSearchParams(location.search).get('conflict');"
            if app.count(seam) != 1:
                raise RuntimeError('Native conflict selection contract changed')
            app = app.replace(seam, r"""  window.warRoomConflicts={
    top(){
      const totals=new Map();
      for(const event of data.events){
        if(!event.conflict_id||!overlaps(Number(event.date_start.slice(0,4)),Number(event.date_end.slice(0,4))))continue;

        let row=totals.get(event.conflict_id);if(!row){row={id:event.conflict_id,events:0,countries:new Map(),through:''};totals.set(row.id,row);}
        row.events++;row.countries.set(event.country,(row.countries.get(event.country)||0)+1);if(event.date_end>row.through)row.through=event.date_end;
      }
      return [...totals.values()].filter(row=>conflictsById.has(row.id)&&!/^XXX\d+(?:\s*-\s*XXX\d+)?$/.test(conflictsById.get(row.id).title)).sort((a,b)=>b.events-a.events||a.id.localeCompare(b.id)).slice(0,5).map(row=>({id:row.id,title:conflictsById.get(row.id).title,events:row.events,country:[...row.countries].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0],through:row.through,start:state.start,end:state.end}));
    },
    open(id){const row=this.top().find(row=>row.id===id);if(!row)return;openConflict(id,false,false);return row;}
  };
"""+seam)
            files['adapted-app.js'] = app.encode()
            text, count = re.subn(r'src="app\.js(?:\?[^" ]*)?"', 'src="../war-room/adapted-app.js"', text)
            if count != 1:
                raise RuntimeError('Native world-map script contract changed')
        if key in ('hormuz', 'bab'):
            native = (ROOT / 'outputs/web/hormuz-3d.js').read_bytes()
            manifest['sources']['hormuz-3d.js'] = hashlib.sha256(native).hexdigest()
            script = native.decode()
            anchor = "  const reset=document.createElement('button');"
            if script.count(anchor) != 1 or script.count('new T.OrbitControls(camera,renderer.domElement)') != 1:
                raise RuntimeError('Native shipping-camera contract changed')
            orbit = """  const orbitLabel=document.createElement('label'),orbitToggle=document.createElement('input');
  orbitToggle.type='checkbox';orbitToggle.id='room-orbit';orbitLabel.append(orbitToggle,document.createTextNode(' Orbit'));
  orbitToggle.addEventListener('change',()=>{
    controls.autoRotate=orbitToggle.checked;controls.autoRotateSpeed=.6;
    const azimuth=controls.getAzimuthalAngle();
    controls.minAzimuthAngle=orbitToggle.checked?-Infinity:azimuth-Math.PI/2;
    controls.maxAzimuthAngle=orbitToggle.checked?Infinity:azimuth+Math.PI/2;
  });
  document.querySelector('.hormuz-controls').append(orbitLabel);
"""
            # Blue-tint the original native colors; retain native lighting/materials.
            for old, new in (("color:'#2c697b'", "color:'#25669a'"),
                             ("sea.material.color.set(dark()?'#181d16':'#858a6b')", "sea.material.color.set(dark()?'#181d16':'#858a6b').multiply(new T.Color(.85,.97,1.25))"),
                             ("colors.push(c.r,c.g,c.b)", "c.r*=.85;c.g*=.97;c.b=Math.min(1,c.b*1.25);colors.push(c.r,c.g,c.b)")):
                if script.count(old) != 1:
                    raise RuntimeError('Native water-tint contract changed: ' + old)
                script = script.replace(old, new)
            files['adapted-hormuz-3d.js'] = script.replace(anchor, orbit + anchor).encode()
            text, count = re.subn(r'src="hormuz-3d\.js(?:\?[^" ]*)?"', 'src="../war-room/adapted-hormuz-3d.js"', text)
            if count != 1:
                raise RuntimeError('Native shipping HTML script contract changed')
        if key == 'nation':
            native = (ROOT / 'outputs/web/nation.js').read_bytes()
            manifest['sources']['nation.js'] = hashlib.sha256(native).hexdigest()
            script = native.decode()
            script = script.replace("history.replaceState(null,'',`?country=", "history.replaceState(null,'',`${location.pathname}?country=")
            script = script.replace("baseGeo({type:'natural earth',scale:3.1})", "baseGeo({type:'natural earth',rotation:{lon:centroid[0]},scale:3.1})")
            script = script.replace("lat:centroid[1]},scale:.72", "lat:centroid[1]},scale:1")
            old = 'location.href = nationLink(target.country);'
            if script.count(old) != 1:
                raise RuntimeError('Native nation-map navigation contract changed')
            files['adapted-nation.js'] = script.replace(old, "parent.postMessage({type:'war-room-nation',country:target.country},location.origin);").encode()
            text, count = re.subn(r'src="nation\.js(?:\?[^" ]*)?"', 'src="../war-room/adapted-nation.js"', text)
            if count != 1:
                raise RuntimeError('Native nation script contract changed')
        if key in ('human', 'living', 'fuel'):
            script = {'human':'civilian-casualties.js','living':'life-death.js','fuel':'gas-map.js'}[key]
            native = (ROOT / 'outputs/web' / script).read_bytes()
            manifest['sources'][script] = hashlib.sha256(native).hexdigest()
            files['adapted-' + script] = adapt(native.decode(), key).encode()
            replacement = '<script defer src="https://cdn.plot.ly/plotly-3.1.0.min.js"></script><script defer src="../war-room/shared-map.js"></script><script defer src="../war-room/adapted-' + script + '"></script>'
            text, count = re.subn(r'<script\b[^>]*src="' + re.escape(script) + r'(?:\?[^" ]*)?"[^>]*></script>', lambda _: replacement, text)
            if count != 1:
                raise RuntimeError('Native HTML script contract changed: ' + page)
            text = re.sub(r'aria-label="(?:Interactive isometric|Isometric)[^"]*"', 'aria-label="Interactive Natural Earth world map"', text)
            text = text.replace('turn the map over', 'inspect the source record').replace('Conflict stacks count', 'Conflict markers count')

        # Base preserves every native relative script, stylesheet, fetch and source link.
        text = text.replace('<head>', '<head><base href="../../web/">', 1)
        text = re.sub(r'<script\b[^>]*src="pwa\.js"[^>]*></script>', '', text)
        text = text.replace('</head>', '<link rel="stylesheet" href="../war-room/native.css"><script defer src="../war-room/native.js"></script></head>', 1)
        text = re.sub(r'<body\b([^>]*)>', lambda m: '<body' + m.group(1) + ' data-room-view="' + key + '">', text, count=1)
        files['views/' + ({'human':'civilian-casualties','living':'life-death','fuel':'gas-map'}.get(key,key)) + '.html'] = text.encode()
    # Native NewsBoob module and HLS dependency remain referenced at their contracts.
    news_html = (ROOT / 'outputs/web/newsmedia-player/newsboob.html').read_bytes()
    news_js = (ROOT / 'outputs/web/newsmedia-player/player.js').read_bytes()
    manifest['sources']['newsmedia-player/newsboob.html'] = hashlib.sha256(news_html).hexdigest()
    manifest['sources']['newsmedia-player/player.js'] = hashlib.sha256(news_js).hexdigest()
    hls = (ROOT / 'outputs/web/newsmedia-player/hls.min.js').read_bytes()
    manifest['sources']['newsmedia-player/hls.min.js'] = hashlib.sha256(hls).hexdigest()
    player = news_js.decode()
    player = "const wallSlot = Math.max(0,Math.min(2,Number(new URLSearchParams(location.search).get('slot'))||0));\n" + player
    player = player.replace('"newsboob.station"', '"war-room.newsboob.station." + wallSlot').replace('"newsboob.panel"', '"war-room.newsboob.panel." + wallSlot')
    player = player.replace('|| 1) % STATIONS.length', '|| String(wallSlot)) % STATIONS.length')
    player = player.replace('!== "0";', '=== "1";')
    old_index = 'let index = Number(localStorage.getItem("war-room.newsboob.station." + wallSlot) || String(wallSlot)) % STATIONS.length;'
    if player.count(old_index) != 1:
        raise RuntimeError('Native NewsBoob initial-station contract changed')
    player = player.replace(old_index, "let index = STATIONS.findIndex(s => s.id === (new URLSearchParams(location.search).get('owner')||['cbs','f24','rt'][wallSlot]));")
    player = player.replace('tickerButton.textContent = s.tickerOnly ? s.label : face(s);', 'tickerButton.textContent = face(s);')
    player = player.replace('nation: "Europe"', 'nation: "France"')
    for seam in ['function go(i)', 'function setScanMode(enabled)', 'function applyVolume()', 'function stopHls()', 'function stopYt()']:
        if seam not in player:
            raise RuntimeError('Native NewsBoob remote contract changed: ' + seam)
    player = adapt_news_transport(player)
    player += '\n' + files['news-bridge.js'].decode()
    files['news-player.js'] = player.encode()
    news = news_html.decode().replace('<head>', '<head><base href="../../web/newsmedia-player/">', 1)
    news, count = re.subn(r'<script src="player\.js[^" ]*"></script>', '<script src="../../war-room/news-player.js"></script>', news)
    if count != 1:
        raise RuntimeError('Native NewsBoob script contract changed')
    compact = """<style>
    html,body.newsboob-page{height:100%;min-height:0;overflow:hidden;padding:0!important}
    /* The room owns one enclosure and channel grid; native videos stay attached. */
    .tuner{display:none!important}
    .plate{display:flex!important;flex-wrap:wrap;flex:0 0 auto;gap:2px!important}
    .wordmark{display:none!important}.model{width:100%;justify-content:space-between;flex-wrap:wrap!important;gap:2px!important}
    .scan-controls{flex-wrap:wrap;gap:2px}.scan-controls .bezel-btn,.under .bezel-btn,.auto-controls .bezel-btn{padding:3px 5px;font-size:10px}
    .auto-controls{display:flex;align-items:center;gap:3px}.scan-custom{width:44px!important;padding:3px!important}
    .under{display:flex!important;flex-wrap:wrap;gap:2px!important;padding:2px 0 0!important}.under .leds,.under .ticker{display:none!important}
    .bezel-controls{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px}.vol{gap:3px!important}.vol input{width:55px!important}
    .set{gap:2px!important}.screen-frame{height:auto!important}

    .set,.tv,.screen-frame{border:0!important;box-shadow:none!important;background:#000!important;padding:0!important;border-radius:0!important}
    .body{display:flex!important}.tv{flex:1!important}
    .desk{padding:0!important;flex:1;min-height:0}.set{width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;border-radius:0!important;padding:3px!important}
    .plate{padding:3px!important;gap:2px!important}.wordmark{font-size:12px!important}.datetime,.model>span{display:none!important}.chan{font-size:9px!important}
    .body{min-height:0!important}.tv{min-height:0!important}.screen-frame{min-height:0!important;border-radius:0!important}
    .bezel-btn,.bezel-controls,.vol{font-size:9px!important}.bezel-controls{gap:3px!important;padding:2px!important}.bezel-btn{padding:3px!important}.vol input{width:45px!important}
    .tuner{min-height:0!important;overflow:auto}.ticker{height:18px!important;font-size:9px!important}.veil p{font-size:10px!important}
    /* Ticker takes only the space left after the native footer controls. */
    .under{flex-wrap:nowrap!important;min-width:0;gap:4px!important;overflow-x:auto}
    .under .leds,.under .bezel-controls{flex:0 0 auto;flex-wrap:nowrap!important;white-space:nowrap}
    .under .ticker{flex:1 1 0;width:0;min-width:0}
    .under .vol{flex:0 0 auto;gap:3px!important;white-space:nowrap}

    body>div[style],.neutrality-footer{display:none!important}
    </style><script defer src="../../war-room/native.js"></script>"""
    news = news.replace('</head>', compact + '</head>', 1)
    files['views/newsboob.html'] = news.encode()
    manifest['output_hashes'] = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    files['provenance.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for name, digest in manifest['sources'].items():
        if hashlib.sha256((ROOT / 'outputs/web' / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Native source changed during build: ' + name)
    for name in ['index.html', 'room.css', 'room.js', 'native.css', 'native.js', 'shared-map.js', 'news-bridge.js', 'news-pool.js', 'remote.js']:
        if (source / name).read_bytes() != files[name]:
            raise RuntimeError('Shell source changed during build: ' + name)
    # Snapshot inputs/destinations before writing; refuse a concurrent overwrite.
    expected = {name: (dest / name).read_bytes() if (dest / name).exists() else None for name in files}
    changed = {name for name, data in files.items() if expected[name] != data}
    if changed and dest.exists():
        backup = ROOT / '.cache/war-room-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        for name in changed:
            if expected[name] is not None:
                p = backup / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(expected[name])
    for name in changed:
        p = dest / name
        current = p.read_bytes() if p.exists() else None
        if current != expected[name]:
            raise RuntimeError('Concurrent edit: ' + str(p))
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(files[name])
    print('Built outputs/war-room; native atlas unchanged.')

if __name__ == '__main__':
    build()
