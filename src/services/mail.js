const nodemailer = require('nodemailer');
function createMailer(config) {
  const transport = nodemailer.createTransport(config.smtp);
  return row => transport.sendMail({ from: config.mailFrom, to: config.orderEmail,
    subject: 'Nuevo pedido ' + row.id,
    text: 'Pedido: ' + row.id + '\n' + Object.entries(JSON.parse(row.payload)).map(([key,value]) => key + ': ' + value).join('\n') });
}
async function deliverNext(store, send) {
  const row = store.claimMail();
  if (!row) return;
  try { await send(row); store.mailDone(row.id); }
  catch { store.mailFailed(row.id); console.error('No se pudo notificar un pedido; se reintentará.'); }
}
function startNotifications(store, send) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await deliverNext(store, send); } catch { console.error('No se pudo procesar la cola de correo.'); }
    finally { running = false; }
  }, 5000);
  timer.unref();
  return () => clearInterval(timer);
}
module.exports = { createMailer, deliverNext, startNotifications };
