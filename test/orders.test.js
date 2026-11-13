const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { OrderStore, validateOrder } = require('../src/models/orders');
const { verifyTurnstile } = require('../src/services/turnstile');
const { deliverNext, createMailer } = require('../src/services/mail');
const { readConfig } = require('../src/config');
const order = { nombre: 'Cliente de prueba', telefono: '+56912345678', direccion: 'Calle de prueba 123', horario: '', pago: 'Efectivo', docenas: 2, bandejas: 1 };
const config = { origin: 'https://tienda.example', hostname: 'tienda.example', siteKey: 'public-key', secret: 'private-key' };
async function fixture(t, verify = async () => true, store = new OrderStore(':memory:')) {
  const server = createApp({ config, store, verify }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  return { store, base, post: (body = { ...order, token: 'valid' }, key = randomUUID(), headers = {}) => fetch(base+'/api/pedidos', {
    method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', 'Idempotency-Key': key, ...headers }, body: JSON.stringify(body)
  }) };
}
test('calcula precios en servidor e ignora total y correo manipulados', async t => {
  const { post, store } = await fixture(t); const key = randomUUID();
  const response = await post({ ...order, token: 'ok', total: 1, email: 'attacker@example.com' },key);
  assert.equal(response.status,201); const result=await response.json();
  assert.equal(result.total,11880); assert.match(result.orderNumber,/^PED-[0-9a-f-]{36}$/);
  const payload=JSON.parse(store.find(key).payload); assert.equal(payload.email,undefined); assert.equal(payload.total,11880);
});
test('rechaza cantidades negativas, decimales, cadenas, vacías y excesivas', () => {
  for (const docenas of [-1, 0.5, '2', null, 1001, NaN]) assert.throws(() => validateOrder({ ...order, docenas }));
  assert.throws(() => validateOrder({ ...order, docenas: 0, bandejas: 0 }));
  assert.throws(() => validateOrder({ ...order, nombre: ' ' }));
  assert.throws(() => validateOrder({ ...order, pago: 'otro' }));
});
test('captcha inválido, ausente o servicio caído no guarda pedidos', async t => {
  let mode = 'invalid'; const { post, store } = await fixture(t,async () => { if (mode==='down') throw Error(); return false; });
  const key=randomUUID();
  assert.equal((await post({ ...order },key)).status,400);
  assert.equal((await post({ ...order, token:'bad' },key)).status,400);
  mode='down'; assert.equal((await post({ ...order, token:'bad' },key)).status,503);
  assert.equal(store.find(key),undefined);
});
test('reintentos y peticiones simultáneas generan un solo pedido', async t => {
  let calls=0; const { post,store }=await fixture(t,async()=> { calls++; await new Promise(r=>setTimeout(r,10)); return true; });
  const key=randomUUID(); const responses=await Promise.all([post(undefined,key),post(undefined,key)]);
  const results=await Promise.all(responses.map(r=>r.json())); assert.equal(results[0].orderNumber,results[1].orderNumber);
  const before=calls; const retry=await post({...order},key); assert.equal(retry.status,201); assert.equal(calls,before);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,1);
  assert.equal((await post({...order,docenas:3},key)).status,409);
});
test('persistencia y cola sobreviven a reabrir la base', () => {
  const dir=mkdtempSync(path.join(os.tmpdir(),'orders-')); const filename=path.join(dir,'orders.sqlite');
  let store=new OrderStore(filename); const key=randomUUID(); const row=store.create(key,validateOrder(order)); store.close();
  store=new OrderStore(filename);
  try { assert.equal(store.find(key).id,row.id); assert.equal(store.claimMail().id,row.id); assert.equal(store.claimMail(),undefined); }
  finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
test('un token reutilizado con claves distintas no duplica pedidos aun si Cloudflare lo acepta', async t => {
  const {post,store}=await fixture(t);
  const responses=await Promise.all([post(),post()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,1);
});
test('fallo SMTP conserva pedido y reintenta; correo enviado sale de la cola', async t => {
  const errors=[]; t.mock.method(console,'error',message=>errors.push(message));
  const store=new OrderStore(':memory:'); const row=store.create(randomUUID(),validateOrder(order));
  try {
    await deliverNext(store,async()=> { throw Error('SMTP'); });
    let saved=store.db.prepare('SELECT * FROM orders').get(); assert.equal(saved.mail_sent,0); assert.ok(saved.next_attempt>Date.now());
    store.db.prepare('UPDATE orders SET next_attempt=0').run();
    await deliverNext(store,async mail=>assert.equal(mail.id,row.id));
    assert.equal(store.claimMail(),undefined);
    assert.equal(errors.length,1);
  } finally { store.close(); }
});
test('notificación usa destinatario del servidor y cuerpo de texto', async () => {
  const send=createMailer({smtp:{streamTransport:true,buffer:true},mailFrom:'tienda@example.com',orderEmail:'privado@example.com'});
  const result=await send({id:'PED-test',payload:JSON.stringify({...order,nombre:'<script>texto</script>'})});
  assert.deepEqual(result.envelope.to,['privado@example.com']);
  assert.match(result.message.toString(),/Content-Type: text\/plain/);
  assert.doesNotMatch(result.message.toString(),/Content-Type: text\/html/);
});
test('verifica éxito, hostname y action de Cloudflare, y no acepta errores HTTP', async () => {
  const verify=result=>verifyTurnstile('token',config,async(url,options)=> {
    assert.equal(JSON.parse(options.body).secret,'private-key');
    return {ok:true,json:async()=>result};
  });
  assert.equal(await verify({success:true,hostname:config.hostname,action:'pedido'}),true);
  for (const result of [{success:false},{success:true,hostname:'otro',action:'pedido'},{success:true,hostname:config.hostname,action:'otro'}]) assert.equal(await verify(result),false);
  await assert.rejects(verifyTurnstile('token',config,async()=>({ok:false})));
});
test('bloquea orígenes ajenos, formato incorrecto y claves inválidas', async t => {
  const {post,base}=await fixture(t);
  assert.equal((await post(undefined,randomUUID(),{Origin:'https://otro.example'})).status,403);
  assert.equal((await post(undefined,randomUUID(),{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post(undefined,'bad')).status,400);
  const response=await fetch(base+'/api/pedidos',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{broken'});
  assert.equal(response.status,400);
  assert.equal((await post({...order,token:'x'.repeat(10000)})).status,413);
});
test('solo sirve public y no filtra correo, código, base ni configuración privada', async t => {
  const {base}=await fixture(t);
  for (const file of ['/.env','/.env.example','/server.js','/package.json','/src/config.js','/data/orders.sqlite','/pedido']) {
    const response=await fetch(base+file); assert.equal(response.status,404,file);
  }
  const publicConfig=await (await fetch(base+'/api/config')).json(); assert.deepEqual(publicConfig,{siteKey:config.siteKey,prices:{docenas:2640,bandejas:6600}});
  for (const file of ['/','/pedido.html','/contacto.html','/js/pedido.js']) {
    const response=await fetch(base+file); assert.equal(response.status,200);
    assert.ok(response.headers.get('content-security-policy').includes("script-src-attr 'none'"));
    assert.doesNotMatch(await response.text(),/formsubmit|acarvita|private-key/i);
  }
});
test('limita intentos sin confiar en IP enviada por el cliente', async t => {
  const errors=[]; t.mock.method(console,'error',error=>errors.push(error));
  const {post}=await fixture(t);
  for(let i=0;i<20;i++) assert.equal((await post({},randomUUID(),{'X-Forwarded-For':'1.2.3.'+i})).status,400);
  assert.equal((await post()).status,429);
  assert.equal(errors[0].code,'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR');
});
test('configuración incompleta y HTTP en producción fallan al arrancar', () => {
  assert.throws(()=>readConfig({}),/Falta configurar/);
  const env={PUBLIC_ORIGIN:'http://localhost:3000',TURNSTILE_SITE_KEY:'test',TURNSTILE_SECRET_KEY:'secret',SMTP_HOST:'smtp.example',SMTP_PORT:'587',SMTP_USER:'u',SMTP_PASS:'p',MAIL_FROM:'from@example.com',ORDER_EMAIL:'to@example.com'};
  assert.equal(readConfig(env).smtp.requireTLS,true);
  assert.throws(()=>readConfig({...env,NODE_ENV:'production'}),/HTTPS/);
});
