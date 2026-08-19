/**
 * WITS — variant C behaviour.
 * 1. Letter-level stagger on the hero headline (JS-injected spans).
 * 2. IntersectionObserver scroll reveals, once, staggered via --i.
 * Both guarded by prefers-reduced-motion.
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Hero headline letter stagger ------------------------------------ */

  var title = document.getElementById("hero-title");

  if (title) {
    if (reduceMotion) {
      title.classList.add("is-static");
    } else {
      var startDelay = 0.12; // seconds, after the eyebrow badge
      var step = 0.055; // seconds per character, within the 0.05-0.07s band
      var lineGap = 0.3; // seconds added per line, so lines cascade rather
      // than queue behind one another char-by-char (this headline runs 4
      // lines long — a single continuous counter would push the last line
      // out past 2.5s, which reads as sluggish rather than staggered).

      function wrapChars(node, base) {
        var count = 0;
        var children = Array.prototype.slice.call(node.childNodes);
        children.forEach(function (child) {
          if (child.nodeType === Node.TEXT_NODE) {
            var frag = document.createDocumentFragment();
            child.textContent.split("").forEach(function (ch) {
              if (ch === " ") {
                frag.appendChild(document.createTextNode(" "));
                return;
              }
              var span = document.createElement("span");
              span.className = "ch";
              span.textContent = ch;
              span.style.animationDelay = (base + count * step).toFixed(3) + "s";
              count += 1;
              frag.appendChild(span);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.classList && child.classList.contains("accent-word")) {
              // The gradient (background-clip: text) needs a direct text
              // node to clip to — per-letter spans would break it. Fade the
              // whole word in as one unit instead, in the same cascade.
              child.classList.add("word-fade");
              child.style.animationDelay = (base + count * step).toFixed(3) + "s";
              count += child.textContent.length;
              return;
            }
            count += wrapChars(child, base + count * step);
          }
        });
        return count;
      }

      var lines = title.querySelectorAll(".line");
      lines.forEach(function (line, i) {
        wrapChars(line, startDelay + i * lineGap);
      });
      title.classList.add("is-animating");
    }
  }

  /* ---- Scroll reveals ---------------------------------------------------- */

  var revealTargets = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );

  revealTargets.forEach(function (el) { io.observe(el); });
})();
