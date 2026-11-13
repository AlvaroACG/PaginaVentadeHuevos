
    // ============================================
    // CONFIGURACIÓN - CAMBIA ESTOS VALORES
    // ============================================
    const CONFIG = {
      // ⚠️ PON TU NÚMERO AQUÍ (código de país sin + ni 00)
      whatsappNumber: "569977696527",

      // Mensaje predeterminado (codificado para URL)
      defaultMessage: "Hola, quiero información sobre sus productos",

      // Texto que se muestra en la tarjeta
      previewMessage: "Hola, quiero información"
    };

    // ============================================
    // NO TOCAR NADA DE AQUÍ PARA ABAJO
    // ============================================

    // Función para generar link de WhatsApp
    function generarLink(numero, mensaje) {
      const mensajeCodificado = encodeURIComponent(mensaje);
      return `https://wa.me/${numero}?text=${mensajeCodificado}`;
    }

    // Actualizar todo cuando cargue la página
    document.addEventListener('DOMContentLoaded', function() {
      const wspLink = document.getElementById('wspLink');
      const previewDiv = document.getElementById('mensajePreview');

      // Generar el link
      const linkCompleto = generarLink(
        CONFIG.whatsappNumber,
        CONFIG.defaultMessage
      );

      // Asignar al botón
      wspLink.href = linkCompleto;

      // Actualizar vista previa
      previewDiv.innerHTML = `📝 Mensaje: "${CONFIG.previewMessage}"`;

      // Si no hay número configurado, mostrar advertencia
      if (CONFIG.whatsappNumber === "56977696527") {
        console.warn('⚠️ CAMBIA EL NÚMERO DE WHATSAPP en CONFIG.whatsappNumber');
        previewDiv.innerHTML += '<br><span style="color: #e74c3c; font-size: 13px;">⚠️ Número no configurado</span>';
      }
    });

    // CARGAR NAVBAR
    fetch("navbar.html")
      .then(res => res.text())
      .then(data => {
        document.getElementById("navbar-container").innerHTML = data;

        // Activar menú hamburguesa
        const toggle = document.querySelector(".menu-toggle");
        const menu = document.querySelector(".navbar-menu");

        if (toggle) {
          toggle.addEventListener("click", function() {
            menu.classList.toggle("active");
          });
        }
      });
