"""Installable site shell and shared compass branding; run after page generation."""
import json
from bs4 import BeautifulSoup
from src.publication_brand import ROOT, write_assets


def generate():
    write_assets();web=ROOT/'web'
    manifest=dict(id='./',name='The War Maps Project',short_name='War Maps',start_url='./',scope='./',
                  display='standalone',background_color='#080f18',theme_color='#080f18',
                  description='Public evidence about organized conflict. Core reading pages available offline.',
                  icons=[dict(src=f'assets/compass-{size}.png',sizes=f'{size}x{size}',type='image/png',purpose='any maskable') for size in (192,512)])
    (web/'manifest.webmanifest').write_text(json.dumps(manifest,indent=2)+'\n')
    for path in web.glob('*.html'):
        soup=BeautifulSoup(path.read_text(),'html.parser')
        if soup.head is None:continue
        if soup.html:soup.html['data-theme']='dark'
        if path.name=='index.html':
            from src.feature_print_release import insert
            insert(soup)
            from src.homepage_carousel import insert as carousel
            carousel(soup)
        for rel,href in [('manifest','manifest.webmanifest'),('icon','assets/compass-rose.svg'),('apple-touch-icon','assets/compass-192.png'),('stylesheet','brand.css'),('stylesheet','human-cost-theme.css')]:
            if not soup.find('link',href=href):soup.head.append(soup.new_tag('link',rel=rel,href=href))
        theme=soup.find('meta',attrs={'name':'theme-color'})
        if theme:theme['content']='#080f18'
        else:soup.head.append(soup.new_tag('meta',attrs={'name':'theme-color','content':'#080f18'}))
        if not soup.find('script',src='pwa.js'):
            script=soup.new_tag('script',src='pwa.js');script['defer']='';soup.head.append(script)
        if not soup.find('script',src='human-cost-clock.js'):
            script=soup.new_tag('script',src='human-cost-clock.js');script['defer']='';soup.head.append(script)
        header=soup.select_one('.site-header')
        navigator=soup.select_one('#navigator')
        if navigator:
            classes=list(soup.body.get('class',[]));soup.body['class']=[*classes,'network-3d-page'] if 'network-3d-page' not in classes else classes
        if header or navigator:
            clock=BeautifulSoup('''<div class="human-cost-clock" tabindex="0" role="img" aria-label="Global human cost clock" aria-describedby="human-cost-clock-tip"><span class="human-cost-clock-label">GLOBAL HUMAN COST / 2026</span><span class="human-cost-clock-marks" aria-hidden="true"></span><output class="human-cost-clock-count" aria-label="Estimated count since 1 January 2026">0</output><span class="human-cost-clock-tip" id="human-cost-clock-tip" role="tooltip">One mark per elapsed second. The clock flashes at the evenly distributed rate represented by the source estimate of 140,009 deaths across the loaded 2026 observation period.</span></div>''','html.parser').div
            existing_clock=soup.select_one('.human-cost-clock')
            if existing_clock:existing_clock.replace_with(clock)
            else:header.insert_after(clock) if header else navigator.insert_before(clock)
        if header or navigator:
            experience=BeautifulSoup('''<div class="human-cost-page-flash" aria-hidden="true"></div><section class="human-cost-disclosure" hidden role="dialog" aria-modal="true" aria-labelledby="human-cost-disclosure-title"><div class="human-cost-disclosure-panel"><p class="eyebrow">GLOBAL HUMAN COST</p><h2 id="human-cost-disclosure-title" tabindex="-1">That flash was to honor the dead.</h2><p class="human-cost-disclosure-copy">This clock represents an estimated <strong data-human-cost-total>0</strong> people killed thus far this year. Spread evenly over the year, that is roughly one person every <strong><span data-human-cost-rate>250</span> seconds</strong>.</p><p class="human-cost-disclosure-clock-line">This clock flashes at that rate. To honor the dead with a moment.</p><p class="human-cost-disclosure-source">Source basis: 140,009 recorded estimates in the loaded January-September candidate releases. The cadence distributes that partial-year source snapshot evenly through 2026; a flash does not report an individually observed death.</p><div class="human-cost-disclosure-actions"><label><input type="checkbox" data-human-cost-disable> Turn off future flashes if they annoy you.</label><button type="button" data-human-cost-dismiss>Dismiss</button></div></div></section>''','html.parser')
            for old in soup.select('.human-cost-page-flash,.human-cost-disclosure'):old.decompose()
            soup.body.append(experience)
        for mark in soup.select('.identity-mark'):
            mark.clear();mark.append(soup.new_tag('img',src='assets/compass-rose.svg',alt=''))
        path.write_text(str(soup).rstrip()+'\n')
    from src.neutrality_footer import generate as neutrality
    neutrality(web)


if __name__=='__main__':generate()
