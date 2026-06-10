/**
 * Supform embed script.
 *
 * Usage:
 *   <div data-supform="FORM_ID"></div>
 *   <script src="https://YOUR_HOST/embed.js" async></script>
 *
 * Replaces each placeholder with an auto-resizing iframe of the public form. The iframe
 * grows to fit its content via postMessage height events from the embedded page.
 */
(function () {
  var origin = new URL(document.currentScript.src).origin;

  function mount(el) {
    var id = el.getAttribute("data-supform");
    if (!id || el.dataset.supformMounted) return;
    el.dataset.supformMounted = "1";

    var iframe = document.createElement("iframe");
    var query = el.getAttribute("data-supform-query") || "";
    iframe.src = origin + "/embed/" + encodeURIComponent(id) + query;
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.minHeight = "480px";
    iframe.setAttribute("title", "Supform form");
    iframe.setAttribute("allow", "geolocation");
    el.appendChild(iframe);

    window.addEventListener("message", function (event) {
      if (event.source !== iframe.contentWindow) return;
      var data = event.data || {};
      if (data.type === "supform:resize" && typeof data.height === "number") {
        iframe.style.height = data.height + "px";
      }
    });
  }

  function mountAll() {
    document.querySelectorAll("[data-supform]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
})();
