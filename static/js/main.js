(function () {
  var root = document.documentElement;
  var THEME_KEY = "site-theme";
  var SCALE_KEY = "site-font-scale";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function applyScale(scale) {
    root.style.setProperty("--font-scale", scale);
    localStorage.setItem(SCALE_KEY, scale);
  }

  var savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);

  var savedScale = parseFloat(localStorage.getItem(SCALE_KEY)) || 1;
  applyScale(savedScale);

  document.addEventListener("DOMContentLoaded", function () {
    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    }

    var aaBtn = document.getElementById("aa-toggle");
    if (aaBtn) {
      aaBtn.addEventListener("click", function () {
        var current = parseFloat(getComputedStyle(root).getPropertyValue("--font-scale")) || 1;
        var next = current >= 1.3 ? 0.9 : Math.round((current + 0.15) * 100) / 100;
        applyScale(next);
      });
    }
  });
})();
