/**
 * Editor overlay, injected by the site-serving route when ?edit=1. Vanilla,
 * no dependencies. Hovers highlight the nearest [data-edit-id] ancestor,
 * a click selects it and posts to the parent, Escape clears the selection.
 * The parent validates message provenance + shape — this script only sends.
 */
(function () {
  "use strict";

  var STYLE_ID = "onebox-overlay-style";
  var hoverEl = null;
  var selectedEl = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "[data-onebox-hover]{outline:2px dashed #00bae2 !important;outline-offset:2px !important;cursor:pointer !important;}" +
      "[data-onebox-selected]{outline:2px solid #00bae2 !important;outline-offset:2px !important;}";
    document.head.appendChild(style);
  }

  function nearestEditable(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute("data-edit-id")) return el;
      el = el.parentElement;
    }
    return null;
  }

  function clearHover() {
    if (hoverEl) {
      hoverEl.removeAttribute("data-onebox-hover");
      hoverEl = null;
    }
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.removeAttribute("data-onebox-selected");
      selectedEl = null;
    }
  }

  function postSelect(editId, tag, text) {
    try {
      parent.postMessage({ type: "onebox-select", editId: editId, tag: tag, text: text }, "*");
    } catch {
      /* opaque-origin edge cases: nothing useful to do, drop it */
    }
  }

  function onPointerOver(e) {
    var target = nearestEditable(e.target);
    if (target === hoverEl) return;
    clearHover();
    if (target) {
      target.setAttribute("data-onebox-hover", "");
      hoverEl = target;
    }
  }

  function onPointerOut(e) {
    if (hoverEl && (!e.relatedTarget || !hoverEl.contains(e.relatedTarget))) {
      clearHover();
    }
  }

  function onClick(e) {
    var target = nearestEditable(e.target);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();

    clearSelection();
    target.setAttribute("data-onebox-selected", "");
    selectedEl = target;

    var editId = target.getAttribute("data-edit-id") || "";
    var tag = target.tagName ? target.tagName.toLowerCase() : "";
    var text = (target.innerText || target.textContent || "").slice(0, 120);
    postSelect(editId, tag, text);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && selectedEl) {
      clearSelection();
      postSelect("", "", "");
    }
  }

  function init() {
    injectStyles();
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
