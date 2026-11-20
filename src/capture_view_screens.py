"""Capture carousel previews from a running local generated site.
Optional tooling: pip install playwright; playwright install chromium.
"""
import argparse,asyncio,shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def capture(base,executable=None,only=None):
    target=ROOT/'web/assets/screens';target.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        page=await browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
        await page.add_init_script("localStorage.setItem('war-maps-theme','dark')")
        views=[('conflict-map','map.html','#map'),('conflict-network','network.html','#network-canvas'),('conflict-sides','conflict-sides.html?conflict=1%3A13243','#stage'),('satellites','satellites.html','#orbit-globe')]
        for name,url,selector in views:
            if only and name not in only:continue
            await page.goto(base.rstrip('/')+'/'+url,wait_until='networkidle',timeout=90000)
            await page.locator(selector).wait_for()
            if name=='satellites':await page.wait_for_function('window.WAR_MAPS_ORBIT_VIEW')
            if name=='conflict-map':await page.wait_for_function("document.querySelector('#map')._fullLayout")
            if name=='conflict-network':
                await page.wait_for_function("document.querySelector('#network-canvas').querySelector('svg,canvas')")
                await page.wait_for_timeout(2500)
                await page.click('#network-fit')
                await page.wait_for_timeout(1500)
            # Hide fixed chrome so element captures cannot be covered by navigation.
            await page.add_style_tag(content='.site-header,.human-cost-clock,.neutrality-footer,.modebar,.satellite-toolbar,.human-cost-map-summary,.orbit-help{visibility:hidden!important}')
            if name=='conflict-sides':
                await page.select_option('#year','2026')
                # Capture the side circle itself, preserving the actual SVG paths.
                await page.locator('#dots').evaluate("""svg=>{
                  const paths=[...svg.querySelectorAll('path[data-dot-count]')].filter(p=>Number(p.dataset.dotCount)>1&&['#484848','#ac2529'].includes(p.getAttribute('fill')));
                  const boxes=paths.map(p=>p.getBBox()),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
                  const clone=svg.cloneNode(false);clone.id='focal-preview';
                  const width=right-x,height=bottom-y,pad=Math.max(width,height)*.045;
                  clone.setAttribute('viewBox',`${x-pad} ${y-pad} ${width+pad*2} ${height+pad*2}`);
                  clone.style.cssText='display:block;width:100%;height:760px;background:var(--paper)';
                  for(const p of paths)clone.append(p.cloneNode(true));svg.parentElement.replaceChildren(clone);
                }""")
                selector='#focal-preview'
            await page.locator(selector).scroll_into_view_if_needed()
            await page.wait_for_timeout(1000)
            await page.locator(selector).screenshot(path=str(target/(name+'.png')))
            from PIL import Image,ImageOps
            with Image.open(target/(name+'.png')) as image:
                # Keep complete focal geometry rather than crop circles or orbital paths.
                image=ImageOps.pad(image.convert('RGB'),(1280,800),color='#080f18',method=Image.Resampling.LANCZOS)
                image.save(target/(name+'.webp'),quality=92)
            (target/(name+'.png')).unlink()
            print('Captured',name,flush=True)
        await browser.close()
    dest=ROOT/'outputs/web/assets/screens';shutil.copytree(target,dest,dirs_exist_ok=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8876/outputs/web');parser.add_argument('--chromium');parser.add_argument('--only',nargs='+');args=parser.parse_args();asyncio.run(capture(args.base_url,args.chromium,args.only))
