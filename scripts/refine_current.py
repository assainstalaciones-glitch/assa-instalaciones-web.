"""Idempotent refinements to the approved site; never rebuild routes or SEO."""
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, quote
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ['aire-acondicionado', 'calderas-calefaccion', 'gas', 'fontaneria',
            'electricidad', 'energia-solar', 'aerotermia', 'cargadores-electricos',
            'osmosis-descalcificadores']
PROJECTS = {'climatizacion': 'Aire acondicionado', 'calefaccion': 'Calderas y calefacción',
            'fotovoltaica': 'Energía solar', 'electricidad': 'Electricidad'}
def fragment(html):
    return BeautifulSoup(html, 'html.parser')

home = BeautifulSoup((ROOT / 'index.html').read_text(), 'html.parser')
reviews_url = next(a['href'] for a in home.select('a[href]') if 'Leer reseñas' in a.text)
for path in sorted(ROOT.rglob('index.html')):
    text = path.read_text()
    text = text.replace('977 21 41 41', '877 21 41 41').replace('977214141', '877214141')
    s = BeautifulSoup(text, 'html.parser')
    slug = path.parent.relative_to(ROOT).as_posix()
    if not s.select_one('link[href^="/assets/refinements.css"]'):
        s.head.append(s.new_tag('link', rel='stylesheet', href='/assets/refinements.css?v=20261014b'))
    for script in s.select('script[src^="/assets/site.js"]'):
        script['src'] = '/assets/site.js?v=20261014b'
    menu = s.select_one('.mobile-menu')
    if menu:
        summary = menu.summary
        summary['aria-controls'] = 'mobile-navigation'
        menu.nav['id'] = 'mobile-navigation'
        if not menu.select_one('.menu-call'):
            menu.nav.append(fragment('<a class="menu-call" href="tel:+34877214141">Llamar · 877 21 41 41</a>'))
        group = menu.select_one('.mobile-services')
        if group and group.name != 'details':
            group.name = 'details'
            label = group.find('span', recursive=False)
            label.name = 'summary'
            label.string = 'Explorar los 9 servicios'
    # Use the actual service names supported by the existing form.
    for a in s.select('a[href^="/contacto/?servicio="]'):
        if slug == 'contacto':
            a['href'] = '#request-form'
        elif slug.startswith('proyectos/'):
            a['href'] = '/contacto/?servicio=' + quote(PROJECTS[slug.split('/')[-1]])
        elif slug not in SERVICES:
            a['href'] = '/contacto/#request-form'
    if slug == 'empresa' and not s.select_one('.company-history'):
        intro = s.select_one('.page-hero .intro')
        intro.insert_after(fragment('<p class="company-history"><strong>ASSA Instalaciones, desde 2018.</strong> Parte de nuestro equipo cuenta con alrededor de 20 años de experiencia profesional en el sector.</p>'))
    if slug in SERVICES:
        s.body['class'] = list(dict.fromkeys(s.body.get('class', []) + ['service-page']))
        if not s.select_one('.service-assurance'):
            s.select_one('.page-hero').insert_after(fragment('<aside class="service-assurance" aria-label="Trabajar con ASSA"><div class="container"><span><strong>Desde 2018</strong>ASSA Instalaciones</span><span><strong>Atención directa</strong>Viviendas y negocios</span><span><strong>Base en Cambrils</strong>Camp de Tarragona</span><a href="'+reviews_url+'" target="_blank" rel="noopener noreferrer">Opiniones de clientes en Google <span aria-hidden="true">↗</span></a></div></aside>'))
        # Give existing real photographs a prominent editorial layout, preserving captions.
        gallery = s.select_one('.photo-grid')
        if gallery:
            gallery['class'] = list(dict.fromkeys(gallery.get('class', []) + ['service-gallery']))
        elif not s.select_one('.team-proof'):
            # Show the real team, explicitly captioned, without claiming a service-specific project.
            faq = s.select_one('.service-coverage')
            faq.insert_before(fragment('<section class="section team-proof"><div class="container split"><figure><img src="/assets/photos/montaje-kosner.webp" width="1200" height="900" loading="lazy" decoding="async" alt="Equipo de ASSA durante el montaje de una unidad exterior de aire acondicionado"><figcaption>El equipo de ASSA, durante un montaje de climatización.</figcaption></figure><div><p class="eyebrow">Personas detrás del servicio</p><h2>Un equipo al que puedes conocer.</h2><p>Desde 2018, ASSA reúne distintas especialidades para viviendas y negocios. Nuestra experiencia se ve en el trabajo diario y en las instalaciones que realizamos.</p><a class="inline-link" href="/empresa/">Conoce al equipo de ASSA ↗</a></div></div></section>'))
    if slug == 'proyectos' and not s.select_one('.project-filters'):
        grid = s.select_one('.project-grid')
        grid['id'] = 'project-results'
        buttons = '<button type="button" data-project-filter="all" aria-pressed="true">Todos los trabajos</button>'
        for card in grid.select('.project-card'):
            key = card['href'].strip('/').split('/')[-1]
            card['data-category'] = key
            label = card.select_one('.eyebrow').get_text(strip=True)
            buttons += f'<button type="button" data-project-filter="{key}" aria-pressed="false">{label}</button>'
        grid.insert_before(fragment('<div class="project-filters" aria-label="Filtrar trabajos por especialidad" hidden>'+buttons+'</div><p id="project-count" class="project-count" role="status" aria-live="polite" hidden></p>'))
    path.write_text(str(s))
