"""Shared publication identity, compass geometry and linked QR codes."""
from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.barcode.qr import QrCodeWidget
from src.generate_network_print import compass, text, INK, MUTED, PAPER

ROOT=Path(__file__).resolve().parents[1]
REPO='https://github.com/SJAH9/war-maps-project'
SITE='https://sjah9.github.io/war-maps-project/'
VERSION='0.12.0'


def brand(c,x,y,size=18):
    compass(c,x+size,y,size*.65)
    text(c,'The War Maps Project',x+size*2.5,y+size*.1,size,INK,True)
    text(c,'PUBLIC EVIDENCE / CONNECTED',x+size*2.5,y-size*.65,size*.38,MUTED)


def qr(c,url,x,y,size=66):
    code=QrCodeWidget(url,barLevel='M');bounds=code.getBounds()
    d=Drawing(size,size,transform=[size/(bounds[2]-bounds[0]),0,0,size/(bounds[3]-bounds[1]),0,0])
    d.add(code);c.setFillColor(HexColor('#ffffff'));c.rect(x,y,size,size,fill=1,stroke=0)
    renderPDF.draw(d,c,x,y);c.linkURL(url,(x,y,x+size,y+size),relative=0,thickness=0)


def connections(c,w,y=24):
    """Prominent two-code panel for a poster or an ebook title page."""
    size=64 if w<700 else 72
    for x,url,label in [(48,SITE,'OPEN THE ATLAS'),(w/2,REPO,'CODE + DATA / GITHUB')]:
        qr(c,url,x,y,size)
        text(c,label,x+size+12,y+size-16,9 if w<700 else 12,INK,True)
        lines=['sjah9.github.io/','war-maps-project/'] if url==SITE else ['github.com/SJAH9/','war-maps-project']
        for i,line in enumerate(lines):text(c,line,x+size+12,y+size-34-i*13,8 if w<700 else 10,MUTED)
        c.linkURL(url,(x+size+8,y,x+w/2-60,y+size),relative=0,thickness=0)


def compass_svg():
    pts=sorted({(a,b,0) for a in (-1,1) for b in (-1,1)} |
               {(a,0,b) for a in (-1,1) for b in (-1,1)} |
               {(0,a,b) for a in (-1,1) for b in (-1,1)})
    xy=[(50+25*(.77*a-.46*b),53-25*(.3*a+.5*b+.77*d)) for a,b,d in pts]
    lines=[]
    for i,p in enumerate(pts):
        for j in range(i):
            if sum((p[k]-pts[j][k])**2 for k in range(3))==2:
                lines.append((xy[i],xy[j],'#aaa071'))
    lines.extend(((50,53),p,'#f07800') for p in xy)
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="War Maps vector equilibrium compass rose">'
    for a,b,col in lines:svg+=f'<path d="M{a[0]},{a[1]} L{b[0]},{b[1]}" stroke="{col}" stroke-width="1.2" fill="none"/>'
    return svg+'<path d="M50 24V13M46 19l4-6 4 6" fill="none" stroke="#aaa071" stroke-width="1.5"/></svg>',lines


def write_assets():
    from PIL import Image,ImageDraw
    assets=ROOT/'web/assets';assets.mkdir(exist_ok=True)
    svg,lines=compass_svg();(assets/'compass-rose.svg').write_text(svg)
    for size in (192,512):
        image=Image.new('RGB',(size,size),'#10110e');draw=ImageDraw.Draw(image)
        scale=size/100
        for a,b,col in lines:draw.line(tuple(v*scale for p in (a,b) for v in p),fill=col,width=max(1,round(scale*1.2)))
        draw.line([(50*scale,24*scale),(50*scale,13*scale)],fill='#aaa071',width=max(1,round(scale*1.5)))
        image.save(assets/f'compass-{size}.png')


if __name__=='__main__':write_assets()
