(function () {
  // remark-gfm renders footnote refs as <a data-footnote-ref href="#fn-id"> and the
  // note body as <li id="fn-id"> inside a <section data-footnotes>. This intercepts
  // clicks on the ref and shows the note in a small popup near the click point instead
  // of jumping to the bottom of the page — progressive enhancement only: with JS
  // disabled, the normal jump-to-footnote behavior still works.
  var refs = document.querySelectorAll("a[data-footnote-ref]");
  if (!refs.length) return;

  var footnotesSection = document.querySelector("section[data-footnotes]");
  if (footnotesSection) footnotesSection.style.display = "none";

  var popup = null;
  function closePopup() {
    if (popup) {
      popup.remove();
      popup = null;
    }
  }

  function openPopup(ref) {
    var id = (ref.getAttribute("href") || "").slice(1);
    var note = id && document.getElementById(id);
    if (!note) return;

    closePopup();
    var clone = note.cloneNode(true);
    var backref = clone.querySelector("[data-footnote-backref]");
    if (backref) backref.remove();

    popup = document.createElement("div");
    popup.className = "footnote-popup";
    popup.innerHTML = clone.innerHTML;
    document.body.appendChild(popup);

    var rect = ref.getBoundingClientRect();
    popup.style.top = window.scrollY + rect.bottom + 6 + "px";
    popup.style.left = window.scrollX + rect.left + "px";

    requestAnimationFrame(function () {
      var pRect = popup.getBoundingClientRect();
      if (pRect.right > window.innerWidth - 12) {
        popup.style.left = Math.max(12, window.innerWidth - pRect.width - 12) + "px";
      }
    });
  }

  document.addEventListener("click", function (e) {
    var ref = e.target.closest("a[data-footnote-ref]");
    if (ref) {
      e.preventDefault();
      openPopup(ref);
      return;
    }
    if (popup && !popup.contains(e.target)) closePopup();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePopup();
  });
})();
