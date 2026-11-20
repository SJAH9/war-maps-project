"""Capture carousel previews from a running local generated site.
Optional tooling: pip install playwright; playwright install chromium.
"""
import argparse,asyncio,shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def capture(base,executable=None):
    target=ROOT/'web/assets/screens';target.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        page=await browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
        await page.add_init_script("localStorage.setItem('war-maps-theme','dark')")
        views=[('conflict-map','map.html','#map'),('conflict-network','network.html','#network-canvas'),('conflict-sides','conflict-sides.html?conflict=1%3A13243','#stage'),('satellites','satellites.html','.orbit-layout')]
        for name,url,selector in views:
            await page.goto(base.rstrip('/')+'/'+url,wait_until='networkidle',timeout=90000)
            await page.locator(selector).wait_for()
            if name=='satellites':await page.wait_for_function('window.WAR_MAPS_ORBIT_VIEW')
            if name=='conflict-map':await page.wait_for_function("document.querySelector('#map')._fullLayout")
            if name=='conflict-network':await page.wait_for_function("document.querySelector('#network-canvas').querySelector('svg,canvas')")
            if name=='conflict-sides':
                # Fit the complete SVG poster into the screen rather than crop its dots.
                await page.locator('#dots').evaluate("e=>{e.style.width='auto';e.style.height='720px';e.style.maxWidth='100%'}")
            await page.locator(selector).evaluate("e=>e.scrollIntoView({block:'start'})")
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(target/(name+'.png')))
            from PIL import Image
            with Image.open(target/(name+'.png')) as image:image.save(target/(name+'.webp'),quality=88)
            (target/(name+'.png')).unlink()
            print('Captured',name,flush=True)
        await browser.close()
    dest=ROOT/'outputs/web/assets/screens';shutil.copytree(target,dest,dirs_exist_ok=True)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8876/outputs/web');parser.add_argument('--chromium');args=parser.parse_args();asyncio.run(capture(args.base_url,args.chromium))
