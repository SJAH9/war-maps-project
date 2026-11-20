"""Reproducible homepage tour using captured screens of the actual views."""
from bs4 import BeautifulSoup
SLIDES=[
 ('Conflict map','map.html','conflict-map.webp','Locate recorded conflicts and events across places and years. Explore the geography, then open the underlying records.'),
 ('Conflict Network','network.html','conflict-network.webp','Explore the participants, places, and events connected within a conflict. Follow the structure behind the map.'),
 ('Conflict Sides','conflict-sides.html','conflict-sides.webp','One dot represents one death. Compare the losses of each side alongside civilian and unknown deaths, by conflict and year.'),
 ('Satellite estimated distance','satellites.html','satellites.webp','Rotate a 3D Earth and explore the estimated distance between ICEYE-X36 and Kosmos 2612 across a 30-day retrospective orbital model.')]
def insert(soup):
    for old in soup.select('#view-carousel'):old.decompose()
    for kind,attr,value in [('link','href','homepage-carousel.css'),('script','src','homepage-carousel.js')]:
        if not soup.find(kind,attrs={attr:value}):
            tag=soup.new_tag(kind,attrs={attr:value})
            if kind=='link':tag['rel']='stylesheet'
            else:tag['defer']=''
            soup.head.append(tag)
    section=soup.new_tag('section',id='view-carousel',attrs={'class':'view-carousel','aria-label':'Explore War Maps','aria-roledescription':'carousel'})
    slides=soup.new_tag('div',attrs={'class':'view-slides'})
    for i,(title,url,image,description) in enumerate(SLIDES):
        slide=soup.new_tag('article',attrs={'class':'view-slide','id':f'view-slide-{i}','aria-label':f'{i+1} of {len(SLIDES)}: {title}','aria-roledescription':'slide'})
        if i:slide['hidden']=''
        visual=soup.new_tag('a',href=url,attrs={'class':'view-screen','aria-label':f'Open {title}'})
        visual.append(soup.new_tag('img',src='assets/screens/'+image,alt=title+' screen from War Maps',width='1280',height='800',loading='eager' if not i else 'lazy'))
        slide.append(visual);copy=soup.new_tag('div',attrs={'class':'view-copy'})
        eyebrow=soup.new_tag('p',attrs={'class':'eyebrow'});eyebrow.string=f'Explore War Maps / 0{i+1}';copy.append(eyebrow)
        h=soup.new_tag('h2');h.string=title;copy.append(h)
        p=soup.new_tag('p');p.string=description;copy.append(p)
        a=soup.new_tag('a',href=url);a.string=f'Open {title} →';copy.append(a);slide.append(copy);slides.append(slide)
    section.append(slides)
    controls=BeautifulSoup('<div class="view-carousel-controls"><button type="button" data-view-prev aria-label="Previous view">←</button><div class="view-carousel-tabs" role="group" aria-label="Choose a view"></div><button type="button" data-view-next aria-label="Next view">→</button><span class="sr-only" data-view-status aria-live="polite"></span></div>','html.parser').div
    for i,(title,*_) in enumerate(SLIDES):
        button=soup.new_tag('button',type='button',attrs={'data-view-index':str(i),'aria-controls':f'view-slide-{i}','aria-pressed':'true' if i==0 else 'false'});button.string=title;controls.select_one('.view-carousel-tabs').append(button)
    section.append(controls);soup.select_one('main').insert(0,section)
