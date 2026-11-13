const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('node:path');
const { ordersController } = require('./controllers/orders');
const { PRICES } = require('./models/orders');
function createApp({ config, store, verify }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
    scriptSrcAttr: ["'none'"], styleSrc: ["'self'", "'unsafe-inline'"],
    frameSrc: ['https://challenges.cloudflare.com'], connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
    upgradeInsecureRequests: config.origin.startsWith('https:') ? [] : null
  } } }));
  app.use('/api', (req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.get('/api/config', (req,res) => res.json({ siteKey: config.siteKey, prices: PRICES }));
  app.post('/api/pedidos', rateLimit({ windowMs: 600000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos.' } }),
    (req,res,next) => {
      if (req.get('Origin') !== config.origin) return res.status(403).json({ error: 'Origen no permitido' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Se requiere JSON' });
      next();
    }, express.json({ limit: '8kb' }), ordersController({ store, verify }));
  app.use(express.static(path.join(__dirname, '../public'), { dotfiles: 'deny' }));
  app.use((req,res) => res.status(404).json({ error: 'No encontrado' }));
  app.use((error,req,res,next) => {
    const status = error.status === 400 ? 400 : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 503;
    res.status(status).json({ error: status === 503 ? 'No se pudo guardar el pedido. Reintenta con los mismos datos.' : 'Solicitud inválida. Completa nuevamente el captcha.' });
  });
  return app;
}
module.exports = { createApp };
