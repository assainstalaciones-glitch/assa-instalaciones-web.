"""Progressive visual layer over the approved corporate pages. Run after build_site.py.
Requires beautifulsoup4 and Pillow. Never changes routes, titles, H1 or descriptions.
Then run refine_current.py to retain the subsequent incremental refinements.
"""
from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
SERVICES={
 'aire-acondicionado':('Aire acondicionado en un salón contemporáneo','climatizacion'),
 'calderas-calefaccion':('Caldera mural en una sala técnica doméstica','calefaccion'),
 'gas':('Comprobación ilustrativa de una conexión de gas',None),
 'fontaneria':('Distribución de agua y tuberías en una sala técnica','calefaccion'),
 'electricidad':('Cuadro eléctrico doméstico con protecciones','electricidad'),
 'energia-solar':('Vivienda mediterránea con paneles fotovoltaicos','fotovoltaica'),
 'aerotermia':('Unidad exterior de aerotermia junto a una vivienda',None),
 'cargadores-electricos':('Vehículo eléctrico conectado a un cargador mural',None),
 'osmosis-descalcificadores':('Descalcificador doméstico en una sala técnica',None)}
REAL={'climatizacion':('montaje-kosner','Montaje de aire acondicionado por el equipo de ASSA'),'calefaccion':('caldera-warmhaus','Caldera instalada: fotografía real de ASSA'),'fotovoltaica':('placas-cubierta','Paneles sobre cubierta: trabajo real de ASSA'),'electricidad':('tecnico-cuadro','El equipo de ASSA trabajando en un cuadro eléctrico')}
TOWNS=['Cambrils','Reus','Salou','Tarragona','Vila-seca','Riudoms','Vinyols i els Arcs','Montbrió del Camp','Mont-roig del Camp']
def fragment(v):return BeautifulSoup(v,'html.parser')
def picture(slug,alt,hero=False):
 return f'<picture><source type="image/webp" srcset="/assets/editorial/{slug}-640.webp 640w, /assets/editorial/{slug}-1280.webp 1280w" sizes="(max-width: 640px) calc(100vw - 36px), (max-width: 900px) 48vw, 640px"><img src="/assets/editorial/{slug}-1280.webp" alt="{alt} — imagen ilustrativa" width="1280" height="853" '+('fetchpriority="high"' if hero else 'loading="lazy"')+' decoding="async"></picture>'
def visual(slug,alt):return '<figure class="editorial-hero">'+picture(slug,alt,True)+'<figcaption>Imagen ilustrativa del servicio</figcaption></figure>'
for path in sorted(ROOT.rglob('index.html')):
 s=BeautifulSoup(path.read_text(),'html.parser');slug=path.parent.relative_to(ROOT).as_posix();slug='' if slug=='.' else slug
 if s.select_one('link[href^="/assets/visual.css"]'):continue
 css=s.new_tag('link',rel='stylesheet',href='/assets/visual.css?v=20261014');s.head.append(css)
 s.body['data-page']=slug or 'inicio'
 # Upgrade the service catalogue without removing its useful descriptions.
 for card in s.select('.service-card'):
  key=card['href'].strip('/')
  if key in SERVICES:
   card.insert(0,fragment('<div class="service-photo">'+picture(key,SERVICES[key][0])+'</div>'))
   top=card.select_one('.card-top');top.select_one('.icon').decompose();top['class']=['card-top','photo-number']
 art=s.select_one('.service-art')
 if slug in SERVICES and art:art.replace_with(fragment(visual(slug,SERVICES[slug][0])))
 elif art and slug in ['empresa','negocios-comunidades']:
  art.replace_with(fragment(visual('empresa','Arquitectura mediterránea y espacios de vivienda y negocio')))
 elif art and slug=='servicios':
  art.replace_with(fragment('<div class="service-mosaic" aria-label="Climatización, agua y energía">'+''.join(picture(k,SERVICES[k][0]) for k in ['aire-acondicionado','fontaneria','energia-solar'])+'</div>'))
 elif art and slug.startswith('proyectos'):
  key=slug.split('/')[-1] if '/' in slug else 'fotovoltaica';name,alt=REAL[key]
  art.replace_with(fragment(f'<figure class="real-hero"><img src="/assets/photos/{name}.webp" alt="{alt}" fetchpriority="high"><figcaption>Trabajo real · ASSA Instalaciones</figcaption></figure>'))
 elif art and slug=='contacto':
  art.replace_with(fragment('<aside class="contact-hero-card"><p class="eyebrow">CONTACTO DIRECTO</p><a class="contact-number" href="tel:+34877214141">877 21 41 41</a><p>Carrer d’Andalusia 12<br>43850 Cambrils, Tarragona</p><a class="button primary" href="https://wa.me/34877214141">Hablar por WhatsApp ↗</a><span>Para urgencias, llama directamente.</span></aside>'))
 elif art and slug=='zonas':
  art.replace_with(fragment('<aside class="coverage-panel"><p class="eyebrow">NUESTRA BASE</p><strong>Cambrils</strong><span>Camp de Tarragona</span><div>'+''.join('<span>'+v+'</span>' for v in TOWNS[1:])+'</div></aside>'))
 # Contextualise existing project links, and create a light visual break inside services.
 if slug in SERVICES:
  target=SERVICES[slug][1]
  gallery=s.select_one('.photo-grid')
  if gallery and target:
   gallery.insert_after(fragment(f'<a class="button outline gallery-link" href="/proyectos/{target}/">Más trabajos de esta especialidad <span aria-hidden="true">↗</span></a>'))
  info=s.select_one('.section.soft .container.split')
  if info:
   info['class'].append('budget-layout')
   # Preserve every paragraph; the checklist remains alongside the explanatory image.
   info.select_one('.checklist')['class'].append('checklist-panel')
  faq=s.select_one('.faq-layout')
  if faq:
   faq.parent.insert_before(fragment('<section class="service-coverage"><div class="container"><p class="eyebrow">CERCA DE TU INSTALACIÓN</p><div class="coverage-chips">'+''.join('<a href="/zonas/">'+x+'</a>' for x in TOWNS)+'</div></div></section>'))
 # Home: actual projects become photographs instead of a plain text index.
 if slug=='':
  for a in s.select('.project-index a'):
   key=a['href'].strip('/').split('/')[-1];name,alt=REAL[key]
   a.insert(0,fragment(f'<img src="/assets/photos/{name}.webp" alt="{alt}" loading="lazy" decoding="async">'))
  band=s.select_one('.about-band .split')
  if band:
   band['class'].append('about-visual')
   band.select_one('div').append(fragment('<figure class="company-photo">'+picture('empresa','Espacios de vivienda y negocio en arquitectura mediterránea')+'<figcaption>Imagen ilustrativa</figcaption></figure>'))
  town=s.select_one('.town-list')
  if town:
   for t in TOWNS[6:]:town.append(fragment('<span>'+t+'</span>'))
 # Full-size gallery links: inspect equipment details without cropping or a JS dependency.
 for im in s.select('.photo-grid img'):
  if im.parent.name!='a':
   link=s.new_tag('a',href=im['src'],target='_blank',rel='noopener',attrs={'aria-label':'Ampliar: '+im.get('alt','fotografía')});im.wrap(link)
 for im in s.select('img'):
  source=ROOT/im.get('src','').lstrip('/')
  if source.is_file():
   try:
    with Image.open(source) as image:im['width'],im['height']=map(str,image.size)
   except OSError:pass
 # Keep established structured data, adding all requested coverage towns.
 for data in s.select('script[type="application/ld+json"]'):
  obj=json.loads(data.string)
  for item in obj.get('@graph',[]):
   if item.get('@type')=='HomeAndConstructionBusiness':item['areaServed']=TOWNS
  data.string=json.dumps(obj,ensure_ascii=False)
 path.write_text(str(s))
print('Applied progressive visuals to current corporate pages.')
