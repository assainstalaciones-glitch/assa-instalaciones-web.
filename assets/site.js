'use strict';
(() => {
  const menu = document.querySelector('.mobile-menu');
  if (menu) {
    const summary = menu.querySelector('summary');
    const syncMenu = () => {
      summary.setAttribute('aria-expanded', String(menu.open));
      summary.setAttribute('aria-label', menu.open ? 'Cerrar menú' : 'Abrir menú');
    };
    syncMenu();
    menu.addEventListener('toggle', syncMenu);
    menu.querySelector('nav').addEventListener('click', event => {
      if (event.target.closest('a')) menu.open = false;
    });
    const desktop = window.matchMedia('(min-width: 901px)');
    desktop.addEventListener('change', event => { if (event.matches) menu.open = false; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
    });
    document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  }
  const filters = document.querySelector('.project-filters');
  if (filters) {
    const cards = Array.from(document.querySelectorAll('.project-card[data-category]'));
    const count = document.getElementById('project-count');
    filters.hidden = false;
    count.hidden = false;
    count.textContent = `${cards.length} especialidades con fotografías reales`;
    filters.addEventListener('click', event => {
      const button = event.target.closest('button[data-project-filter]');
      if (!button || !filters.contains(button)) return;
      const category = button.dataset.projectFilter;
      filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      cards.forEach(card => { card.hidden = category !== 'all' && card.dataset.category !== category; });
      count.textContent = category === 'all' ? `${cards.length} especialidades con fotografías reales` : `Mostrando: ${button.textContent}`;
    });
  }
  const form = document.getElementById('request-form');
  if (!form) return;
  const params = new URLSearchParams(window.location.search);
  const service = params.get('servicio');
  if (service) {
    const option = Array.from(form.elements.servicio.options).find(o => o.value.toLocaleLowerCase('es') === service.toLocaleLowerCase('es'));
    if (option) form.elements.servicio.value = option.value;
  }
  const locality = params.get('localidad');
  if (locality) form.elements.localidad.value = locality.slice(0, 100);
  // A prepared link must never send an older version of an edited consultation.
  const invalidateMessage = () => {
    const link = document.getElementById('message-link');
    if (link.hidden) return;
    link.hidden = true;
    link.removeAttribute('href');
    document.getElementById('form-status').textContent = 'Has cambiado la consulta. Pulsa «Preparar mensaje en WhatsApp» para actualizarla.';
  };
  form.addEventListener('input', invalidateMessage);
  form.addEventListener('change', invalidateMessage);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const get = name => String(form.elements[name].value).trim();
    if (!get('localidad') || get('mensaje').length < 10) {
      document.getElementById('form-status').textContent = 'Indica la localidad y describe el trabajo con al menos 10 caracteres.';
      return;
    }
    const text = `Hola ASSA, me gustaría consultar un trabajo.\n${get('nombre') ? 'Nombre: ' + get('nombre') + '\n' : ''}Servicio: ${get('servicio')}\nLocalidad: ${get('localidad')}\n\n${get('mensaje')}`;
    const link = document.getElementById('message-link');
    link.href = 'https://wa.me/34877214141?text=' + encodeURIComponent(text);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.hidden = false;
    document.getElementById('form-status').textContent = 'Mensaje preparado. Pulsa «Continuar a WhatsApp» para abrirlo y enviarlo allí. Aún no se ha enviado a ASSA.';
    link.focus();
  });
})();
