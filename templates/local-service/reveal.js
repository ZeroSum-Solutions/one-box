/**
 * one-box / templates/local-service / reveal.js
 *
 * CSS-transition scroll reveals + counter-up for trust-bar stats.
 * No GSAP/Lenis — IntersectionObserver + CSS transitions only, per house
 * frontend rules. Fully disabled under prefers-reduced-motion: every
 * [data-reveal] node and every stat value is shown at its final state
 * immediately, with no animation, no opacity dip.
 *
 * Content visibility never depends on this file running: index.html.tpl's
 * reveal-hidden CSS rule is scoped to `.js [data-reveal]`, and the `.js`
 * class is only added by an earlier *inline* script — so if this file
 * fails to load, [data-reveal] nodes are still fully visible (site.css's
 * un-marked baseline), just without the reveal transition.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    root.classList.add("no-motion");
  }

  var revealTargets = document.querySelectorAll("[data-reveal]");
  var statValues = document.querySelectorAll(".stat__value");

  function showImmediately(el) {
    el.classList.add("is-visible");
  }

  function setFinalCount(el) {
    var match = (el.textContent || "").match(/^(\d[\d,]*)(.*)$/);
    if (!match) return;
    var target = parseInt(match[1].replace(/,/g, ""), 10);
    if (!isFinite(target)) return;
    el.textContent = target.toLocaleString() + match[2];
  }

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach(showImmediately);
    statValues.forEach(setFinalCount);
    return;
  }

  function animateCount(el) {
    var match = (el.textContent || "").match(/^(\d[\d,]*)(.*)$/);
    if (!match) return; // no leading digits to animate — leave the static text as-is
    var target = parseInt(match[1].replace(/,/g, ""), 10);
    var suffix = match[2];
    if (!isFinite(target)) return;

    var duration = 900;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var value = Math.floor(progress * target);
      el.textContent = value.toLocaleString() + suffix;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        el.textContent = target.toLocaleString() + suffix;
      }
    }

    window.requestAnimationFrame(step);
  }

  var revealObserver = new IntersectionObserver(
    function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
  );
  revealTargets.forEach(function (el) {
    revealObserver.observe(el);
  });

  var countObserver = new IntersectionObserver(
    function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  statValues.forEach(function (el) {
    countObserver.observe(el);
  });
})();
