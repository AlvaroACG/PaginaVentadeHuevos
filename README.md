# Venta de huevos

Aplicación Node.js con API del mismo origen y separación de modelos, controladores, servicios y vistas públicas. El navegador no envía directamente a FormSubmit ni conoce el correo destinatario.

- `public/`: páginas, estilos, imágenes y JavaScript público.
- `src/models/`: validación, precios y persistencia SQLite.
- `src/controllers/`: recepción de pedidos e idempotencia.
- `src/services/`: validación Turnstile y notificación SMTP con cola persistente.
- `src/app.js`: rutas, límites, cabeceras de seguridad y publicación exclusiva de `public/`.

Requiere Node.js 24. Ejecutar `npm ci`, configurar `.env` siguiendo [DEPLOYMENT.md](DEPLOYMENT.md), luego `npm test` y `npm start`.

La arquitectura por sí sola no garantiza seguridad: la validación del captcha y de los precios ocurre en el servidor, el correo y las credenciales se configuran fuera de los archivos públicos, y producción necesita HTTPS y almacenamiento persistente. Ver las limitaciones y comprobaciones de despliegue en la guía.
