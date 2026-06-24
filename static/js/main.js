(function () {
  var root = document.documentElement;
  var THEME_KEY = "site-theme";
  var SCALE_KEY = "site-font-scale";
  var LEADING_KEY = "site-line-height";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }

  function applyScale(scale) {
    root.style.setProperty("--prose-scale", scale);
    localStorage.setItem(SCALE_KEY, scale);
  }

  function applyLeading(leading) {
    root.style.setProperty("--prose-leading", leading);
    localStorage.setItem(LEADING_KEY, leading);
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  applyScale(parseFloat(localStorage.getItem(SCALE_KEY)) || 1);
  applyLeading(parseFloat(localStorage.getItem(LEADING_KEY)) || 1.65);

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

    var spacingBtn = document.getElementById("spacing-toggle");
    if (spacingBtn) {
      spacingBtn.addEventListener("click", function () {
        var current = parseFloat(getComputedStyle(root).getPropertyValue("--prose-leading")) || 1.65;
        var next = current >= 1.95 ? 1.5 : Math.round((current + 0.15) * 100) / 100;
        applyLeading(next);
      });
    }

    var emailBtn = document.querySelector(".email-copy");
    if (emailBtn) {
      emailBtn.addEventListener("click", function () {
        var email = emailBtn.dataset.email || "";
        var showCopied = function () {
          emailBtn.classList.add("copied");
          setTimeout(function () {
            emailBtn.classList.remove("copied");
          }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(email).then(showCopied, showCopied);
        } else {
          var ta = document.createElement("textarea");
          ta.value = email;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch (e) {}
          document.body.removeChild(ta);
          showCopied();
        }
      });
    }

    setupMobileNav();
    setupPfpRing();
  });

  function setupMobileNav() {
    var toggleBtn = document.getElementById("mobile-nav-toggle");
    var asideEl = document.getElementById("site-aside");
    var backdrop = document.getElementById("drawer-backdrop");
    if (!toggleBtn || !asideEl || !backdrop) return;

    function open() {
      asideEl.classList.add("open");
      backdrop.classList.add("visible");
      toggleBtn.setAttribute("aria-expanded", "true");
    }
    function close() {
      asideEl.classList.remove("open");
      backdrop.classList.remove("visible");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", function () {
      if (asideEl.classList.contains("open")) close();
      else open();
    });
    backdrop.addEventListener("click", close);
    asideEl.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });
  }

  // Rotates the small peg around the profile photo from 0°→360° as the reader scrolls
  // from the top to the bottom of the page — a reading-progress indicator.
  function setupPfpRing() {
    var ring = document.querySelector(".pfp-peg-rotator");
    if (!ring) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var ticking = false;
    function update() {
      var y = window.scrollY || window.pageYOffset || 0;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var progress = Math.min(1, Math.max(0, y / max));
      ring.style.transform = "rotate(" + (progress * 360).toFixed(2) + "deg)";
      ticking = false;
    }
    update();
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    });
    window.addEventListener("resize", update);
  }
})();
