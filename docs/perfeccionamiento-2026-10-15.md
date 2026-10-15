# Perfeccionamiento sobre la versión aprobada

Base: 07c42cc. Las 21 páginas públicas devolvieron HTTP 200 y coincidieron byte a byte con main antes de editar. No ejecutar scripts/build_site.py para desplegar: es un generador histórico que reconstruye páginas. La fuente de publicación actual es el HTML estático versionado.

## Cambios y fuentes

- Misma estructura, rutas, navegación, identidad y contenido de servicios. Se amplía la franja existente de confianza, no se duplica.
- Fundación 2018 y experiencia profesional del equipo superior a 20 años: datos confirmados por Samuel en el encargo.
- Tres reseñas y estrellas recuperadas literalmente del commit 67db63191458f0354253a0c36e8eedffbf54402d: yerling fabian, Lena Sanchez, Marta Llurba Rodriguez. No se reutiliza el antiguo total de reseñas ni la media, que pueden estar desactualizados. Fuente disponible en el proyecto; no una sincronización en vivo con Google.
- Marcas confirmadas por Samuel: Kosner, Mitsubishi Electric, Warmhaus, Huawei, Deye. Presentación tipográfica discreta, sin inventar logos ni condición de partner.
- Empresa: origen familiar, atención posterior y condiciones de garantía sin plazo inventado. El bloque #equipo queda preparado para incorporar una foto profesional real; no hay espacio vacío ni falsa foto de equipo.
- Dos fichas breves, vinculadas cada una a una fotografía concreta ya publicada: caldera Warmhaus y montaje Kosner. No se afirma localidad, potencia, modelo, ahorro, fecha ni puesta en marcha. La galería sigue advirtiendo que incluye instalaciones distintas. Los demás casos esperan información suficiente.
- CTA final de los nueve servicios con consulta contextual, fotos por WhatsApp y teléfono. Sin nuevo botón flotante.
- Zonas: enlaces a servicios; se mantienen todas las localidades y enlaces de consulta que precargan localidad.
- Imagen de portada de 768 px para móvil: 113572 bytes frente a 413596 bytes del original; se conserva el original para pantallas mayores.
- Contacto: continúa como preparador de WhatsApp, sin backend ni recepción por email. Validación de espacios con foco y mensaje de error; se invalida el enlace si cambian los datos; no se permite un envío GET accidental si falla JavaScript. No se afirma que se haya enviado un mensaje.

## SEO

Se conservan titles, descriptions, H1, canonical, Open Graph, favicon, robots y sitemap, todos presentes. HomeAndConstructionBusiness es un subtipo de LocalBusiness: se añade foundingDate e imagen real. Service conserva el proveedor y se alinea con las zonas existentes. BreadcrumbList de proyectos incluye el nivel Proyectos también visible.

No se añade Review ni AggregateRating para reseñas propias: https://developers.google.com/search/docs/appearance/structured-data/review-snippet . No se promete obtener estrellas en buscadores. No se añade FAQPage solo para resultados enriquecidos; las preguntas siguen visibles y no se altera su contenido.

## Plantilla editorial para casos futuros

Usar la estructura .case-study / .case-facts de los dos ejemplos actuales. Antes de publicar un caso completo, documentar: título, localidad autorizada, necesidad del cliente, solución elegida, actuación y equipos comprobados, resultado verificado, fotos vinculadas inequívocamente a esa obra y permiso de publicación. Omitir datos no confirmados. Nunca agrupar imágenes de obras distintas como un único caso. Si no se ha verificado la puesta en servicio, no afirmarla.

## Consejos (futuro, no publicado)

Se puede añadir /consejos/ y /consejos/<slug>/ con el header/footer y CSS actuales, sin migración ni cambiar rutas de servicios. Cada artículo deberá resolver una duda concreta, indicar autor/revisión técnica real y fecha, enlazar al servicio relacionado y aparecer en sitemap solo cuando esté terminado. Article y BreadcrumbList con datos reales. Primera propuesta: elección de aire acondicionado para una vivienda según distribución, aislamiento y uso; incluir ejemplos revisados por el instalador. Normativa y garantías requieren fuentes oficiales vigentes. No se han creado páginas vacías ni artículos de relleno.

## Límites de verificación

El formulario no envía emails: no existe email de destino ni entrega de correo que certificar. RGPD: se describe el funcionamiento real existente, sin afirmar que esta revisión equivalga a una auditoría legal. No se inventa identidad fiscal ni política de conservación. Una recepción por correo requerirá definir backend, destinatario, protección frente a spam y condiciones de tratamiento antes de activarla.

Los objetivos LCP/CLS/INP requieren mediciones de navegador y datos de campo; el tamaño de recursos por sí solo no acredita Core Web Vitals. No confundir validación estática con pruebas visuales en resoluciones móviles. Render requiere confirmar el workspace de la cuenta antes de consultar despliegues.
