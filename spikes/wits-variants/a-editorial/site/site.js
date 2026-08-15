/**
 * WITS — Variant A "Editorial Mono"
 * Scroll-reveal (once-only, staggered) + reduced-motion guard.
 * Hero entrance is handled by CSS (@media prefers-reduced-motion) — this file
 * only owns the IntersectionObserver-driven reveals below the fold.
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function revealImmediately() {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.classList.add("is-visible");
    });
    document.querySelectorAll("[data-reveal-group] > *").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  if (reduceMotion.matches) {
    revealImmediately();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealImmediately();
    return;
  }

  var STAGGER_MS = 90;

  function stagger(container) {
    Array.prototype.forEach.call(container.children, function (child, i) {
      child.style.setProperty("--reveal-delay", i * STAGGER_MS + "ms");
    });
  }

  document.querySelectorAll("[data-reveal-group]").forEach(stagger);

  var observer = new IntersectionObserver(
    function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var target = entry.target;
        if (target.hasAttribute("data-reveal-group")) {
          Array.prototype.forEach.call(target.children, function (child) {
            child.classList.add("is-visible");
          });
        } else {
          target.classList.add("is-visible");
        }
        obs.unobserve(target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -100px 0px" }
  );

  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    observer.observe(el);
  });
  document.querySelectorAll("[data-reveal-group]").forEach(function (el) {
    observer.observe(el);
  });

  // Re-check on a live preference change (e.g. OS toggle mid-session).
  reduceMotion.addEventListener("change", function (e) {
    if (e.matches) {
      observer.disconnect();
      revealImmediately();
    }
  });
})();
