(function () {
  var root = document.documentElement;
  var THEME_KEY = "site-theme";
  var SCALE_KEY = "site-font-scale";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    syncGiscusTheme(theme);
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }

  function syncGiscusTheme(theme) {
    var iframe = document.querySelector("iframe.giscus-frame");
    if (!iframe) return;
    iframe.contentWindow.postMessage(
      { giscus: { setConfig: { theme: theme === "dark" ? "dark" : "light" } } },
      "https://giscus.app"
    );
  }

  function applyScale(scale) {
    root.style.setProperty("--prose-scale", scale);
    localStorage.setItem(SCALE_KEY, scale);
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  applyScale(parseFloat(localStorage.getItem(SCALE_KEY)) || 1);

  document.addEventListener("DOMContentLoaded", function () {
    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    }

    var sizeBtn = document.getElementById("size-toggle");
    if (sizeBtn) {
      sizeBtn.addEventListener("click", function () {
        var current = parseFloat(getComputedStyle(root).getPropertyValue("--prose-scale")) || 1;
        var next = current >= 1.3 ? 0.9 : Math.round((current + 0.15) * 100) / 100;
        applyScale(next);
      });
    }
  });
})();
