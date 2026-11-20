"""Shared, accessible neutrality disclosure for every generated HTML page."""
from pathlib import Path
from bs4 import BeautifulSoup

STATEMENT = '''<footer class="neutrality-footer" aria-label="Project neutrality">
<details><summary>Neutrality · Purpose · Data integrity</summary>
<div class="neutrality-copy">
<p><strong>The War Maps Project is an open information design project working with open data. It is not an intelligence product or a tactical data source. It is neutral to every conflict represented in the data.</strong></p>
<p>The War Maps Project honors the dead by making them visible to the world. A human life has the same value regardless of the side, nationality, or civilian or military status recorded in the source. Showing a conflict, actor, border, or loss does not express allegiance or endorsement.</p>
<p>Our work is to make public records readable through maps, diagrams, print publications, and art. Source attribution, definitions, dates, and distinctions between recorded data and our visual interpretation belong with that work. Readers can examine the methods and obtain the underlying data directly from its publishers.</p>
<h3>Sources and their published standards</h3>
<p><strong>Uppsala Conflict Data Program (UCDP):</strong> The conflict and event datasets use published definitions and systematic coding. UCDP describes evaluating sources for independence and transparency, tracing reports to their origins, and assessing reliability in context. Its materials include news reporting, international and nongovernmental organizations, research, historical archives, and truth commission reports. These are research datasets, not a collection of headlines turned into points. <a href="https://www.uu.se/en/department/peace-and-conflict-research/research/ucdp/ucdp-methodology">UCDP methodology</a> · <a href="https://ucdp.uu.se/downloads/">Data and codebooks</a>.</p>
<p><strong>V-Dem:</strong> The governance data comes with a published measurement methodology. V-Dem combines expert assessments using a statistical model that accounts for differences in coding and reports estimates with uncertainty intervals. <a href="https://www.v-dem.net/about/v-dem-project/methodology/">V-Dem methodology</a>.</p>
<p><strong>WHO:</strong> WHO’s data principles call for accessible data, transparent methods, provenance and metadata, and adherence to scientific data standards. The oPt Health Cluster dashboard identifies the Palestinian Ministry of Health as the source of its casualty series; that attribution remains part of our presentation. <a href="https://www.who.int/data/principles">WHO data principles</a>.</p>
<p><strong>CelesTrak:</strong> Public orbital elements are fitted from observations for orbit estimation. The satellite layer presents dated estimates from saved elements, not live tracking or operational tasking. <a href="https://celestrak.org/NORAD/documentation/gp-data-formats.php">CelesTrak GP documentation</a>.</p>
<p>These are the publishers’ documented methods and standards, not a claim that every source makes the same neutrality declaration. The <a data-source-register href="sources.html">source register</a> identifies the other geographic, health, population, economic, and organizational sources, with attribution and release information. Our neutrality statement belongs to War Maps; it does not speak on behalf of those publishers.</p>
</div></details></footer>'''

STYLE = '''.neutrality-footer{position:relative;clear:both;box-sizing:border-box;width:100%;padding:18px clamp(16px,4vw,64px);border-top:1px solid var(--line,currentColor);background:var(--paper,var(--bg,inherit));color:var(--ink,var(--text,inherit));font:inherit;text-align:left}
.neutrality-footer details{max-width:1000px;margin:auto}.neutrality-footer summary{cursor:pointer;font-weight:700;padding:8px 0;list-style:revert}.neutrality-footer summary:focus-visible{outline:2px solid currentColor;outline-offset:4px}.neutrality-copy{padding:8px 0 12px;overflow-wrap:anywhere}.neutrality-copy p{font:inherit;color:inherit;max-width:none;margin:12px 0}.neutrality-copy h3{margin:24px 0 12px}.neutrality-copy a{color:inherit;text-decoration:underline}
.neutrality-footer.neutrality-overlay{position:fixed;z-index:30;bottom:0;left:0;padding:4px 16px}.neutrality-overlay details[open]{max-height:65vh;overflow:auto;overscroll-behavior:contain}.neutrality-overlay summary{font-size:inherit}
@media print{.neutrality-footer{position:static!important}.neutrality-footer details:not([open]){display:none}}'''


def insert(soup, source_href='sources.html'):
    if not soup.body or not soup.head:
        return
    for old in soup.select('.neutrality-footer, #neutrality-footer-style'):
        old.decompose()
    footer = BeautifulSoup(STATEMENT, 'html.parser').footer
    footer.select_one('[data-source-register]')['href'] = source_href
    # Full-screen visualizers cannot scroll to a normal document footer.
    inline_css = ' '.join(style.get_text() for style in soup.find_all('style'))
    if soup.select_one('#navigator') or ('overflow:hidden' in inline_css.replace(' ', '') and 'position:fixed' in inline_css.replace(' ', '')):
        footer['class'].append('neutrality-overlay')
    soup.body.append(footer)
    style = soup.new_tag('style', id='neutrality-footer-style')
    style.string = STYLE
    soup.head.append(style)


def generate(web: Path):
    for path in web.rglob('*.html'):
        soup = BeautifulSoup(path.read_text(), 'html.parser')
        insert(soup, '../' * (len(path.relative_to(web).parts)-1) + 'sources.html')
        path.write_text(str(soup).rstrip()+'\n')
