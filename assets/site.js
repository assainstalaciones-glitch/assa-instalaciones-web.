'use strict';
(() => {
  const menu = document.querySelector('.mobile-menu');
  if (menu) {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
    });
    document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
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
