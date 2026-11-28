"""Export a self-contained multiscreen mode against a checked native NewsBoob tree."""
from pathlib import Path
import argparse, hashlib, json, re
from src.generate_war_room import adapt_news_transport
ROOT=Path(__file__).resolve().parents[1]
def export(source, output):
    source,output=Path(source),Path(output)
    if output.exists():raise FileExistsError('Choose a new output directory; existing exports are preserved')
    native={name:(source/name).read_bytes() for name in ['player.js','newsboob.html','hls.min.js']}
    player=native['player.js'].decode()
    seam='    let index = Number(localStorage.getItem("newsboob.station") || 1) % STATIONS.length;'
    if player.count(seam)!=1:raise RuntimeError('Native initial station contract changed')
    player=player.replace(seam,"    let index=STATIONS.findIndex(s=>s.id===(new URLSearchParams(location.search).get('owner')||['cbs','f24','rt'][wallSlot]));")
    player='const wallSlot=Math.max(0,Math.min(2,Number(new URLSearchParams(location.search).get("slot"))||0));\n'+adapt_news_transport(player)
    player+='\n'+(ROOT/'war-room/news-bridge.js').read_text()
    html=native['newsboob.html'].decode()
    html,count=re.subn(r'<script src="player.js[^\"]*"></script>','<script src="multiscreen-player.js"></script>',html)
    if count!=1:raise RuntimeError('Native script contract changed')
    # Reuse exactly the tested compact native layout from the War Room builder.
    import ast
    tree=ast.parse((ROOT/'src/generate_war_room.py').read_text())
    compact=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='compact' for t in n.targets))
    html=html.replace('</head>',compact+'</head>')
    files={'player.html':html.encode(),'multiscreen-player.js':player.encode(),'hls.min.js':native['hls.min.js'],'news-pool.js':(ROOT/'war-room/news-pool.js').read_bytes()}
    files['index.html']=b'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEWSBOOB - multiscreen</title><style>body{margin:0;background:#08090c;color:#d6e0e8;font:12px monospace}header{display:flex;justify-content:space-between;padding:10px}a{color:#3fffd2}button{background:#11161c;color:inherit;border:1px solid #38464d;padding:6px;cursor:pointer}.screens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.news-player{width:100%;height:36vh;min-height:280px;border:0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;padding:10px}.grid[hidden]{display:none}.tile{position:relative}.tile canvas{width:100%;aspect-ratio:16/9;background:black;display:block}.badges{display:flex;gap:4px}.badge{border:2px solid #3fffd2}.news-feed-owner{position:fixed;left:-10000px;top:0;width:240px;height:135px;opacity:0;pointer-events:none}.hosted header{display:none}@media(max-width:750px){.screens{grid-template-columns:1fr}.news-player{height:300px}}</style><header><strong>NEWSBOOB - MULTISCREEN</strong><a href="https://github.com/SJAH9/newsboob">Open source NewsBoob</a></header><section class="screens"><iframe class="news-player" title="NewsBoob 1" src="player.html?slot=0" allow="autoplay;fullscreen" allowfullscreen></iframe><iframe class="news-player" title="NewsBoob 2" src="player.html?slot=1" allow="autoplay;fullscreen" allowfullscreen></iframe><iframe class="news-player" title="NewsBoob 3" src="player.html?slot=2" allow="autoplay;fullscreen" allowfullscreen></iframe></section><button id="channels">Channels</button><span id="selected">Select screen 1</span><section class="grid" hidden></section><script>window.NewsBoobMultiscreenConfig={playerURL:'player.html'};if(new URLSearchParams(location.search).get('mode')==='hosted')document.body.classList.add('hosted');</script><script src="news-pool.js"></script><script src="host.js"></script></html>'''
    files['host.js']=b''''use strict';
const frames=[...document.querySelectorAll('.news-player')],pool=window.NewsBoobMultiscreen,grid=document.querySelector('.grid');let selected=0,rows=[];
const api=i=>frames[i].contentWindow.NewsBoobPlayer;
frames.forEach((f,i)=>f.addEventListener('pointerenter',()=>{selected=i;document.querySelector('#selected').textContent='Select screen '+(i+1);}));
document.querySelector('#channels').onclick=()=>{grid.hidden=!grid.hidden;pool.setOpen(!grid.hidden);};
setInterval(()=>{if(!api(0))return;if(!rows.length){rows=api(0).channels();for(const row of rows){const tile=document.createElement('button');tile.className='tile';tile.dataset.index=row.index;tile.innerHTML='<canvas width="240" height="135"></canvas><span></span><div class="badges"></div>';tile.querySelector('span').textContent=row.label+' / '+row.nation;tile.onclick=()=>api(selected).tune(row.index);tile.ondragover=e=>e.preventDefault();tile.ondrop=e=>{e.preventDefault();const slot=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(slot)&&slot>=0&&slot<frames.length)api(slot).tune(row.index);};grid.append(tile);}}
for(const tile of grid.children){const index=Number(tile.dataset.index),holder=tile.querySelector('.badges');holder.replaceChildren();frames.forEach((f,slot)=>{if(api(slot)?.state().index!==index)return;const badge=document.createElement('span');badge.className='badge';badge.textContent='Screen '+(slot+1);badge.draggable=true;badge.ondragstart=e=>e.dataTransfer.setData('text/plain',String(slot));badge.onclick=e=>{e.stopPropagation();selected=slot;};holder.append(badge);});if(!grid.hidden){const video=pool.videoForChannel(index);if(video?.readyState>=2)try{tile.querySelector('canvas').getContext('2d').drawImage(video,0,0,240,135);}catch{}}}
},125);
'''
    files['README.txt']=b'''NEWSBOOB MULTISCREEN MODE\nServe this directory with any static HTTP(S) server. Open index.html for standalone mode or index.html?mode=hosted inside an iframe with allow="autoplay; fullscreen" and allowfullscreen. There is no server component, proxy or AuthorOS dependency. Each channel owns one native HLS session, reused by all screens and previews. Native controls and scan handlers remain. Broadcaster CORS, availability and autoplay policies still apply. Files are generated from the recorded native source hashes; keep the upstream source and export tool with your development checkout.\n'''
    for name,raw in native.items():
        if (source/name).read_bytes()!=raw:raise RuntimeError('Native source changed during export')
    output.mkdir(parents=True)
    for name,raw in files.items():
        with (output/name).open('xb') as f:f.write(raw)
    manifest={'native':{n:hashlib.sha256(b).hexdigest() for n,b in native.items()},'files':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()},'modes':['standalone','hosted']}
    (output/'provenance.json').write_text(json.dumps(manifest,indent=2))
    return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--output',required=True);a=p.parse_args();export(a.source,a.output);print('Exported checked standalone and hosted NewsBoob multiscreen modes to',a.output)
