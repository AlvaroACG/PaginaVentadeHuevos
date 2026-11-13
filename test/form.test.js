const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { JSDOM } = require("jsdom");
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
test("formulario: cantidades, captcha, doble clic, error, reintento y confirmación", async () => {
  const html = readFileSync(
    path.join(__dirname, "../public/pedido.html"),
    "utf8",
  );
  const script = readFileSync(
    path.join(__dirname, "../public/js/pedido.js"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://tienda.example/pedido.html?formato=docenas",
    runScripts: "outside-only",
  });
  const w = dom.window,
    d = w.document;
  let callbacks,
    fail = true,
    posts = [];
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder;
  w.AbortSignal = AbortSignal;
  w.fetch = async (url, options) => {
    if (url === "/api/config")
      return {
        ok: true,
        json: async () => ({
          siteKey: "public",
          prices: { docenas: 2640, bandejas: 6600 },
        }),
      };
    if (url === "/navbar.html") return { text: async () => "<nav></nav>" };
    assert.equal(url, "/api/pedidos");
    posts.push(options);
    if (fail) throw new w.TypeError("network");
    return {
      ok: true,
      json: async () => ({ orderNumber: "PED-test", total: 11880 }),
    };
  };
  w.turnstile = {
    render: (selector, options) => {
      callbacks = options;
      return "widget";
    },
    reset: () => {},
  };
  w.eval(script);
  await tick();
  w.onTurnstileLoad();
  assert.equal(d.getElementById("docenas").value, "1");
  const submit = d.getElementById("btnSubmit");
  assert.equal(submit.disabled, true);
  const set = (selector, value) => {
    const input = d.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new w.Event("input"));
  };
  set('input[name="👤 Nombre completo"]', "Cliente");
  set('input[type="tel"]', "+56912345678");
  set('input[name="📍 Dirección"]', "Calle 123");
  set("select", "Efectivo");
  set("#docenas", "2");
  set("#bandejas", "1");
  assert.equal(d.getElementById("total").textContent, "11.880");
  callbacks.callback("token1");
  assert.equal(submit.disabled, false);
  callbacks["expired-callback"]();
  assert.equal(submit.disabled, true);
  callbacks.callback("token2");
  callbacks["error-callback"]();
  assert.equal(submit.disabled, true);
  callbacks.callback("token3");
  const send = () =>
    d
      .getElementById("pedidoForm")
      .dispatchEvent(new w.Event("submit", { cancelable: true }));
  send();
  send();
  await tick();
  assert.equal(posts.length, 1);
  assert.match(d.getElementById("formStatus").textContent, /mismos datos/);
  assert.equal(
    d.querySelector('input[name="👤 Nombre completo"]').value,
    "Cliente",
  );
  assert.equal(submit.disabled, true);
  assert.doesNotMatch(
    w.sessionStorage.getItem("pendingOrder"),
    /Cliente|Calle|12345678/,
  );
  fail = false;
  callbacks.callback("token4");
  send();
  await tick();
  assert.equal(posts.length, 2);
  assert.equal(
    posts[0].headers["Idempotency-Key"],
    posts[1].headers["Idempotency-Key"],
  );
  assert.equal(JSON.parse(posts[1].body).token, "token4");
  assert.equal(d.getElementById("pedidoConfirmado").hidden, false);
  assert.match(d.getElementById("orderNumber").textContent, /PED-test/);
  assert.equal(d.getElementById("docenas").value, "0");
  assert.equal(w.sessionStorage.getItem("pendingOrder"), null);
  assert.equal(d.activeElement.id, "pedidoConfirmado");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(d.getElementById("pedidoConfirmado").hidden, true);
  assert.equal(d.activeElement.id, "docenas");
  dom.window.close();
});
test("navegación, recursos y anclas internas apuntan a destinos existentes", () => {
  const fs = require("node:fs");
  const publicPath = path.join(__dirname, "../public");
  for (const name of [
    "index.html",
    "beneficio.html",
    "pedido.html",
    "contacto.html",
  ]) {
    const dom = new JSDOM(
      fs.readFileSync(path.join(publicPath, name), "utf8"),
      { url: "https://tienda.example/" + name },
    );
    const d = dom.window.document;
    assert.equal(d.querySelectorAll("h1").length, 1, name);
    for (const element of d.querySelectorAll(
      "a[href],img[src],script[src],link[href]",
    )) {
      const url = new URL(
        element.getAttribute("href") || element.getAttribute("src"),
        "https://tienda.example/" + name,
      );
      if (url.origin !== "https://tienda.example") continue;
      const file = path.join(
        publicPath,
        url.pathname === "/" ? "index.html" : url.pathname.slice(1),
      );
      assert.ok(fs.existsSync(file), name + " -> " + url.pathname);
      if (url.hash) {
        const target = new JSDOM(fs.readFileSync(file, "utf8")).window.document;
        assert.ok(
          target.getElementById(url.hash.slice(1)),
          name + " -> " + url.hash,
        );
      }
    }
    dom.window.close();
  }
});
test("menú móvil expone su estado y se cierra con Escape", async () => {
  const html = readFileSync(
    path.join(__dirname, "../public/index.html"),
    "utf8",
  );
  const script = readFileSync(
    path.join(__dirname, "../public/js/site.js"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://tienda.example/",
    runScripts: "outside-only",
  });
  const w = dom.window,
    d = w.document;
  w.fetch = async () => ({
    ok: true,
    json: async () => ({ prices: { docenas: 2640, bandejas: 6600 } }),
  });
  w.eval(script);
  await tick();
  const button = d.querySelector(".menu-toggle");
  button.click();
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(
    d.getElementById("main-menu").classList.contains("active"),
    true,
  );
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(d.querySelector("a[aria-current]").textContent, "Inicio");
  dom.window.close();
});
