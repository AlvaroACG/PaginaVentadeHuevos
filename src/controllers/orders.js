const { validateOrder, fingerprint } = require('../models/orders');
function ordersController({ store, verify }) {
  return async (req, res, next) => {
    try {
      let order;
      try { order = validateOrder(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
      const key = req.get('Idempotency-Key') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return res.status(400).json({ error: 'Identificador de envío inválido' });
      let row = store.find(key);
      if (!row) {
        const token = req.body.token;
        if (typeof token !== 'string' || !token || token.length > 2048) return res.status(400).json({ error: 'Completa el captcha' });
        let valid;
        try { valid = await verify(token); } catch { return res.status(503).json({ error: 'No se pudo verificar el captcha. Intenta nuevamente.' }); }
        if (!valid) return res.status(400).json({ error: 'Captcha inválido o caducado. Intenta nuevamente.' });
        row = store.create(key, order, token);
      }
      if (row.fingerprint !== fingerprint(order)) return res.status(409).json({ error: 'Este envío ya corresponde a otro pedido. Inicia uno nuevo.' });
      res.status(201).json({ orderNumber: row.id, total: JSON.parse(row.payload).total });
    } catch (error) { next(error); }
  };
}
module.exports = { ordersController };
