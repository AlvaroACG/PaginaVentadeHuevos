"use strict";
const toggle = document.querySelector(".menu-toggle");
const menu = document.getElementById("main-menu");
toggle?.addEventListener("click", () => {
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  toggle.setAttribute("aria-label", expanded ? "Abrir menú" : "Cerrar menú");
  menu?.classList.toggle("active", !expanded);
});
function closeMenu() {
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Abrir menú");
  menu?.classList.remove("active");
}
menu?.querySelectorAll("a").forEach((link) => {
  const current = location.pathname === "/" ? "/index.html" : location.pathname;
  if (new URL(link.href).pathname === current && !new URL(link.href).hash)
    link.setAttribute("aria-current", "page");
  link.addEventListener("click", closeMenu);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
// Prices displayed around the site follow the same catalogue as the API.
fetch("/api/config")
  .then((response) => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then((config) => {
    document.querySelectorAll("[data-price]").forEach((element) => {
      const price = config.prices[element.dataset.price];
      if (Number.isInteger(price))
        element.textContent = "$" + price.toLocaleString("es-CL");
    });
  })
  .catch(() => {
    /* Initial catalogue prices remain visible if the API is temporarily unavailable. */
  });
