
document.addEventListener("DOMContentLoaded", function() {
  fetch("/navbar.html")
    .then(res => res.text())
    .then(data => {
      document.getElementById("navbar-container").innerHTML = data;

      const toggle = document.querySelector(".menu-toggle");
      const menu = document.querySelector(".navbar-menu");

      if (toggle) {
        toggle.addEventListener("click", function() {
          menu.classList.toggle("active");
        });
      }
    });
});
