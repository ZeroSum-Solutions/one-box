/*
  WITS — Variant B "Cinematic Dark"
  Vanilla JS: mobile nav toggle + IntersectionObserver scroll reveals.
  All motion respects prefers-reduced-motion.
*/
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Mobile nav toggle ------------------------------------------- */
  var toggle = document.querySelector(".masthead__toggle");
  var nav = document.getElementById("primary-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---- Scroll reveals (once, rootMargin -100px) ---------------------- */
  var revealRoots = document.querySelectorAll("[data-reveal-root]");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealRoots.forEach(function (root) { root.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -100px 0px" }
  );

  revealRoots.forEach(function (root) { observer.observe(root); });

  /* Hero reveals immediately via its own CSS entrance animation, but still
     needs .is-visible so its reveal-items don't get re-triggered by the
     scroll observer's transition rules once they've already animated in. */
  var hero = document.querySelector(".hero");
  if (hero) {
    window.requestAnimationFrame(function () {
      hero.classList.add("is-visible");
    });
  }
})();
