async function verifyTurnstile(token, config, fetchImpl = fetch) {
  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secret, response: token }), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Turnstile no disponible');
  const result = await response.json();
  return result.success === true && result.hostname === config.hostname && result.action === 'pedido';
}
module.exports = { verifyTurnstile };
