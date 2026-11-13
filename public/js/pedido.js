"use strict";
const form = document.getElementById("pedidoForm");
const submit = document.getElementById("btnSubmit");
const statusText = document.getElementById("formStatus");
let prices;
let widget;
let token = "";
let sending = false;
let pending;
try {
  pending = JSON.parse(sessionStorage.getItem("pendingOrder") || "null");
} catch {
  pending = null;
}

function calculate() {
  if (!prices) return;
  const doc = Number(document.getElementById("docenas").value);
  const ban = Number(document.getElementById("bandejas").value);
  const total = doc * prices.docenas + ban * prices.bandejas;
  document.getElementById("total").textContent = Number.isFinite(total)
    ? total.toLocaleString("es-CL")
    : "0";
}
function invalidateCaptcha() {
  token = "";
  submit.disabled = true;
}
function resetCaptcha() {
  invalidateCaptcha();
  if (widget !== undefined && window.turnstile) window.turnstile.reset(widget);
}
function closeModal() {
  document.getElementById("pedidoConfirmado").hidden = true;
  document.getElementById("overlay").hidden = true;
  document.getElementById("docenas").focus();
}
document
  .querySelectorAll("[data-close-modal]")
  .forEach((el) => el.addEventListener("click", closeModal));
document.getElementById("nuevoPedido").addEventListener("click", () => {
  form.reset();
  calculate();
  resetCaptcha();
  closeModal();
});
document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("pedidoConfirmado");
  if (modal.hidden) return;
  if (event.key === "Escape") closeModal();
  if (event.key === "Tab") {
    const buttons = [...modal.querySelectorAll("button")];
    if (
      event.shiftKey &&
      (document.activeElement === buttons[0] ||
        document.activeElement === modal)
    ) {
      event.preventDefault();
      buttons.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault();
      buttons[0].focus();
    }
  }
});
document.querySelectorAll("[data-qty]").forEach((button) =>
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.qty);
    input.value = Math.max(
      0,
      Math.min(
        1000,
        (Number(input.value) || 0) + Number(button.dataset.change),
      ),
    );
    calculate();
  }),
);
["docenas", "bandejas"].forEach((id) =>
  document.getElementById(id).addEventListener("input", calculate),
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending || !token || !form.reportValidity()) return;
  const data = new FormData(form);
  const order = {
    nombre: data.get("👤 Nombre completo"),
    telefono: data.get("📱 Teléfono"),
    direccion: data.get("📍 Dirección"),
    horario: data.get("🕒 Horario preferido de entrega"),
    pago: data.get("💳 Método de pago"),
    docenas: Number(data.get("🥚 Docenas")),
    bandejas: Number(data.get("📦 Bandejas")),
  };
  if (order.docenas + order.bandejas === 0) {
    statusText.textContent = "Debes pedir al menos un producto.";
    return;
  }
  const signature = JSON.stringify(order);
  if (!pending || pending.signature !== signature)
    pending = { key: crypto.randomUUID(), signature };
  sending = true;
  submit.disabled = true;
  submit.textContent = "Enviando...";
  const fields = [...form.querySelectorAll("input,select,button")];
  fields.forEach((field) => {
    field.disabled = true;
  });
  try {
    // Save a hash, never contact details, to recover a retry after a reload.
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(signature),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("pendingOrder") || "null",
      );
      if (saved?.digest === digest) pending.key = saved.key;
      sessionStorage.setItem(
        "pendingOrder",
        JSON.stringify({ key: pending.key, digest }),
      );
    } catch {
      /* In-memory retries still work if storage is unavailable. */
    }
    const response = await fetch("/api/pedidos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": pending.key,
      },
      body: JSON.stringify({ ...order, token }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "No se pudo guardar el pedido.");
    if (!result.orderNumber || !Number.isInteger(result.total))
      throw new Error("Respuesta inesperada. Reintenta con los mismos datos.");
    document.getElementById("orderNumber").textContent =
      "Número de pedido: " +
      result.orderNumber +
      " — Total: $" +
      result.total.toLocaleString("es-CL");
    document.getElementById("pedidoConfirmado").hidden = false;
    document.getElementById("overlay").hidden = false;
    document.getElementById("pedidoConfirmado").focus();
    pending = null;
    try {
      sessionStorage.removeItem("pendingOrder");
    } catch {
      /* Storage may be disabled. */
    }
    form.reset();
    calculate();
    statusText.textContent = "";
  } catch (error) {
    statusText.textContent =
      error.name === "TimeoutError" || error instanceof TypeError
        ? "No se pudo confirmar la respuesta. Reintenta con los mismos datos para evitar duplicados."
        : error.message;
  } finally {
    fields.forEach((field) => {
      field.disabled = false;
    });
    sending = false;
    submit.textContent = "Enviar mi pedido";
    resetCaptcha();
  }
});

async function init() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error();
    const config = await response.json();
    prices = config.prices;
    const format = new URLSearchParams(location.search).get("formato");
    if (format === "docenas" || format === "bandejas")
      document.getElementById(format).value = "1";
    calculate();
    window.onTurnstileLoad = () => {
      widget = window.turnstile.render("#captcha", {
        sitekey: config.siteKey,
        action: "pedido",
        size: "flexible",
        callback: (value) => {
          token = value;
          submit.disabled = sending;
          statusText.textContent = "";
        },
        "expired-callback": invalidateCaptcha,
        "error-callback": () => {
          invalidateCaptcha();
          statusText.textContent =
            "No se pudo cargar el captcha. Recarga la página.";
        },
      });
    };
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    script.onerror = () => {
      statusText.textContent =
        "No se pudo cargar el captcha. Recarga la página.";
    };
    document.head.append(script);
  } catch {
    statusText.textContent =
      "El formulario no está disponible. Intenta más tarde.";
  }
}
init();
