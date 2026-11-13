const path = require('node:path');
function readConfig(env) {
  const required = ['PUBLIC_ORIGIN', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'ORDER_EMAIL'];
  for (const key of required) if (!env[key]) throw new Error('Falta configurar ' + key);
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN debe ser un origen sin ruta');
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Se requiere HTTPS en producción');
  const smtpPort = Number(env.SMTP_PORT);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT inválido');
  return { origin: origin.origin, hostname: origin.hostname, siteKey: env.TURNSTILE_SITE_KEY,
    secret: env.TURNSTILE_SECRET_KEY, port: Number(env.PORT || 3000),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map(value => value.trim()) : false,
    databasePath: path.resolve(env.DATABASE_PATH || 'data/orders.sqlite'),
    smtp: { host: env.SMTP_HOST, port: smtpPort, secure: smtpPort === 465, requireTLS: smtpPort !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 10000, socketTimeout: 20000 },
    mailFrom: env.MAIL_FROM, orderEmail: env.ORDER_EMAIL };
}
module.exports = { readConfig };
