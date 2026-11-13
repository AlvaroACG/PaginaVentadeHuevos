const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const PRICES = { docenas: 2640, bandejas: 6600 };
function validateOrder(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Pedido inválido');
  const order = {};
  for (const [key, max, required] of [['nombre',120,true],['telefono',30,true],['direccion',300,true],['horario',200,false]]) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()) || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Revisa los datos de contacto');
    order[key] = value.trim();
  }
  if (!/^[+()\d\s-]{7,30}$/.test(order.telefono)) throw new Error('Teléfono inválido');
  if (!['Efectivo','Transferencia'].includes(body.pago)) throw new Error('Método de pago inválido');
  order.pago = body.pago;
  for (const key of Object.keys(PRICES)) {
    if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 1000) throw new Error('Las cantidades deben ser enteros entre 0 y 1000');
    order[key] = body[key];
  }
  if (order.docenas + order.bandejas === 0) throw new Error('Debes pedir al menos un producto');
  order.total = order.docenas * PRICES.docenas + order.bandejas * PRICES.bandejas;
  return order;
}
const fingerprint = order => createHash('sha256').update(JSON.stringify(order)).digest('hex');
class OrderStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, token_hash TEXT UNIQUE,
        payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        mail_sent INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
      );`);
  }
  find(key) { return this.db.prepare('SELECT * FROM orders WHERE request_key = ?').get(key); }
  create(key, order, token) {
    const id = 'PED-' + randomUUID();
    const tokenHash = token ? createHash('sha256').update(token).digest('hex') : null;
    this.db.prepare('INSERT INTO orders (id,request_key,fingerprint,payload,token_hash) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').run(id,key,fingerprint(order),JSON.stringify(order),tokenHash);
    const row = this.find(key);
    if (!row) throw Object.assign(new Error('Captcha ya utilizado. Complétalo nuevamente.'), { status: 400 });
    return row;
  }
  claimMail(now = Date.now()) {
    return this.db.prepare(`UPDATE orders SET lease_until=?, attempts=attempts+1 WHERE id=(
      SELECT id FROM orders WHERE mail_sent=0 AND next_attempt<=? AND lease_until<=? ORDER BY created_at LIMIT 1
    ) RETURNING *`).get(now+60000,now,now);
  }
  mailDone(id) { this.db.prepare('UPDATE orders SET mail_sent=1,lease_until=0 WHERE id=?').run(id); }
  mailFailed(id) { this.db.prepare('UPDATE orders SET lease_until=0,next_attempt=? WHERE id=?').run(Date.now()+60000,id); }
  close() { this.db.close(); }
}
module.exports = { OrderStore, validateOrder, fingerprint, PRICES };
