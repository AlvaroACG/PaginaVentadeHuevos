# Despliegue de la tienda

Requiere Node.js 24 y un servidor con disco persistente. No funciona como una web puramente estática (GitHub Pages) ni con SQLite en un filesystem efímero de funciones serverless.

## Configuración

1. Instalar dependencias con `npm ci`.
2. Copiar `.env.example` a `.env` en el servidor y completar todas las variables vacías. No subir ese archivo al repositorio.
3. Configurar un widget Turnstile para el dominio de la tienda. La clave de sitio es pública; la clave secreta solo se configura en el servidor. La API exige hostname coincidente con `PUBLIC_ORIGIN` y action `pedido`.
4. Configurar SMTP autenticado. `ORDER_EMAIL` es el destinatario privado; `MAIL_FROM` debe ser una dirección autorizada por el proveedor SMTP. En puerto 465 se usa TLS directo; en otros puertos se exige STARTTLS. No se aceptan destinatarios enviados por el cliente.
5. En producción usar `NODE_ENV=production` y `PUBLIC_ORIGIN=https://tu-dominio.example` (sin barra final). Terminar TLS en el proveedor o proxy inverso. Para localhost, usar el origen HTTP de `.env.example` y las claves oficiales de prueba de Turnstile, nunca en producción.
6. Montar un volumen persistente y configurar `DATABASE_PATH` dentro de ese volumen. La carpeta contiene datos de contacto: restringir acceso al usuario del servicio, cifrar el disco/backups según las capacidades del hosting y definir una política de retención. No exponer ni servir esa carpeta.
7. Si se usa proxy inverso, configurar `TRUST_PROXY` únicamente con sus IP o redes de confianza (lista separada por comas; por ejemplo `loopback` para un proxy local). El proxy debe sobrescribir los encabezados reenviados y el puerto de Node debe quedar inaccesible desde Internet. No usar una confianza global. Sin esa variable el límite se aplica a la conexión directa, por lo que detrás de un proxy puede agrupar a todos los visitantes.
8. Ejecutar `npm test` y `npm start`. Todas las páginas se sirven desde `public/`; conservar las URLs `/pedido.html`, `/contacto.html`, etc. Publicar el repositorio completo con Node, no solo `public/`.

## Pedidos y notificaciones

`POST /api/pedidos` recibe JSON, un encabezado `Idempotency-Key` UUID v4 y un token Turnstile. Valida los campos, cantidades (0–1000 por producto), pago, origen y captcha. Recalcula precios y guarda el pedido antes de responder con su identificador `PED-<UUID>` y total. No es una secuencia correlativa: la clave primaria garantiza unicidad sin depender del navegador. No hay endpoints públicos para consultar datos personales de pedidos.

La clave de idempotencia evita duplicados por doble clic, concurrencia y reintentos tras perder una respuesta. El navegador guarda solo clave y hash del contenido en sessionStorage para reconocer un reintento después de recargar; no guarda los datos personales allí. Cambiar el pedido genera otra clave. Los tokens usados se identifican por hash único en la base, sin conservar el token original.

El correo es una notificación posterior al registro: la interfaz dice «Pedido recibido», sin prometer que el correo se entregó o que la entrega esté confirmada. La cola está en la misma fila persistente que el pedido. Se procesa cada 5 segundos; los fallos SMTP se reintentan tras 1 minuto, también después de reiniciar el servidor. Supervisar el mensaje de error del servicio y las filas `mail_sent=0`, `attempts` y `next_attempt` mediante acceso privado al servidor. No se registran datos personales ni credenciales en esos errores.

La entrega de correo es al menos una vez: si el proceso termina después de enviar y antes de marcar la notificación como enviada, podría repetirse el correo con el mismo número de pedido. SMTP no proporciona una transacción conjunta con SQLite. El pedido no se duplica.

Esta versión está pensada para una instancia Node con un volumen SQLite local. El limitador de peticiones es local al proceso y se reinicia con él. Para varias réplicas migrar base/cola a PostgreSQL y el limitador a un almacenamiento compartido; no copiar el archivo SQLite a varias instancias. Realizar backups consistentes de SQLite (incluyendo su estado WAL mediante la herramienta de backup de SQLite) y probar restauración.

## Comprobación del despliegue

- Completar un pedido de prueba y comprobar que muestra su número, se guarda y llega al destinatario SMTP correcto.
- Probar captcha caducado/error, cantidades inválidas y un reintento tras pérdida de conexión.
- Confirmar que `/.env`, `/server.js`, `/src/config.js` y `/data/orders.sqlite` devuelven 404.
- Verificar HTTPS, dominio autorizado de Turnstile y límite de peticiones detrás del proxy real.

Las pruebas automáticas simulan Cloudflare y SMTP; no envían correos ni pedidos reales. Esos servicios requieren una prueba de integración en el entorno de despliegue.

El correo anterior fue eliminado de los archivos actuales y del HTML/JavaScript servido. Como el repositorio es público, puede seguir visible en commits históricos. Esta migración no reescribe el historial de Git ni retira copias previas.

Documentación de referencia: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
