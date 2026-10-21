"""Homepage print feature, activated only after the corresponding release exists."""
import json
import subprocess
import urllib.request
from bs4 import BeautifulSoup
from src.publication_brand import ROOT, REPO

FLAG=ROOT/'data/curated/homepage-print-release.json'
ITEMS=[('war-maps-afterimages-network','Afterimages','A memorial artwork built from conflict-event networks.'),
       *[(f'war-maps-russia-ukraine-deaths-{year}-circle',f'Russia–Ukraine / {year}',
          f'One dot, one death. {total} deaths recorded in {period}.')
         for year,total,period in [(2024,'102,120','2024'),(2025,'94,741','2025'),(2026,'57,840','January–August 2026')]]]


def insert(soup):
    if not FLAG.exists():return
    old=soup.find(id='print-collection')
    if old:old.decompose()
    section=BeautifulSoup('<section id="print-collection" class="print-feature" aria-labelledby="print-title"><p class="eyebrow">Art, evidence and human lives</p><h2 id="print-title">War Maps in print</h2><p>Explore the memorial artwork and the death-circle series. Open the vector PDFs to inspect each individual mark.</p><div class="print-feature-grid"></div><p><a href="../release/war_posters.pdf">Large-format ebook</a> · <a href="../release/warmaps.pdf">Letter mini-poster ebook</a> · <a href="publications.html">About the collection and sources</a></p></section>','html.parser')
    grid=section.select_one('.print-feature-grid')
    for slug,title,description in ITEMS:
        card=soup.new_tag('a',href=f'../release/{slug}.pdf')
        card.append(soup.new_tag('img',src=f'assets/print/{slug}.png',alt=title+' — '+description,loading='lazy',width='750',height='1000'))
        heading=soup.new_tag('h3');heading.string=title;card.append(heading)
        p=soup.new_tag('p');p.string=description;card.append(p)
        grid.append(card)
    soup.select_one('.landing-hero').insert_after(section)


def activate():
    req=urllib.request.Request('https://api.github.com/repos/SJAH9/war-maps-project/releases/tags/v0.12.0',headers={'User-Agent':'WarMaps'})
    with urllib.request.urlopen(req) as response:release=json.load(response)
    if release.get('draft') or not release.get('published_at'):raise RuntimeError('Release must be published first')
    target=ROOT/'web/assets/print';target.mkdir(parents=True,exist_ok=True)
    for slug,_,_ in ITEMS:
        subprocess.run(['pdftoppm','-f','1','-l','1','-scale-to','1000','-singlefile','-png',str(ROOT/'outputs/release'/f'{slug}.pdf'),str(target/slug)],check=True)
    FLAG.write_text(json.dumps({'release':release['html_url'],'published_at':release['published_at']},indent=2)+'\n')


if __name__=='__main__':activate()
