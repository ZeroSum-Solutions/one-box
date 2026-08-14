/** Declarative One-Box motion runtime. The manifest is data-only and every
 * target is resolved by an exact data-edit-id value. */
(function () {
  "use strict";

  var runtime = window.__ONEBOX_MOTION_RUNTIME__;
  if (runtime && runtime.destroy) runtime.destroy();

  var state = { generation: 0, context: null, listeners: [], timer: null, destroyed: false };
  var breakpointQueries = {
    all: "all",
    mobile: "(max-width: 479px)",
    tablet: "(min-width: 480px) and (max-width: 767px)",
    desktop: "(min-width: 768px)",
  };

  function exactTarget(editId) {
    var matches = Array.prototype.filter.call(
      document.querySelectorAll("[data-edit-id]"),
      function (element) { return element.getAttribute("data-edit-id") === editId; },
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function cleanup() {
    state.generation += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.listeners.splice(0).forEach(function (remove) { remove(); });
    if (state.context) state.context.revert();
    state.context = null;
    if (window.ScrollTrigger) {
      window.ScrollTrigger.getAll().forEach(function (trigger) {
        if (trigger.vars && trigger.vars.id && String(trigger.vars.id).indexOf("onebox:") === 0) trigger.kill(true);
      });
    }
    document.querySelectorAll("[data-onebox-motion-active]").forEach(function (element) {
      element.removeAttribute("data-onebox-motion-active");
    });
  }

  function matchesBreakpoint(name) {
    return name === "all" || !window.matchMedia || window.matchMedia(breakpointQueries[name]).matches;
  }

  function varsFor(entry) {
    return Object.assign({}, entry.properties, {
      duration: entry.durationMs / 1000,
      delay: entry.delayMs / 1000,
      ease: entry.ease === "none" ? "none" : entry.ease,
      overwrite: "auto",
    });
  }

  function mark(element, entry) {
    element.setAttribute("data-onebox-motion-active", entry.kind);
  }

  function addListener(element, eventName, handler) {
    element.addEventListener(eventName, handler);
    state.listeners.push(function () { element.removeEventListener(eventName, handler); });
  }

  function installEntry(entry, timelines) {
    if (!matchesBreakpoint(entry.breakpoint)) return;
    var element = exactTarget(entry.editId);
    if (!element || element.matches("canvas,iframe") || element.querySelector("canvas,iframe")) return;
    mark(element, entry);
    var vars = varsFor(entry);
    if (entry.kind === "hover") {
      var tween = function () { window.gsap.to(element, vars); };
      var reset = function () { window.gsap.to(element, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, duration: Math.min(vars.duration, 0.3), overwrite: "auto" }); };
      addListener(element, "pointerenter", tween);
      addListener(element, "pointerleave", reset);
      addListener(element, "focus", tween);
      addListener(element, "blur", reset);
      return;
    }
    if (entry.kind === "scroll") {
      window.gsap.from(element, Object.assign({}, vars, {
        scrollTrigger: {
          id: "onebox:" + entry.id,
          trigger: element,
          start: "top 85%",
          toggleActions: entry.replay === "repeat" ? "play reverse play reverse" : "play none none none",
          scrub: entry.scrub ? true : false,
          invalidateOnRefresh: true,
        },
      }));
      return;
    }
    if (entry.kind === "timeline") {
      var timeline = timelines[entry.timelineId] || (timelines[entry.timelineId] = window.gsap.timeline({ paused: entry.trigger === "manual" }));
      timeline.from(element, vars, entry.order);
      return;
    }
    if (entry.kind === "exit") {
      addListener(element, "onebox-motion-preview", function () { window.gsap.to(element, vars); });
      return;
    }
    window.gsap.from(element, vars);
  }

  function applyManifest(manifest) {
    cleanup();
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.entries)) return;
    if (!window.gsap || !window.ScrollTrigger) return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("no-motion");
      return;
    }
    document.documentElement.classList.add("no-motion");
    state.context = window.gsap.context(function () {
      var timelines = Object.create(null);
      manifest.entries.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (entry) { installEntry(entry, timelines); });
      Object.keys(timelines).forEach(function (key) { if (!timelines[key].paused()) timelines[key].play(0); });
    }, document.body);
    window.ScrollTrigger.refresh();
  }

  function rehydrate() {
    var generation = ++state.generation;
    fetch("motion.json", { cache: "no-store" })
      .then(function (response) { if (!response.ok) throw new Error("manifest unavailable"); return response.json(); })
      .then(function (manifest) { if (!state.destroyed && generation === state.generation) applyManifest(manifest); })
      .catch(function () { cleanup(); document.documentElement.classList.remove("no-motion"); });
  }

  function scheduleRehydrate() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(rehydrate, 120);
  }

  function destroy() {
    state.destroyed = true;
    window.removeEventListener("resize", scheduleRehydrate);
    window.removeEventListener("beforeunload", destroy);
    cleanup();
    document.documentElement.classList.remove("no-motion");
  }

  window.addEventListener("resize", scheduleRehydrate);
  window.addEventListener("beforeunload", destroy);
  window.__ONEBOX_MOTION_RUNTIME__ = { rehydrate: rehydrate, reset: cleanup, destroy: destroy, state: state };
  rehydrate();
})();
