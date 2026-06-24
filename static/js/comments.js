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

  // ---------- highlight card (quote + thread + reply form) ----------
  function closeAllCards() {
    container.querySelectorAll(".highlight-card").forEach(function (el) {
      el.remove();
    });
  }

  function renderThread(comment) {
    var html = '<div class="highlight-quote">' + escapeHtml(comment.selection_text) + "</div>";
    function renderOne(c, isReply) {
      return (
        '<div class="highlight-comment' +
        (isReply ? " highlight-reply" : "") +
        '"><div class="highlight-comment-meta">' +
        escapeHtml(c.name) +
        "</div><div class=\"highlight-comment-body\">" +
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
    card.className = "highlight-card";
    card.innerHTML =
      renderThread(comment) +
      '<button type="button" class="highlight-reply-btn">Reply</button>' +
      buildFormHtml(true);
    block.insertAdjacentElement("afterend", card);
    wireForm(card.querySelector(".comment-form"), { parent_id: comment.id, page_slug: pageSlug });
    card.querySelector(".highlight-reply-btn").addEventListener("click", function () {
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

    var bodyText = container.textContent;
    var startPos = bodyText.indexOf(text);
    if (startPos === -1) return null;
    var endPos = startPos + text.length;
    return { text: text, startPos: startPos, endPos: endPos, range: range.cloneRange() };
  }

  document.addEventListener("selectionchange", function () {
    var ctx = getSelectionContext();
    if (!ctx) {
      addBtn.hidden = true;
      pendingSelection = null;
      return;
    }
    pendingSelection = ctx;
    var rect = ctx.range.getBoundingClientRect();
    var btnSize = 36;
    addBtn.style.top = window.scrollY + rect.bottom + 8 + "px";
    addBtn.style.left = window.scrollX + rect.left + rect.width / 2 - btnSize / 2 + "px";
    addBtn.hidden = false;
  });

  var INTRO_KEY = "comments_intro_seen";

  function showIntroModal(onContinue) {
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    var modal = document.createElement("div");
    modal.className = "modal comment-intro-modal";
    modal.innerHTML =
      "<h3>Commenting on a passage</h3>" +
      "<p>Select a sentence or phrase anywhere on the page, then click the bubble icon that appears to attach a note to it.</p>" +
      "<p>No sign-in needed — just enter your name and email the first time. New comments are reviewed before other readers see them.</p>" +
      '<button type="button" class="modal-continue">Got it</button>';
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

  addBtn.addEventListener("mousedown", function (e) {
    // mousedown (not click) so it fires before selectionchange clears the selection
    e.preventDefault();
    if (!pendingSelection) return;
    var ctx = pendingSelection;
    addBtn.hidden = true;
    pendingSelection = null;
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
      var card = form.closest(".highlight-card, .comment-form-panel");
      if (card && card.classList.contains("comment-form-panel")) card.remove();
      else form.hidden = true;
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
            if (window.getSelection) window.getSelection().removeAllRanges();
            wrapTextRange(payload.start_pos, payload.end_pos, {
              commentId: "pending-" + data.id,
              pending: "1",
            }).forEach(function (mark) {
              mark.classList.add("pending");
            });
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
      '<div class="highlight-quote">' + escapeHtml(ctx.text) + "</div>" + buildFormHtml(false);
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
    if (suppressNextDocClick) {
      suppressNextDocClick = false;
      return;
    }
    if (floatingPanel && !floatingPanel.contains(e.target) && e.target !== addBtn) {
      closeFloatingForm();
    }
  });

  // ---------- load ----------
  fetch("/api/comments?page=" + encodeURIComponent(pageSlug))
    .then(function (res) {
      return res.ok ? res.json() : { comments: [] };
    })
    .then(function (data) {
      renderApproved(data.comments || []);
      renderOwnPending();
    })
    .catch(function () {
      renderOwnPending();
    });
})();
