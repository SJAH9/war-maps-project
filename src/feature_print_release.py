"""Release preview assets and cleanup of the retired homepage promotion."""
import json
import subprocess
import urllib.request
from bs4 import BeautifulSoup
from src.publication_brand import ROOT, REPO

FLAG=ROOT/'data/curated/homepage-print-release.json'
ITEMS=[(f'war-maps-russia-ukraine-deaths-{year}-circle',f'Russia–Ukraine / {year}',
          f'One dot, one death. {total} deaths recorded in {period}.')
         for year,total,period in [(2024,'102,120','2024'),(2025,'94,741','2025'),(2026,'57,840','January–August 2026')]]


def insert(soup):
    """Remove the retired homepage promotion, including its poster series."""
    for old in soup.select('#print-collection'):
        old.decompose()
    hero=soup.select_one('.landing-hero')
    if hero:
        heading=hero.find(['h1','h2'])
        if heading:heading.name='h1'


def activate():
    req=urllib.request.Request('https://api.github.com/repos/SJAH9/war-maps-project/releases/tags/v0.12.0',headers={'User-Agent':'WarMaps'})
    with urllib.request.urlopen(req) as response:release=json.load(response)
    if release.get('draft') or not release.get('published_at'):raise RuntimeError('Release must be published first')
    target=ROOT/'web/assets/print';target.mkdir(parents=True,exist_ok=True)
    for slug,_,_ in ITEMS:
        subprocess.run(['pdftoppm','-f','1','-l','1','-scale-to','1000','-singlefile','-png',str(ROOT/'outputs/release'/f'{slug}.pdf'),str(target/slug)],check=True)
    FLAG.write_text(json.dumps({'release':release['html_url'],'published_at':release['published_at']},indent=2)+'\n')


if __name__=='__main__':activate()
