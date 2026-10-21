"""Installable site shell and shared compass branding; run after page generation."""
import json
from bs4 import BeautifulSoup
from src.publication_brand import ROOT, write_assets


def generate():
    write_assets();web=ROOT/'web'
    manifest=dict(id='./',name='The War Maps Project',short_name='War Maps',start_url='./',scope='./',
                  display='standalone',background_color='#10110e',theme_color='#10110e',
                  description='Public evidence about organized conflict. Core reading pages available offline.',
                  icons=[dict(src=f'assets/compass-{size}.png',sizes=f'{size}x{size}',type='image/png',purpose='any maskable') for size in (192,512)])
    (web/'manifest.webmanifest').write_text(json.dumps(manifest,indent=2)+'\n')
    for path in web.glob('*.html'):
        soup=BeautifulSoup(path.read_text(),'html.parser')
        if soup.head is None:continue
        if path.name=='index.html':
            from src.feature_print_release import insert
            insert(soup)
        for rel,href in [('manifest','manifest.webmanifest'),('icon','assets/compass-rose.svg'),('apple-touch-icon','assets/compass-192.png'),('stylesheet','brand.css')]:
            if not soup.find('link',href=href):soup.head.append(soup.new_tag('link',rel=rel,href=href))
        if not soup.find('meta',attrs={'name':'theme-color'}):soup.head.append(soup.new_tag('meta',attrs={'name':'theme-color','content':'#10110e'}))
        if not soup.find('script',src='pwa.js'):
            script=soup.new_tag('script',src='pwa.js');script['defer']='';soup.head.append(script)
        for mark in soup.select('.identity-mark'):
            mark.clear();mark.append(soup.new_tag('img',src='assets/compass-rose.svg',alt=''))
        path.write_text(str(soup).rstrip()+'\n')


if __name__=='__main__':generate()
