/**
 * Safe Edit-mode overlay. Injected only for ?edit=1; View receives the
 * untouched site. Edit mode consumes every navigation/form action, exposes
 * keyboard selection, and sends data-only element state to its opaque parent.
 */
(function () {
  "use strict";

  var STYLE_ID = "onebox-overlay-style";
  var hoverEl = null;
  var selectedEl = null;
  var editingEl = null;
  var originalMarkup = "";
  var originalText = "";
  var previousFocus = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "[data-onebox-hover]{outline:2px dashed #00bae2 !important;outline-offset:2px !important;cursor:pointer !important;}" +
      "[data-onebox-selected]{outline:2px solid #00bae2 !important;outline-offset:2px !important;}" +
      "[data-onebox-editing]{outline:2px solid #0ae448 !important;outline-offset:3px !important;cursor:text !important;}" +
      "[data-onebox-dragging]{outline:3px solid #ff8709 !important;opacity:.72 !important;cursor:grabbing !important;}" +
      "[data-onebox-drop-target]{outline:3px dashed #ff8709 !important;outline-offset:4px !important;}" +
      "[data-onebox-unsupported]{outline-color:#ff8709 !important;}";
    document.head.appendChild(style);
  }

  function nearestEditable(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute("data-edit-id")) return el;
      el = el.parentElement;
    }
    return null;
  }

  function behaviorFor(el) {
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

  function selectionFor(el) {
    var state = {
      editId: el.getAttribute("data-edit-id") || "",
      tag: el.tagName ? el.tagName.toLowerCase() : "",
      text: (el.innerText || el.textContent || "").slice(0, 4000),
      behavior: behaviorFor(el),
    };
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
        },
        "*",
      );
    } catch {
      /* Opaque-origin edge case: safely drop the message. */
    }
  }

  function clearHover() {
    if (!hoverEl) return;
    hoverEl.removeAttribute("data-onebox-hover");
    hoverEl = null;
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
    selectedEl.removeAttribute("data-onebox-selected");
    selectedEl.removeAttribute("data-onebox-unsupported");
    selectedEl = null;
  }

  function selectElement(target) {
    if (selectedEl !== target) {
      clearSelection(true);
      selectedEl = target;
      target.setAttribute("data-onebox-selected", "");
    }
    var behavior = behaviorFor(target);
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
      postState("idle", null);
    } else if (
      event.data.action === "preview-motion" &&
      selectedEl &&
      event.data.editId === selectedEl.getAttribute("data-edit-id")
    ) {
      selectedEl.dispatchEvent(new CustomEvent("onebox-motion-preview"));
      var runtime = window.__ONEBOX_MOTION_RUNTIME__;
      if (runtime && runtime.rehydrate) runtime.rehydrate();
    }
  }

  function addKeyboardTargets() {
    document.querySelectorAll("[data-edit-id]").forEach(function (el) {
      el.setAttribute("draggable", "true");
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
