"""Build the explicitly selected release posters and both reproducible PDF ebooks.

Run after source poster generators. No directory glob decides publication scope.
The artist-edited PDF is a preserved, hashed input rather than silently recreated.
"""
import hashlib
import base64
import io
import json
from pathlib import Path
from urllib.parse import urljoin
from xml.sax.saxutils import escape

from bs4 import BeautifulSoup, NavigableString
from pypdf import PdfReader, PdfWriter, PageObject, Transformation
from pypdf.generic import DictionaryObject, NameObject, ArrayObject, FloatObject, DecodedStreamObject, EncodedStreamObject
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

from src.generate_network_print import fonts, PAPER, INK, MUTED
from src.generate_information_pages import PAGES
from src.publication_brand import ROOT, SITE, REPO, VERSION, brand, connections

OUTPUT=ROOT/'outputs/release'
SELECTION=ROOT/'data/curated/print-release-selection.json'


def inline(node,base):
    if isinstance(node,NavigableString):return escape(str(node))
    content=''.join(inline(child,base) for child in node.children)
    if node.name=='a':return f'<link href="{escape(urljoin(base,node.get("href","")), {chr(34):"&quot;"})}" color="#722b20"><u>{content}</u></link>'
    if node.name in ('b','strong'):return '<b>'+content+'</b>'
    if node.name in ('i','em','cite'):return '<i>'+content+'</i>'
    if node.name=='br':return '<br/>'
    return content


def frontmatter(selection):
    buf=io.BytesIO();styles={
        'body':ParagraphStyle('body',fontName='WM',fontSize=10,leading=14,spaceAfter=9,textColor=INK),
        'h2':ParagraphStyle('h2',fontName='WMB',fontSize=17,leading=22,spaceBefore=14,spaceAfter=8,keepWithNext=True,textColor=INK),
        'title':ParagraphStyle('title',fontName='WMB',fontSize=38,leading=42,spaceAfter=20,textColor=INK),
    }
    story=[Spacer(1,95),Paragraph('WAR MAPS',styles['title']),
           Paragraph('2026 / A solid first year',styles['h2']),
           Paragraph('Selected posters, memorial artwork and the human cost of organized conflict.',styles['body']),
           Paragraph('Sid J.A. Hubbard / Principal Investigator',styles['body']),
           Paragraph(f'Print collection / version {VERSION}',styles['body']),
           Paragraph('Large-format and US Letter mini-poster editions. Scan either code or use the clickable links to explore the atlas, clone the project, inspect the data and rebuild these publications.',styles['body']),
           Spacer(1,20),Paragraph(f'<link href="{SITE}">{SITE}</link><br/><link href="{REPO}">{REPO}</link>',styles['body']),PageBreak(),
           Paragraph('In this collection',styles['h2'])]
    for name in selection['pdfs']:
        label=name.removesuffix('.pdf').replace('war-maps-','').replace('-',' ').title()
        story.append(Paragraph(label,styles['body']))
    story.append(Paragraph('One death per dot. The 2024 and 2025 posters use full-year records; 2026 covers the loaded January-August candidate releases. The Letter edition scales the same vector pages proportionally: zoom in to inspect individual dots and dense graph labels. The large-format edition retains poster-size pages.',styles['body']))
    story.append(Paragraph('The following About and Sources sections reproduce the website content and retain its links. The Ephemeris and unselected network studies are excluded from this edition.',styles['body']))
    for filename in ('about.html','sources.html','install.html','publications.html'):
        story.extend([PageBreak(),Paragraph(escape(PAGES[filename][2]),styles['h2'])])
        soup=BeautifulSoup(PAGES[filename][3],'html.parser')
        for node in soup.find_all(['h2','h3','p','pre','li','a']):
            if any(parent.name in ('h2','h3','p','pre','li','a') for parent in node.parents):continue
            markup=inline(node,SITE+'outputs/web/'+filename)
            story.append(Paragraph(markup,styles['h2' if node.name in ('h2','h3') else 'body']))
    def page(c,doc):
        c.setFillColor(PAPER);c.rect(0,0,612,792,fill=1,stroke=0)
        brand(c,44,744,14)
        c.setFont('WM',8);c.setFillColor(MUTED);c.drawString(48,29,f'WAR MAPS / {VERSION}');c.drawRightString(564,29,str(doc.page))
        if doc.page==1:connections(c,612,90)
    SimpleDocTemplate(buf,pagesize=(612,792),leftMargin=48,rightMargin=48,topMargin=85,bottomMargin=55,
                      title='War Maps / 2026 print collection',author='Sid J.A. Hubbard').build(story,onFirstPage=page,onLaterPages=page)
    return buf.getvalue()


def fit_page(source,w,h):
    sw,sh=float(source.mediabox.width),float(source.mediabox.height)
    scale=min(w/sw,h/sh)
    page=PageObject.create_blank_page(width=w,height=h)
    embed(page,source,scale,(w-sw*scale)/2,(h-sh*scale)/2)
    return page


def embed(page,source,scale,dx,dy):
    # Preserve millions of vector dots as a compressed form, not parsed/rebuilt operators.
    raw=source['/Contents'].get_object()
    if isinstance(raw,EncodedStreamObject):
        form=EncodedStreamObject()
        form.update({k:v for k,v in raw.items() if k!='/Length'})
        form._data=raw._data  # Preserve original compressed vectors, including >75 MB expanded streams.
        # ReportLab's ASCII85 envelope adds 25% without compressing anything.
        # Strip only that envelope; keep the underlying Flate vectors untouched.
        filters=form.get('/Filter')
        if isinstance(filters,ArrayObject) and filters and filters[0]=='/ASCII85Decode':
            form._data=base64.a85decode(form._data,adobe=True)
            form[NameObject('/Filter')]=ArrayObject(filters[1:])
    else:
        form=DecodedStreamObject();form.set_data(source.get_contents().get_data())
        form=form.flate_encode()
    form.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Form'),
                 NameObject('/BBox'):ArrayObject([FloatObject(v) for v in source.mediabox]),
                 NameObject('/Resources'):source['/Resources']})
    resources=page.setdefault(NameObject('/Resources'),DictionaryObject())
    objects=resources.setdefault(NameObject('/XObject'),DictionaryObject());objects[NameObject('/WMPage')]=form
    old=page.get_contents();content=DecodedStreamObject()
    content.set_data((old.get_data() if old is not None else b'')+f'\nq {scale} 0 0 {scale} {dx} {dy} cm /WMPage Do Q\n'.encode())
    page[NameObject('/Contents')]=content.flate_encode()
    annotations=page.setdefault(NameObject('/Annots'),ArrayObject())
    for ref in source.get('/Annots',[]):
        original=ref.get_object()
        if original.get('/Subtype')!='/Link':continue
        annotation=DictionaryObject({k:v for k,v in original.items() if k not in ('/P','/Rect')})
        x0,y0,x1,y1=map(float,original['/Rect'])
        annotation[NameObject('/Rect')]=ArrayObject([FloatObject(x0*scale+dx),FloatObject(y0*scale+dy),FloatObject(x1*scale+dx),FloatObject(y1*scale+dy)])
        annotations.append(annotation)


def connected_poster(source):
    w,h=float(source.mediabox.width),float(source.mediabox.height)
    if (w,h)!=(1296,1728):raise ValueError(f'Unexpected poster dimensions: {w} x {h}')
    buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(w,h),invariant=1)
    c.setFillColor(PAPER);c.rect(0,0,w,h,fill=1,stroke=0)
    brand(c,430,119,17);connections(c,w,22);c.showPage();c.save()
    result=PdfReader(buf).pages[0]
    scale=(h-158)/h
    embed(result,source,scale,(w-w*scale)/2,158)
    return result


def generate():
    fonts();selection=json.loads(SELECTION.read_text());OUTPUT.mkdir(exist_ok=True)
    front=frontmatter(selection);entries=[]
    for name,relative in selection['pdfs'].items():
        source=(ROOT/relative).resolve()
        if not source.is_relative_to(ROOT) or Path(name).name!=name:raise ValueError('Invalid publication path')
        if 'ephemeris' in name.lower():raise ValueError('Ephemeris explicitly excluded')
        reader=PdfReader(source);writer=PdfWriter()
        for page in reader.pages:writer.add_page(connected_poster(page))
        writer.add_metadata({'/Title':reader.metadata.title or name,'/Author':'The War Maps Project / Sid J.A. Hubbard'})
        with (OUTPUT/name).open('wb') as f:writer.write(f)
        entries.append(dict(file=name,source=relative,pages=len(reader.pages),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest()))
    for name,size in [('war_posters.pdf',(1296,1728)),('warmaps.pdf',(612,792))]:
        writer=PdfWriter();front_reader=PdfReader(io.BytesIO(front))
        for page in front_reader.pages:writer.add_page(fit_page(page,*size))
        writer.add_outline_item('About, sources and reading guide',0)
        for entry in entries:
            start=len(writer.pages);writer.add_outline_item(entry['file'].removesuffix('.pdf'),start)
            reader=PdfReader(OUTPUT/entry['file'])
            for page in reader.pages:writer.add_page(fit_page(page,*size))
        writer.add_metadata({'/Title':f'War Maps / {"War Posters" if name=="war_posters.pdf" else "Mini-poster ebook"} / 2026','/Author':'Sid J.A. Hubbard / The War Maps Project'})
        with (OUTPUT/name).open('wb') as f:writer.write(f)
        print(name,len(writer.pages),'pages')
    files=[]
    for name in [*selection['pdfs'],'war_posters.pdf','warmaps.pdf']:
        path=OUTPUT/name
        files.append(dict(file=name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    manifest=dict(version=VERSION,status=selection['status'],publications=entries,files=files,
                  frontmatter_sources={name:hashlib.sha256(PAGES[name][3].encode()).hexdigest() for name in ('about.html','sources.html')},
                  rebuild='python -m src.generate_publications',excluded=['Ephemeris','unselected network studies'])
    (OUTPUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(OUTPUT)


if __name__=='__main__':generate()
