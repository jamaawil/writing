(function () {
  var container = document.querySelector(".commentable");
  if (!container) return;

  var pageSlug = container.dataset.page;
  var NAME_KEY = "commenter_name";
  var EMAIL_KEY = "commenter_email";
  var PENDING_KEY = "pending_comments";

  var commentsById = {};
  var rootComments = [];

  // ---------- text-range wrapping ----------
  // Wraps the substring [start, end) of container.textContent in <mark> elements,
  // even though container has nested <p>/<em>/<blockquote> etc, not one flat text
  // node. Two-pass: first collect every text node overlapping the range without
  // mutating, then split/wrap. Splitting the larger offset first keeps the smaller
  // offset valid relative to the original node.
  function wrapTextRange(start, end, markAttrs) {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var offset = 0;
    var hits = [];
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      var nodeStart = offset;
      var nodeEnd = offset + len;
      if (nodeEnd > start && nodeStart < end) {
        hits.push({
          node: node,
          localStart: Math.max(0, start - nodeStart),
          localEnd: Math.min(len, end - nodeStart),
        });
      }
      offset = nodeEnd;
    }

    var marks = [];
    hits.forEach(function (hit) {
      var target = hit.node;
      if (hit.localEnd < target.nodeValue.length) target.splitText(hit.localEnd);
      var matchNode = hit.localStart > 0 ? target.splitText(hit.localStart) : target;
      var mark = document.createElement("mark");
      mark.className = "comment-anchor";
      for (var k in markAttrs) mark.dataset[k] = markAttrs[k];
      matchNode.parentNode.insertBefore(mark, matchNode);
      mark.appendChild(matchNode);
      marks.push(mark);
    });
    return marks;
  }

  // ---------- comment card (quote + thread + reply form) ----------
  function closeAllCards() {
    container.querySelectorAll(".comment-card").forEach(function (el) {
      el.remove();
    });
  }

  function renderThread(comment) {
    var html = '<div class="comment-quote">' + escapeHtml(comment.selection_text) + "</div>";
    function renderOne(c, isReply) {
      return (
        '<div class="comment-entry' +
        (isReply ? " comment-reply" : "") +
        '"><div class="comment-entry-meta">' +
        escapeHtml(c.name) +
        "</div><div class=\"comment-entry-body\">" +
        escapeHtml(c.message) +
        "</div></div>"
      );
    }
    html += renderOne(comment, false);
    (comment.replies || []).forEach(function (r) {
      html += renderOne(r, true);
    });
    (getPendingForPage().filter(function (p) {
      return p.parent_id === comment.id;
    }) || []).forEach(function (p) {
      html += renderOne({ name: p.name, message: p.message }, true) + " (pending…)";
    });
    return html;
  }

  function openCard(comment, anchorMark) {
    closeAllCards();
    var block = anchorMark.closest("p, blockquote, li, h2, h3, h4") || anchorMark.parentElement;
    var card = document.createElement("div");
    card.className = "comment-card";
    card.innerHTML =
      renderThread(comment) +
      '<button type="button" class="comment-reply-btn">Reply</button>' +
      buildFormHtml(true);
    block.insertAdjacentElement("afterend", card);
    suppressNextCardClose = true;
    wireForm(card.querySelector(".comment-form"), { parent_id: comment.id, page_slug: pageSlug });
    card.querySelector(".comment-reply-btn").addEventListener("click", function () {
      card.querySelector(".comment-form").hidden = false;
      this.hidden = true;
    });
  }

  // ---------- rendering approved + own-pending comments ----------
  function getPendingForPage() {
    var all = [];
    try {
      all = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    } catch (e) {}
    return all.filter(function (p) {
      return p.page === pageSlug;
    });
  }

  function renderApproved(comments) {
    rootComments = comments;
    comments.forEach(function (c) {
      commentsById[c.id] = c;
      var marks = wrapTextRange(c.start_pos, c.end_pos, { commentId: String(c.id) });
      marks.forEach(function (mark) {
        mark.addEventListener("click", function () {
          openCard(c, mark);
        });
      });
    });
  }

  function renderOwnPending() {
    getPendingForPage().forEach(function (p) {
      if (p.parent_id) return; // replies render inline inside their parent's thread
      var marks = wrapTextRange(p.start_pos, p.end_pos, {
        commentId: "pending-" + p.id,
        pending: "1",
      });
      marks.forEach(function (mark) {
        mark.classList.add("pending");
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  // ---------- selection capture ----------
  var addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "comment-add-btn";
  addBtn.setAttribute("aria-label", "Add a comment");
  addBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  addBtn.hidden = true;
  document.body.appendChild(addBtn);

  var pendingSelection = null;
  // When addBtn is clicked, it hides itself in mousedown, so the subsequent mouseup
  // retargets to the .commentable element underneath and would call
  // showAddBtnForCurrentSelection — re-showing the button. This flag suppresses that one
  // retargeted mouseup, matching the suppressNextDocClick pattern used for the form panel.
  var suppressNextContainerMouseup = false;
  // Set by the mousedown-dismiss handler so that the subsequent mouseup (which fires
  // on .commentable when clicking within selected text) doesn't re-show the button.
  // Cancelled by mousemove > 5px so a drag-to-select still shows the button.
  var suppressBtnShowAfterClick = false;
  var dismissMouseX = 0, dismissMouseY = 0;

  function getSelectionContext() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    var text = sel.toString().trim();
    if (text.length < 3) return null;
    var range = sel.getRangeAt(0);
    var startEl =
      range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    var endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
    if (!startEl || !endEl) return null;
    if (!startEl.closest(".commentable") || !endEl.closest(".commentable")) return null;
    if (startEl.closest(".commentable") !== endEl.closest(".commentable")) return null;
    if (startEl.closest(".page-comments-section") || endEl.closest(".page-comments-section")) return null;
    // Book highlights are not commentable — only the author's written responses are.
    if (startEl.closest(".highlight-quote, .highlight-claim") || endEl.closest(".highlight-quote, .highlight-claim")) return null;

    var bodyText = container.textContent;
    var startPos = bodyText.indexOf(text);
    if (startPos === -1) return null;
    var endPos = startPos + text.length;
    return { text: text, startPos: startPos, endPos: endPos, range: range.cloneRange() };
  }

  function showAddBtnForCurrentSelection() {
    if (suppressNextContainerMouseup) {
      suppressNextContainerMouseup = false;
      return;
    }
    if (suppressBtnShowAfterClick) {
      suppressBtnShowAfterClick = false;
      return;
    }
    var ctx = getSelectionContext();
    if (!ctx) return;
    pendingSelection = ctx;
    var rect = ctx.range.getBoundingClientRect();
    var btnSize = 36;
    addBtn.style.top = window.scrollY + rect.bottom + 8 + "px";
    addBtn.style.left = window.scrollX + rect.left + rect.width / 2 - btnSize / 2 + "px";
    addBtn.hidden = false;
  }

  // Only mouseup/keyup/touchend on .commentable (real user gestures that end a
  // selection) ever show addBtn. selectionchange itself only ever hides it. This
  // matters because DOM edits elsewhere in .commentable — e.g. wrapTextRange
  // splitting text nodes to insert a freshly-submitted comment's <mark> — can
  // spuriously re-fire selectionchange. If showing the button were wired to that
  // generic event, a mutation unrelated to any real selection gesture could revive
  // a stale selection into a visible button with nothing left to hide it again.
  container.addEventListener("mouseup", showAddBtnForCurrentSelection);
  container.addEventListener("touchend", showAddBtnForCurrentSelection);
  container.addEventListener("keyup", showAddBtnForCurrentSelection);

  document.addEventListener("selectionchange", function () {
    if (!getSelectionContext()) {
      addBtn.hidden = true;
      pendingSelection = null;
    }
  });

  // mousedown fires before selection changes and before mouseup re-shows the button,
  // so it's the most reliable signal that the user has moved on from their selection.
  // suppressBtnShowAfterClick stops the subsequent mouseup (on .commentable) from
  // re-showing the button when clicking within currently-selected text — the browser
  // keeps the selection alive through mousedown in that case.
  // The flag is cancelled by mousemove > 5px so that starting a new drag selection
  // (mousedown then drag) still shows the button when the drag finishes.
  document.addEventListener("mousedown", function (e) {
    if (!addBtn.hidden && e.target !== addBtn && !addBtn.contains(e.target)) {
      addBtn.hidden = true;
      pendingSelection = null;
      suppressBtnShowAfterClick = true;
      dismissMouseX = e.clientX;
      dismissMouseY = e.clientY;
    }
  });

  document.addEventListener("mousemove", function (e) {
    if (suppressBtnShowAfterClick) {
      var dx = e.clientX - dismissMouseX;
      var dy = e.clientY - dismissMouseY;
      if (dx * dx + dy * dy > 25) {
        suppressBtnShowAfterClick = false;
      }
    }
  });

  var INTRO_KEY = "comments_intro_seen";

  function showIntroModal(onContinue) {
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop visible";
    backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;";
    var modal = document.createElement("div");
    modal.className = "modal comment-intro-modal";
    modal.style.cssText = "background:#fafaf8;border:1px solid #e0ddd6;border-radius:8px;padding:1.5rem 1.7rem 1.3rem;max-width:480px;width:92%;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.25);";
    modal.innerHTML =
      "<h3 style='margin:0 0 0.8rem;font-size:1.1rem;'>Commenting on a passage</h3>" +
      "<p style='margin:0 0 0.6rem;font-size:0.9rem;line-height:1.55;'>Select a sentence or phrase anywhere on the page, then click the bubble icon that appears to attach a note to it.</p>" +
      "<p style='margin:0 0 1rem;font-size:0.9rem;line-height:1.55;'>No sign-in needed — just enter your name and email the first time. New comments are reviewed before other readers see them.</p>" +
      '<button type="button" class="modal-continue" style="background:#1a1a1a;color:#fafaf8;border:none;border-radius:4px;padding:0.5rem 1.2rem;font-size:0.85rem;cursor:pointer;">Got it</button>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function dismiss() {
      backdrop.remove();
      localStorage.setItem(INTRO_KEY, "1");
      onContinue();
    }
    modal.querySelector(".modal-continue").addEventListener("click", dismiss);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) dismiss();
    });
  }

  // "LEAVE A COMMENT" cue button → show intro modal or hint
  document.addEventListener("requestCommentIntro", function () {
    if (!localStorage.getItem(INTRO_KEY)) {
      showIntroModal(function () {});
    } else {
      var hint = document.createElement("div");
      hint.textContent = "Select any text on the page to leave a comment.";
      hint.style.cssText = [
        "position:fixed",
        "bottom:1.5rem",
        "left:50%",
        "transform:translateX(-50%) translateY(1rem)",
        "background:#1a1a1a",
        "color:#fafaf8",
        "font-size:0.8rem",
        "padding:0.55rem 1.1rem",
        "border-radius:99px",
        "white-space:nowrap",
        "opacity:0",
        "transition:opacity 0.2s,transform 0.2s",
        "z-index:1100",
        "pointer-events:none",
        "font-family:system-ui,sans-serif",
      ].join(";");
      document.body.appendChild(hint);
      requestAnimationFrame(function () {
        hint.style.opacity = "1";
        hint.style.transform = "translateX(-50%) translateY(0)";
      });
      setTimeout(function () {
        hint.style.opacity = "0";
        hint.style.transform = "translateX(-50%) translateY(1rem)";
        setTimeout(function () { hint.remove(); }, 300);
      }, 3000);
    }
  });

  addBtn.addEventListener("mousedown", function (e) {
    // mousedown (not click) so it fires before selectionchange clears the selection
    e.preventDefault();
    if (!pendingSelection) return;
    var ctx = pendingSelection;
    addBtn.hidden = true;
    pendingSelection = null;
    suppressNextContainerMouseup = true;
    // We've captured everything we need from the live selection into ctx — clear it
    // now rather than leaving it dangling. Otherwise, later DOM edits inside
    // .commentable (wrapTextRange splitting text nodes when rendering the new
    // comment) can re-trigger selectionchange against this now-stale selection,
    // which makes addBtn reappear with nothing left to hide it again until a reload.
    if (window.getSelection) window.getSelection().removeAllRanges();
    if (!localStorage.getItem(INTRO_KEY)) {
      showIntroModal(function () {
        openNewCommentForm(ctx);
      });
    } else {
      openNewCommentForm(ctx);
    }
  });

  // ---------- comment form (new highlight or reply) ----------
  function buildFormHtml(isReply) {
    return (
      '<form class="comment-form"' +
      (isReply ? " hidden" : "") +
      '>' +
      '<input type="text" name="website" class="comment-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<input type="text" name="name" placeholder="Name" required>' +
      '<input type="email" name="email" placeholder="Email (not shown publicly)" required>' +
      '<textarea name="message" placeholder="Comment" required></textarea>' +
      '<div class="comment-form-actions"><button type="button" class="comment-cancel">Cancel</button><button type="submit">Submit</button></div>' +
      '<div class="comment-form-error" hidden></div>' +
      "</form>"
    );
  }

  function wireForm(form, fixedFields) {
    if (!form) return;
    var nameInput = form.querySelector('[name="name"]');
    var emailInput = form.querySelector('[name="email"]');
    nameInput.value = localStorage.getItem(NAME_KEY) || "";
    emailInput.value = localStorage.getItem(EMAIL_KEY) || "";

    form.querySelector(".comment-cancel").addEventListener("click", function () {
      var card = form.closest(".comment-card, .comment-form-panel");
      if (card) card.remove();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errorEl = form.querySelector(".comment-form-error");
      errorEl.hidden = true;
      var payload = Object.assign(
        {
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          message: form.querySelector('[name="message"]').value.trim(),
          website: form.querySelector(".comment-honeypot").value,
        },
        fixedFields
      );
      fetch("/api/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "submission failed");
            return data;
          });
        })
        .then(function (data) {
          localStorage.setItem(NAME_KEY, payload.name);
          localStorage.setItem(EMAIL_KEY, payload.email);
          var pending = [];
          try {
            pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
          } catch (e) {}
          pending.push({
            id: data.id,
            page: pageSlug,
            name: payload.name,
            message: payload.message,
            selection_text: payload.selection_text,
            start_pos: payload.start_pos,
            end_pos: payload.end_pos,
            parent_id: payload.parent_id || null,
            submitted_at: data.submitted_at,
          });
          localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

          if (payload.parent_id) {
            // Reply: just re-render the open card's thread in place. Object keys are
            // always strings, so this lookup works regardless of whether parent_id
            // came back from the API as a number or a string.
            var rootComment = commentsById[payload.parent_id];
            var rootMark = container.querySelector('mark[data-comment-id="' + payload.parent_id + '"]');
            if (rootComment && rootMark) openCard(rootComment, rootMark);
          } else {
            closeFloatingForm();
            addBtn.hidden = true;
            pendingSelection = null;
            if (window.getSelection) window.getSelection().removeAllRanges();
            wrapTextRange(payload.start_pos, payload.end_pos, {
              commentId: "pending-" + data.id,
              pending: "1",
            }).forEach(function (mark) {
              mark.classList.add("pending");
            });
            renderCommentSection();
          }
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        });
    });
  }

  var floatingPanel = null;
  // Hiding addBtn on mousedown (below) changes what's under the cursor by the time the
  // browser's own "click" event does its hit-testing on mouseup, so e.target for that
  // click can no longer be trusted to equal addBtn. Suppressing the very next document
  // click after opening — regardless of what it resolves to — sidesteps that race
  // entirely instead of trying to out-guess the retargeted event.
  var suppressNextDocClick = false;
  // openCard is triggered by a click; without this flag the same click event would
  // bubble to the document handler and immediately close the card it just opened.
  var suppressNextCardClose = false;
  function closeFloatingForm() {
    if (floatingPanel) {
      floatingPanel.remove();
      floatingPanel = null;
    }
  }

  function openNewCommentForm(ctx) {
    closeFloatingForm();
    closeAllCards();
    var panel = document.createElement("div");
    panel.className = "comment-form-panel";
    panel.innerHTML =
      '<div class="comment-quote">' + escapeHtml(ctx.text) + "</div>" + buildFormHtml(false);
    var rect = ctx.range.getBoundingClientRect();
    // Sits below the comment-add button (which itself sits at rect.bottom + 8, ~36px tall).
    panel.style.top = window.scrollY + rect.bottom + 8 + 44 + "px";
    panel.style.left = window.scrollX + rect.left + "px";
    document.body.appendChild(panel);
    floatingPanel = panel;
    suppressNextDocClick = true;
    wireForm(panel.querySelector(".comment-form"), {
      page_slug: pageSlug,
      selection_text: ctx.text,
      start_pos: ctx.startPos,
      end_pos: ctx.endPos,
    });
  }

  document.addEventListener("click", function (e) {
    // Read card-suppress flag before any early return so it's always consumed.
    var skipCardClose = suppressNextCardClose;
    suppressNextCardClose = false;

    if (suppressNextDocClick) {
      suppressNextDocClick = false;
      return;
    }
    if (floatingPanel && !floatingPanel.contains(e.target) && e.target !== addBtn) {
      closeFloatingForm();
    }
    if (!skipCardClose) {
      container.querySelectorAll(".comment-card").forEach(function (card) {
        if (!card.contains(e.target)) card.remove();
      });
    }
  });

  // ---------- bottom comment list ----------
  function renderCommentSection() {
    var prev = document.querySelector(".page-comments-section");
    if (prev) prev.remove();

    var approved = rootComments;
    var pending = getPendingForPage().filter(function (p) { return !p.parent_id; });
    if (approved.length === 0 && pending.length === 0) return;

    var section = document.createElement("section");
    section.className = "page-comments-section";

    var heading = document.createElement("h4");
    heading.className = "pcs-heading";
    heading.textContent = "Comments";
    section.appendChild(heading);

    function buildItem(name, isPending, selText, message, commentObj) {
      var item = document.createElement("div");
      item.className = "pcs-item";

      var meta = document.createElement("div");
      meta.className = "pcs-meta";
      if (isPending) {
        meta.innerHTML = escapeHtml(name) +
          ' <span class="pcs-sep">·</span>' +
          ' <span class="pcs-status">pending…</span>';
      } else {
        meta.textContent = name;
      }
      item.appendChild(meta);

      if (selText) {
        var quote = document.createElement("div");
        quote.className = "pcs-quote";
        quote.textContent = "“" + selText + "”";
        item.appendChild(quote);
      }

      var body = document.createElement("div");
      body.className = "pcs-body";
      body.textContent = message;
      item.appendChild(body);

      if (commentObj) {
        (commentObj.replies || []).forEach(function (r) {
          var ri = document.createElement("div");
          ri.className = "pcs-reply-item";
          var rm = document.createElement("div");
          rm.className = "pcs-meta";
          rm.textContent = r.name;
          var rb = document.createElement("div");
          rb.className = "pcs-body";
          rb.textContent = r.message;
          ri.appendChild(rm);
          ri.appendChild(rb);
          item.appendChild(ri);
        });
        getPendingForPage().filter(function (p) {
          return p.parent_id === commentObj.id;
        }).forEach(function (p) {
          var ri = document.createElement("div");
          ri.className = "pcs-reply-item";
          var rm = document.createElement("div");
          rm.className = "pcs-meta";
          rm.innerHTML = escapeHtml(p.name) +
            ' <span class="pcs-sep">·</span>' +
            ' <span class="pcs-status">pending…</span>';
          var rb = document.createElement("div");
          rb.className = "pcs-body";
          rb.textContent = p.message;
          ri.appendChild(rm);
          ri.appendChild(rb);
          item.appendChild(ri);
        });

        var replyBtn = document.createElement("button");
        replyBtn.className = "pcs-reply-btn";
        replyBtn.textContent = "Reply";
        replyBtn.addEventListener("click", function () {
          var mark = container.querySelector('mark[data-comment-id="' + commentObj.id + '"]');
          if (mark) {
            mark.scrollIntoView({ behavior: "smooth", block: "center" });
            openCard(commentObj, mark);
          }
        });
        item.appendChild(replyBtn);
      }

      return item;
    }

    approved.forEach(function (c) {
      section.appendChild(buildItem(c.name, false, c.selection_text, c.message, c));
    });
    pending.forEach(function (p) {
      section.appendChild(buildItem(p.name, true, p.selection_text, p.message, null));
    });

    container.insertAdjacentElement("afterend", section);
  }

  // ---------- load ----------
  fetch("/api/comments?page=" + encodeURIComponent(pageSlug))
    .then(function (res) {
      return res.ok ? res.json() : { comments: [] };
    })
    .then(function (data) {
      renderApproved(data.comments || []);
      renderOwnPending();
      renderCommentSection();
    })
    .catch(function () {
      renderOwnPending();
      renderCommentSection();
    });
})();
