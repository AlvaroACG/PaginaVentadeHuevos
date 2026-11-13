const { createApp } = require('./src/app');
const { OrderStore } = require('./src/models/orders');
const { readConfig } = require('./src/config');
const { verifyTurnstile } = require('./src/services/turnstile');
const { createMailer, startNotifications } = require('./src/services/mail');
const config = readConfig(process.env);
const store = new OrderStore(config.databasePath);
const app = createApp({ config, store, verify: token => verifyTurnstile(token, config) });
const stop = startNotifications(store, createMailer(config));
const server = app.listen(config.port, () => console.log('Servidor activo en puerto ' + config.port));
function shutdown() { stop(); server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
