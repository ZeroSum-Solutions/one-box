/**
 * Safe Edit-mode overlay. Injected only for ?edit=1; View receives the
 * untouched site. Edit mode consumes every navigation/form action, exposes
 * keyboard selection, and sends data-only element state to its opaque parent.
 */
(function () {
  "use strict";

  // Idempotent-injection guard. In normal operation the parent remounts the
  // iframe element itself on every edit (a fresh `key` in
  // src/app/preview/[id]/page.tsx), so this script only ever runs once per
  // real window/document -- but nothing here enforces that other than this
  // check, and a second injection into the SAME window (a future caller that
  // patches the DOM in place instead of remounting, or a stray duplicate
  // <script> tag) would otherwise register every listener below a second
  // time and leave two floating badges fighting each other. Bail out before
  // any state or listener exists rather than trying to reconcile duplicates
  // after the fact.
  if (window.__oneboxOverlayInstalled) return;
  window.__oneboxOverlayInstalled = true;

  var STYLE_ID = "onebox-overlay-style";
  var BADGE_ID = "onebox-container-badge";
  var hoverEl = null;
  // Layers/Navigator tree-driven highlight (canvas-upgrade Wave 5, Play 6),
  // deliberately a SEPARATE slot from hoverEl (real pointer hover) -- the
  // two must never fight. Each has its own attribute/CSS rule, so a tree
  // row hover and a genuine cursor hover over two different elements render
  // independently and correctly at once, and clearing one never touches
  // the other's element or state.
  var treeHoverEl = null;
  var selectedEl = null;
  var editingEl = null;
  var originalMarkup = "";
  var originalText = "";
  var previousFocus = null;
  var containerBadgeEl = null;
  // Select-Parent Escalation (canvas-upgrade A3, Play 3): editIds climbed
  // FROM, most recent last, so "back" can unwind them one at a time. Reset
  // at every fresh (non-climb) selection -- see selectElement's
  // preserveClimbStack gate -- so it only ever means "undo my last climb,"
  // never "revisit some unrelated earlier selection."
  var climbStack = [];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "[data-onebox-hover]{outline:2px dashed #00bae2 !important;outline-offset:2px !important;cursor:pointer !important;}" +
      "[data-onebox-selected]{outline:2px solid #00bae2 !important;outline-offset:2px !important;}" +
      // Container role gets its own color, width and offset on BOTH hover
      // and selected states so a selected section never reads as "a bigger
      // version of the same leaf outline" -- it is a visibly different
      // affordance, matched to the role badge below. The dashed-on-hover /
      // solid-on-selected convention is kept so state (hover vs. selected)
      // still reads the same way it does for leaves; only the role (leaf
      // vs. container) changes color/geometry.
      //
      // Color choice: this overlay is injected into the CLIENT's generated
      // site, not the app chrome, so DESIGN.md's Midnight Instrument
      // contract does not generally govern it -- the rest of this palette
      // (#00bae2 hover, #0ae448 editing, #ff8709 drag) predates DESIGN.md
      // and is out of scope here. But #8b5cf6 below is DESIGN.md's own
      // accent-lavender, deliberately reused rather than minting a third
      // undocumented purple: DESIGN.md documents lavender's role as
      // "secondary tag fills, category indicators" -- exactly what this
      // badge is (it names a container's role/category). Iris (#6366f1,
      // the sibling violet) is reserved there for research/reference chips,
      // a different role, so it is not the right pick even though it is
      // also already documented.
      "[data-onebox-hover][data-onebox-role='container']{outline:2px dashed #8b5cf6 !important;outline-offset:6px !important;}" +
      "[data-onebox-selected][data-onebox-role='container']{outline:3px solid #8b5cf6 !important;outline-offset:6px !important;box-shadow:0 0 0 6px rgba(139,92,246,.16) !important;}" +
      // Solid, not dashed, and its own attribute -- deliberately distinct
      // from the dashed pointer-hover outline above so a highlight that
      // came from hovering a Layers tree row never reads as "your cursor is
      // here" when it plainly isn't (canvas-upgrade Wave 5, Play 6c).
      "[data-onebox-tree-hover]{outline:2px solid #00bae2 !important;outline-offset:2px !important;}" +
      "[data-onebox-editing]{outline:2px solid #0ae448 !important;outline-offset:3px !important;cursor:text !important;}" +
      "[data-onebox-dragging]{outline:3px solid #ff8709 !important;opacity:.72 !important;cursor:grabbing !important;}" +
      "[data-onebox-drop-target]{outline:3px dashed #ff8709 !important;outline-offset:4px !important;}" +
      "[data-onebox-unsupported]{outline-color:#ff8709 !important;}" +
      "#" + BADGE_ID + "{display:none;position:fixed;z-index:2147483647;pointer-events:none;" +
      "font:700 10px/1 ui-monospace,'SF Mono',Menlo,monospace;letter-spacing:.06em;color:#fff;" +
      "background:#8b5cf6;padding:2px 6px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.35);}" +
      "#" + BADGE_ID + "[data-state='hover']{opacity:.85;}";
    document.head.appendChild(style);
  }

  // Floating role badge for the currently active container (selected takes
  // priority over hover). Positioned via getBoundingClientRect() against a
  // detached body-level node rather than a pseudo-element on the target
  // itself, so it never touches the target's own `position`/layout -- a
  // section's internal absolutely-positioned children (if any) keep
  // whatever containing block they already had.
  function ensureContainerBadge() {
    if (containerBadgeEl && containerBadgeEl.isConnected) return containerBadgeEl;
    // Reuse a badge node already in the document (e.g. left behind by the
    // top-level re-injection guard covering an install this closure did not
    // make) rather than creating a second node under the same id.
    var existing = document.getElementById(BADGE_ID);
    if (existing) {
      containerBadgeEl = existing;
      return containerBadgeEl;
    }
    containerBadgeEl = document.createElement("div");
    containerBadgeEl.id = BADGE_ID;
    containerBadgeEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(containerBadgeEl);
    return containerBadgeEl;
  }

  // The badge shows a role label, not a raw tag name -- nav's root element
  // is a <header> for landmark semantics, but the design language for this
  // section is "NAV" (matching the SECTION.id it edits), not "HEADER".
  // Every other container's tag name already reads correctly as its label
  // (SECTION, FOOTER), so this only needs to special-case the one mismatch.
  function labelForContainer(el) {
    if (el.getAttribute("data-edit-id") === "nav") return "NAV";
    return el.tagName ? el.tagName.toUpperCase() : "SECTION";
  }

  function activeContainerTarget() {
    if (selectedEl && behaviorFor(selectedEl) === "container")
      return { el: selectedEl, state: "selected" };
    if (hoverEl && behaviorFor(hoverEl) === "container")
      return { el: hoverEl, state: "hover" };
    return null;
  }

  // hoverEl and selectedEl can be the SAME node (pointer resting over the
  // element it just selected). data-onebox-role must only come off when
  // neither role still applies -- otherwise clearing hover on a
  // still-selected container (or clearing selection on a still-hovered one)
  // would strip the container styling out from under the state that is
  // still active.
  function refreshRole(el) {
    if (!el) return;
    if ((el === hoverEl || el === selectedEl) && behaviorFor(el) === "container") {
      el.setAttribute("data-onebox-role", "container");
    } else {
      el.removeAttribute("data-onebox-role");
    }
  }

  function syncContainerBadge() {
    var active = activeContainerTarget();
    if (!active) {
      if (containerBadgeEl) containerBadgeEl.style.display = "none";
      return;
    }
    var badge = ensureContainerBadge();
    var rect = active.el.getBoundingClientRect();
    var viewportH = window.innerHeight || document.documentElement.clientHeight;
    var viewportW = window.innerWidth || document.documentElement.clientWidth;
    // Nothing of the target is on screen -- no edge to sit near, so don't
    // float a badge over empty space with no visible anchor.
    if (rect.bottom < 0 || rect.top > viewportH) {
      badge.style.display = "none";
      return;
    }
    badge.textContent = labelForContainer(active.el);
    badge.setAttribute("data-state", active.state);
    badge.style.display = "block";
    // Sit just above the outline when there's room; otherwise clamp fully
    // inside the viewport instead of letting it run off-screen. Most
    // template sections are taller than the preview viewport (hero,
    // service-area, reviews, why-us all exceed a ~780px canvas), so "top
    // edge scrolled above the frame while the section is still selected" is
    // the ordinary case, not an edge case -- the badge must stay readable
    // through it.
    var desiredTop = rect.top > 24 ? rect.top - 20 : rect.top + 8;
    badge.style.top = Math.min(Math.max(desiredTop, 4), viewportH - 22) + "px";
    badge.style.left = Math.min(Math.max(rect.left, 4), viewportW - 60) + "px";
  }

  // Scroll fires far more often than the badge's position needs to update;
  // coalesce a scroll/resize burst into one recompute per animation frame
  // rather than one DOM read+write per event.
  var badgeSyncScheduled = false;
  function scheduleBadgeSync() {
    if (badgeSyncScheduled) return;
    badgeSyncScheduled = true;
    window.requestAnimationFrame(function () {
      badgeSyncScheduled = false;
      syncContainerBadge();
    });
  }

  function nearestEditable(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute("data-edit-id")) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Ancestor editIds for el, closest first, terminating at document.body
  // (nearestEditable's own boundary). Powers PreviewSelection.parentChain
  // (canvas-upgrade A3, Play 9) -- every entry is itself a real
  // [data-edit-id] element, never a synthesized label.
  function ancestorChain(el) {
    var chain = [];
    var node = nearestEditable(el.parentElement);
    while (node) {
      chain.push(node.getAttribute("data-edit-id"));
      node = nearestEditable(node.parentElement);
    }
    return chain;
  }

  function behaviorFor(el) {
    // Checked first, ahead of every other branch: an element that itself
    // holds other [data-edit-id] nodes is structurally a container, and that
    // has to win regardless of its own tag. Letting a <section> or <a> that
    // wraps editable children register as "interactive"/"text"/"safe-overlay"
    // instead would offer direct text-edit or plain click-through on a node
    // whose real job is to scope its children — the direct-edit path in
    // particular would silently orphan the descendants' edit ids on save.
    // No element in the current template is both container and
    // interactive/text at once, so this ordering is a safety net today, but
    // it is the deliberate rule going forward.
    if (el.querySelector("[data-edit-id]")) return "container";
    if (
      el.matches("a,button,input,select,textarea,[role='button'],[role='link']")
    )
      return "interactive";
    if (
      el.matches("h1,h2,h3,h4,h5,h6,p,span,li,label,small,strong,em,blockquote")
    )
      return "text";
    if (
      el.matches("canvas,video,audio,iframe,svg,picture,img") ||
      el.querySelector("canvas,video,audio,iframe,svg,picture,img")
    )
      return "safe-overlay";
    if (el.tagName && el.tagName.indexOf("-") !== -1) return "unsupported";
    return "safe-overlay";
  }

  // canvas-upgrade Wave 5, Play 7. Whether Move earlier/later actually has a
  // valid target -- mirrors elementEditor.ts's own moveEditableSibling()
  // refusal rules (fixed page chrome under <body> can never move; an
  // element with no editable sibling in that direction can't either) so the
  // workbench can disable a control that is guaranteed to fail, instead of
  // letting the click round-trip to the server just to learn that.
  // previousElementSibling/nextElementSibling are native DOM, so -- like
  // cheerio's prev()/next() on the server -- they skip whitespace text
  // nodes and land on the next real element or null.
  function moveTargets(el) {
    if (el.parentElement && el.parentElement.tagName === "BODY") {
      return { earlier: false, later: false };
    }
    var prev = el.previousElementSibling;
    var next = el.nextElementSibling;
    return {
      earlier: Boolean(prev && prev.hasAttribute("data-edit-id")),
      later: Boolean(next && next.hasAttribute("data-edit-id")),
    };
  }

  function selectionFor(el) {
    var state = {
      editId: el.getAttribute("data-edit-id") || "",
      tag: el.tagName ? el.tagName.toLowerCase() : "",
      text: (el.innerText || el.textContent || "").slice(0, 4000),
      behavior: behaviorFor(el),
      moveTargets: moveTargets(el),
    };
    var chain = ancestorChain(el);
    if (chain.length) state.parentChain = chain;
    if (el.matches("img,picture") || el.querySelector("img"))
      state.assetKind = "image";
    if (el.matches("a")) state.href = el.getAttribute("href") || "";
    if (el.matches("button")) {
      var explicitType = el.hasAttribute("type");
      var semanticType =
        el.getAttribute("data-onebox-action") ||
        ((el.getAttribute("type") || "submit").toLowerCase() === "submit"
          ? "submit"
          : "none");
      state.buttonAction = {
        type: semanticType,
        target: el.getAttribute("data-onebox-target") || undefined,
        explicit: el.hasAttribute("data-onebox-action") || explicitType,
      };
    }
    var declarations = {};
    (el.getAttribute("style") || "").split(";").forEach(function (part) {
      var colon = part.indexOf(":");
      if (colon < 0) return;
      declarations[part.slice(0, colon).trim().toLowerCase()] = part
        .slice(colon + 1)
        .trim();
    });
    var reverse = function (value, table) {
      return Object.keys(table).find(function (key) {
        return table[key] === value;
      });
    };
    state.typography = {};
    var family = reverse(declarations["font-family"], {
      display: "var(--font-display)",
      body: "var(--font-body)",
    });
    var size = reverse(declarations["font-size"], {
      caption: "var(--text-caption)",
      "body-sm": "var(--text-body-sm)",
      body: "var(--text-body)",
      "body-lg": "var(--text-body-lg)",
      "heading-sm": "var(--text-heading-sm)",
      heading: "var(--text-heading)",
      "heading-lg": "var(--text-heading-lg)",
      display: "var(--text-display)",
    });
    var color = reverse(declarations.color, {
      text: "var(--color-text)",
      muted: "var(--color-text-muted)",
      primary: "var(--color-primary-text)",
      accent: "var(--color-accent)",
    });
    if (family) state.typography.fontFamily = family;
    if (size) state.typography.fontSize = size;
    if (["400", "600", "700"].indexOf(declarations["font-weight"]) >= 0)
      state.typography.weight = declarations["font-weight"];
    if (color) state.typography.color = color;
    if (["left", "center", "right"].indexOf(declarations["text-align"]) >= 0)
      state.typography.alignment = declarations["text-align"];
    if (el === editingEl) state.originalText = originalText;
    return state;
  }

  function postState(state, el, reason) {
    try {
      var selection = el ? selectionFor(el) : null;
      parent.postMessage(
        {
          type: "onebox-editor-state",
          state: state,
          selection: selection,
          reason: reason || undefined,
          canStepBack: climbStack.length > 0,
        },
        "*",
      );
    } catch {
      /* Opaque-origin edge case: safely drop the message. */
    }
  }

  function clearHover() {
    if (!hoverEl) return;
    var prev = hoverEl;
    prev.removeAttribute("data-onebox-hover");
    hoverEl = null;
    refreshRole(prev);
    syncContainerBadge();
  }

  // Layers/Navigator tree-driven highlight (canvas-upgrade Wave 5, Play 6c).
  // editId undefined/invalid clears it -- covers both the row's own
  // mouse-out and the panel unmounting (tool switch, selection change)
  // without a matching mouse-out ever firing.
  function setTreeHover(editId) {
    if (treeHoverEl) {
      treeHoverEl.removeAttribute("data-onebox-tree-hover");
      treeHoverEl = null;
    }
    if (typeof editId !== "string") return;
    var el = document.querySelector('[data-edit-id="' + editId + '"]');
    if (!el) return;
    treeHoverEl = el;
    el.setAttribute("data-onebox-tree-hover", "");
  }

  function restoreFocus(el) {
    if (
      previousFocus &&
      previousFocus.isConnected &&
      previousFocus !== document.body
    ) {
      previousFocus.focus({ preventScroll: true });
      previousFocus = null;
      return;
    }
    previousFocus = null;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }

  function finishTextEditing(cancel, shouldRestoreFocus) {
    if (!editingEl) return;
    var el = editingEl;
    if (cancel) el.innerHTML = originalMarkup;
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-onebox-editing");
    editingEl = null;
    originalMarkup = "";
    originalText = "";
    postState("selected", el);
    if (shouldRestoreFocus) restoreFocus(el);
    else previousFocus = null;
  }

  function clearSelection(cancelDraft) {
    clearDragState();
    if (editingEl) finishTextEditing(cancelDraft !== false, false);
    if (!selectedEl) return;
    var prev = selectedEl;
    prev.removeAttribute("data-onebox-selected");
    prev.removeAttribute("data-onebox-unsupported");
    selectedEl = null;
    refreshRole(prev);
    syncContainerBadge();
  }

  function selectElement(target, opts) {
    // Every ordinary (fresh) selection -- a click, a keyboard Enter/Space, a
    // breadcrumb select-by-id jump, an Alt+Arrow move-target mark -- resets
    // the climb history: "back" must only ever undo the immediately
    // preceding climb, never resurface an unrelated earlier selection. Only
    // climbToParent()/stepBackFromClimb() pass preserveClimbStack.
    if (!(opts && opts.preserveClimbStack)) climbStack = [];
    var behavior = behaviorFor(target);
    if (selectedEl !== target) {
      clearSelection(true);
      selectedEl = target;
      target.setAttribute("data-onebox-selected", "");
    }
    refreshRole(target);
    syncContainerBadge();
    if (behavior === "unsupported") {
      target.setAttribute("data-onebox-unsupported", "");
      postState(
        "unsupported",
        target,
        "This custom interactive element has no safe in-place editor.",
      );
      return behavior;
    }
    postState("selected", target);
    return behavior;
  }

  // Select-Parent Escalation (canvas-upgrade A3, Play 3). Climbs from the
  // current selection to the nearest ancestor carrying its own
  // data-edit-id -- typically the enclosing section. Two entry points share
  // this: the plain ArrowUp key (onKeyDown) and the workbench's pointer-only
  // "Select parent" control (onParentMessage's select-parent command) -- the
  // spec's requirement that the keyboard and pointer routes agree.
  // `viaCommand` distinguishes them for exactly one behavior: the pointer
  // route is a deliberate, explicit action and may interrupt an
  // in-progress in-place edit (cancelling the draft, same as Escape); the
  // bare ArrowUp key must not, since inside a contenteditable region
  // ArrowUp is the caret's own "move up a line" and stealing it would break
  // shipped text editing.
  function climbToParent(opts) {
    var viaCommand = Boolean(opts && opts.viaCommand);
    if (!selectedEl) return false;
    if (editingEl) {
      if (!viaCommand) return false;
      finishTextEditing(true, false);
    }
    // Climbing past the top of the tree: no ancestor to land on, so do
    // nothing visible rather than clearing the selection out from under the
    // user.
    var next = nearestEditable(selectedEl.parentElement);
    if (!next) return false;
    climbStack.push(selectedEl.getAttribute("data-edit-id"));
    selectElement(next, { preserveClimbStack: true });
    return true;
  }

  // The reverse of climbToParent: pops the single most recent climb and
  // reselects the node it climbed FROM. A stack (not one slot) so repeated
  // climbs -- select a leaf, climb twice -- still unwind one level at a
  // time.
  function stepBackFromClimb() {
    if (!climbStack.length) return false;
    var editId = climbStack[climbStack.length - 1];
    var el = document.querySelector('[data-edit-id="' + editId + '"]');
    // The node the stack points at can vanish (edit, reorder, external
    // mutation) between the climb and the step-back; drop the stale entry
    // rather than leaving a "Back" control that goes nowhere.
    climbStack.pop();
    if (!el) return false;
    selectElement(el, { preserveClimbStack: true });
    return true;
  }

  function placeCaretAtEnd(el) {
    var selection = window.getSelection && window.getSelection();
    if (!selection) return;
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function beginTextEditing(target) {
    if (editingEl === target) return;
    if (editingEl) finishTextEditing(true, false);
    previousFocus = document.activeElement;
    editingEl = target;
    originalMarkup = target.innerHTML;
    originalText = target.innerText || target.textContent || "";
    target.setAttribute("contenteditable", "plaintext-only");
    target.setAttribute("data-onebox-editing", "");
    target.focus({ preventScroll: true });
    placeCaretAtEnd(target);
    postState("text-editing", target);
  }

  function onPointerOver(event) {
    var target = nearestEditable(event.target);
    if (target === hoverEl) return;
    clearHover();
    if (target) {
      target.setAttribute("data-onebox-hover", "");
      hoverEl = target;
      refreshRole(target);
      syncContainerBadge();
    }
  }

  function onPointerOut(event) {
    if (
      hoverEl &&
      (!event.relatedTarget || !hoverEl.contains(event.relatedTarget))
    )
      clearHover();
  }

  function consumesAction(node) {
    return Boolean(
      node &&
      node.closest &&
      node.closest(
        "a,button,input[type='submit'],input[type='image'],[role='link'],[role='button']",
      ),
    );
  }

  function isFormControl(node) {
    return Boolean(
      node && node.closest && node.closest("input,select,textarea,form"),
    );
  }

  function onClick(event) {
    var target = nearestEditable(event.target);
    if (target && editingEl === target) {
      event.stopImmediatePropagation();
      return;
    }
    if (target || consumesAction(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (!target) return;
    var behavior = selectElement(target);
    if (behavior === "text") beginTextEditing(target);
  }

  function blockGeneratedAction(event) {
    var editable = nearestEditable(event.target);
    var control = consumesAction(event.target) || isFormControl(event.target);
    if (!editable && !control) return;
    if (event.type === "input" && editable === editingEl) return;
    if (
      editable &&
      editable.draggable &&
      !control &&
      (event.type === "pointerdown" ||
        event.type === "mousedown" ||
        event.type === "touchstart")
    ) {
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onInput(event) {
    if (editingEl && event.target === editingEl)
      postState("text-editing", editingEl);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (editingEl) finishTextEditing(true, true);
      else if (selectedEl) {
        clearSelection(true);
        climbStack = [];
        postState("idle", null);
      }
      return;
    }
    if (
      editingEl &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishTextEditing(false, true);
      return;
    }
    // Select-Parent Escalation (canvas-upgrade A3, Play 3). Plain Enter is
    // already claimed above -- on a selected text leaf it re-enters
    // in-place editing, which ships and must keep working, so climbing
    // needs its own binding. Alt+ArrowUp/Down below already marks a reorder
    // target, but only on draggable leaves and only WITH Alt held; the bare
    // arrow keys are otherwise idle, so ArrowUp/ArrowDown without modifiers
    // is free and mirrors Webflow's own up-arrow parent hop (ArrowDown is
    // its natural reverse: step back to the node just climbed from).
    // climbToParent() itself refuses to fire while editingEl is set unless
    // told this IS the pointer route (viaCommand) -- not reachable from a
    // bare key, so an active in-place edit's own ArrowUp caret-move is never
    // stolen.
    if (
      !editingEl &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      var climbed =
        event.key === "ArrowUp" ? climbToParent() : stepBackFromClimb();
      if (climbed) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    var target = nearestEditable(event.target);
    if (!editingEl && target && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var behavior = selectElement(target);
      if (behavior === "text") beginTextEditing(target);
      return;
    }
    if (
      !editingEl &&
      target &&
      target.draggable &&
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectElement(target);
      postState(
        "selected",
        target,
        event.key === "ArrowUp"
          ? "Move target selected. Use Move earlier in the workbench to persist."
          : "Move target selected. Use Move later in the workbench to persist.",
      );
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  var dragTarget = null;

  function clearDragState() {
    if (selectedEl) selectedEl.removeAttribute("data-onebox-dragging");
    if (dragTarget) dragTarget.removeAttribute("data-onebox-drop-target");
    dragTarget = null;
  }

  function onDragStart(event) {
    var target = nearestEditable(event.target);
    if (!target || target.parentElement === document.body) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    selectElement(target);
    target.setAttribute("data-onebox-dragging", "");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      target.getAttribute("data-edit-id") || "",
    );
    postState(
      "dragging",
      target,
      "Drop beside an editable sibling; press Escape to cancel.",
    );
    event.stopImmediatePropagation();
  }

  function onDragOver(event) {
    var target = nearestEditable(event.target);
    if (
      !selectedEl ||
      !target ||
      target === selectedEl ||
      target.parentElement !== selectedEl.parentElement
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (dragTarget && dragTarget !== target)
      dragTarget.removeAttribute("data-onebox-drop-target");
    dragTarget = target;
    target.setAttribute("data-onebox-drop-target", "");
  }

  function onDrop(event) {
    if (!selectedEl || !dragTarget) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var siblings = Array.prototype.slice.call(selectedEl.parentElement.children);
    var earlier = siblings.indexOf(dragTarget) < siblings.indexOf(selectedEl);
    var selected = selectedEl;
    clearDragState();
    postState(
      "selected",
      selected,
      earlier
        ? "Drop target selected. Use Move earlier in the workbench to persist."
        : "Drop target selected. Use Move later in the workbench to persist.",
    );
  }

  function onDragEnd(event) {
    if (!selectedEl) return;
    event.stopImmediatePropagation();
    clearDragState();
    postState("selected", selectedEl);
  }

  function onParentMessage(event) {
    if (
      event.source !== parent ||
      !event.data ||
      event.data.type !== "onebox-editor-command"
    )
      return;
    if (event.data.action === "cancel") {
      if (editingEl) finishTextEditing(true, true);
    } else if (event.data.action === "clear") {
      clearSelection(true);
      climbStack = [];
      postState("idle", null);
    } else if (event.data.action === "select-parent") {
      // Pointer route for Select-Parent Escalation (canvas-upgrade A3, Play
      // 3) -- the workbench's "Select parent" control. viaCommand:true lets
      // this interrupt an in-progress in-place edit (cancelling the draft,
      // same as Escape), unlike the ArrowUp keyboard route in onKeyDown.
      climbToParent({ viaCommand: true });
    } else if (event.data.action === "step-back") {
      // Pointer route for the reverse hop -- the workbench's "Back"
      // control, shown only while canStepBack is true.
      stepBackFromClimb();
    } else if (
      event.data.action === "select-by-id" &&
      typeof event.data.editId === "string" &&
      /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(event.data.editId)
    ) {
      // Breadcrumb ancestor jump (canvas-upgrade A3, Play 9) -- an
      // arbitrary-distance direct selection, not a one-level climb, so it
      // goes through selectElement's ordinary (stack-resetting) path rather
      // than climbToParent/stepBackFromClimb.
      var ancestorEl = document.querySelector(
        '[data-edit-id="' + event.data.editId + '"]',
      );
      if (ancestorEl) selectElement(ancestorEl);
    } else if (event.data.action === "tree-hover") {
      // Layers/Navigator row hover (canvas-upgrade Wave 5, Play 6c). Same
      // editId validation as select-by-id above -- an editId is an id,
      // never trusted -- but editId is OPTIONAL here (absent/invalid means
      // "clear"), unlike select-by-id where an invalid id is simply
      // ignored. setTreeHover's own typeof guard is the actual gate; this
      // regex only prevents an attacker-controlled string that fails the
      // shape check from ever reaching the querySelector attribute value.
      setTreeHover(
        typeof event.data.editId === "string" &&
          /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(event.data.editId)
          ? event.data.editId
          : undefined,
      );
    } else if (
      event.data.action === "preview-motion" &&
      selectedEl &&
      event.data.editId === selectedEl.getAttribute("data-edit-id")
    ) {
      var runtime = window.__ONEBOX_MOTION_RUNTIME__;
      if (runtime && runtime.preview) runtime.preview(
        Object.assign({}, event.data.draft, {
          id: "00000000-0000-4000-8000-000000000000",
          editId: selectedEl.getAttribute("data-edit-id"),
        }),
      );
    } else if (event.data.action === "reset-motion") {
      var motionRuntime = window.__ONEBOX_MOTION_RUNTIME__;
      if (motionRuntime && motionRuntime.reset) motionRuntime.reset();
    } else if (
      event.data.action === "preview-token" &&
      typeof event.data.token === "string" &&
      /^--[a-z0-9-]{2,80}$/i.test(event.data.token) &&
      typeof event.data.value === "string" &&
      event.data.value.length <= 100 &&
      !/[;{}]|url\s*\(|var\s*\(/i.test(event.data.value)
    ) {
      document.documentElement.style.setProperty(event.data.token, event.data.value);
    }
  }

  function addKeyboardTargets() {
    document.querySelectorAll("[data-edit-id]").forEach(function (el) {
      // A container's manipulation surface is deliberately not the same as a
      // leaf's (Webflow bar: role-differentiated affordances, never
      // identical). draggable="true" is the single-headline sibling-reorder
      // handle; stamping it on every section/list-item too would let a whole
      // container start that same drag from anywhere in its padding, which
      // is not a designed interaction yet. Containers stay selectable by
      // click and by keyboard (tabindex below) without inheriting it. The
      // Alt+Arrow keyboard reorder shortcut reads this same draggable
      // property, so mouse and keyboard agree on which elements the reorder
      // gesture applies to.
      if (behaviorFor(el) !== "container") el.setAttribute("draggable", "true");
      if (
        !el.hasAttribute("tabindex") &&
        !el.matches("a,button,input,select,textarea")
      ) {
        el.setAttribute("tabindex", "0");
        el.setAttribute("data-onebox-added-tabindex", "");
      }
    });
  }

  function init() {
    injectStyles();
    addKeyboardTargets();
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("input", onInput, true);
    window.addEventListener("message", onParentMessage);
    // Keeps the floating container badge glued to its target through
    // scrolling (window-level and any inner scroll container) and layout
    // changes; syncContainerBadge() itself no-ops when nothing is active.
    // Coalesced through rAF (scheduleBadgeSync) since both can fire many
    // times per second.
    window.addEventListener("scroll", scheduleBadgeSync, true);
    window.addEventListener("resize", scheduleBadgeSync);
  }

  // Installed synchronously from <head>, before generated page scripts can
  // register action handlers. This ordering makes Edit safety fail-closed.
  window.addEventListener("pointerdown", blockGeneratedAction, true);
  window.addEventListener("mousedown", blockGeneratedAction, true);
  window.addEventListener("touchstart", blockGeneratedAction, true);
  window.addEventListener("input", blockGeneratedAction, true);
  window.addEventListener("change", blockGeneratedAction, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("submit", onSubmit, true);
  window.addEventListener("dragstart", onDragStart, true);
  window.addEventListener("dragover", onDragOver, true);
  window.addEventListener("drop", onDrop, true);
  window.addEventListener("dragend", onDragEnd, true);

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
