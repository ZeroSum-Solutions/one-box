/** Declarative One-Box motion runtime. The manifest is data-only and every
 * target is resolved by an exact data-edit-id value. */
(function () {
  "use strict";

  var runtime = window.__ONEBOX_MOTION_RUNTIME__;
  if (runtime && runtime.destroy) runtime.destroy();

  var state = {
    generation: 0,
    context: null,
    listeners: [],
    mediaRemovers: [],
    timer: null,
    destroyed: false,
    applied: false,
    signature: "",
    manifestSignature: "",
    previewContext: null,
    played: Object.create(null),
  };
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
    if (state.previewContext) state.previewContext.revert();
    state.previewContext = null;
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

  function reducedMotionActive() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function mediaSignature() {
    if (!window.matchMedia) return "no-match-media";
    return [
      reducedMotionActive() ? "reduce" : "motion",
      window.matchMedia(breakpointQueries.mobile).matches ? "mobile" : "",
      window.matchMedia(breakpointQueries.tablet).matches ? "tablet" : "",
      window.matchMedia(breakpointQueries.desktop).matches ? "desktop" : "",
    ].join(":");
  }

  function entryPlayKey(entry) {
    return [
      entry.id,
      entry.kind,
      entry.trigger,
      entry.breakpoint,
      entry.durationMs,
      entry.delayMs,
      JSON.stringify(entry.properties),
    ].join(":");
  }

  function wasPlayed(entry) {
    return entry.replay === "once" && state.played[entryPlayKey(entry)] === true;
  }

  function markPlayed(entry) {
    if (entry.replay === "once") state.played[entryPlayKey(entry)] = true;
  }

  function varsFor(entry) {
    var properties = {};
    ["x", "y", "scale", "rotation", "opacity"].forEach(function (key) {
      if (typeof entry.properties[key] === "number" && isFinite(entry.properties[key])) properties[key] = entry.properties[key];
    });
    return Object.assign(properties, {
      duration: entry.durationMs / 1000,
      delay: entry.delayMs / 1000,
      ease: entry.ease === "none" ? "none" : entry.ease,
      overwrite: "auto",
    });
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasOnlyKeys(value, allowed) {
    return Object.keys(value).every(function (key) { return allowed.indexOf(key) >= 0; });
  }

  function validEntry(entry) {
    var allowedKeys = ["id", "editId", "kind", "durationMs", "delayMs", "ease", "properties", "trigger", "replay", "breakpoint", "scrub", "timelineId", "order"];
    if (!isObject(entry) || !hasOnlyKeys(entry, allowedKeys) || typeof entry.id !== "string" || typeof entry.editId !== "string") return false;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id)) return false;
    if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(entry.editId)) return false;
    if (["entrance", "exit", "hover", "scroll", "timeline"].indexOf(entry.kind) < 0) return false;
    if (["load", "viewport", "hover", "manual"].indexOf(entry.trigger) < 0) return false;
    if (["once", "repeat"].indexOf(entry.replay) < 0 || ["all", "mobile", "tablet", "desktop"].indexOf(entry.breakpoint) < 0) return false;
    if (["none", "power1.out", "power2.out", "power3.out", "sine.inOut"].indexOf(entry.ease) < 0) return false;
    if (!Number.isInteger(entry.durationMs) || entry.durationMs < 50 || entry.durationMs > 5000 || !Number.isInteger(entry.delayMs) || entry.delayMs < 0 || entry.delayMs > 5000) return false;
    if (!isObject(entry.properties)) return false;
    var bounds = { x: [-2000, 2000], y: [-2000, 2000], scale: [0.1, 4], rotation: [-360, 360], opacity: [0, 1] };
    if (!(Object.keys(entry.properties).length > 0 && Object.keys(entry.properties).every(function (key) {
      return bounds[key] && typeof entry.properties[key] === "number" && isFinite(entry.properties[key]) && entry.properties[key] >= bounds[key][0] && entry.properties[key] <= bounds[key][1];
    }))) return false;
    if (entry.kind === "hover" && entry.trigger !== "hover") return false;
    if (entry.kind === "scroll" && entry.trigger !== "viewport") return false;
    if (entry.kind === "exit" && entry.trigger !== "manual") return false;
    if (entry.kind === "entrance" && ["load", "viewport", "manual"].indexOf(entry.trigger) < 0) return false;
    if (Object.prototype.hasOwnProperty.call(entry, "scrub") && typeof entry.scrub !== "boolean") return false;
    if (entry.scrub && entry.kind !== "scroll") return false;
    if (entry.kind === "timeline") {
      if (["load", "viewport", "manual"].indexOf(entry.trigger) < 0) return false;
      if (typeof entry.timelineId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,39}$/i.test(entry.timelineId)) return false;
      if (!Number.isInteger(entry.order) || entry.order < 0 || entry.order > 50) return false;
    } else if (Object.prototype.hasOwnProperty.call(entry, "timelineId") || Object.prototype.hasOwnProperty.call(entry, "order")) return false;
    return true;
  }

  function validManifest(manifest) {
    var seenIds = Object.create(null);
    var seenTargets = Object.create(null);
    return isObject(manifest) &&
      hasOnlyKeys(manifest, ["version", "entries"]) &&
      manifest.version === 1 &&
      Array.isArray(manifest.entries) &&
      manifest.entries.length <= 100 &&
      manifest.entries.every(function (entry) {
        if (!validEntry(entry) || seenIds[entry.id]) return false;
        var targetKey = entry.editId + "\u0000" + entry.kind;
        if (seenTargets[targetKey]) return false;
        seenIds[entry.id] = true;
        seenTargets[targetKey] = true;
        return true;
      });
  }

  function mark(element, entry) {
    element.setAttribute("data-onebox-motion-active", entry.kind);
  }

  function addListener(element, eventName, handler) {
    element.addEventListener(eventName, handler);
    state.listeners.push(function () { element.removeEventListener(eventName, handler); });
  }

  function addReplayListener(element, eventName, entry, handler) {
    addListener(element, eventName, function () {
      if (wasPlayed(entry)) return;
      markPlayed(entry);
      handler();
    });
  }

  function installEntry(entry, timelines) {
    if (!matchesBreakpoint(entry.breakpoint)) return;
    var element = exactTarget(entry.editId);
    if (!element || element.matches("canvas,iframe") || element.querySelector("canvas,iframe")) return;
    if (entry.kind !== "timeline" && wasPlayed(entry)) return;
    mark(element, entry);
    var vars = varsFor(entry);
    if (entry.kind === "hover") {
      var hoverTween = window.gsap.to(element, Object.assign({}, vars, { paused: true }));
      var play = function () {
        if (wasPlayed(entry)) return;
        markPlayed(entry);
        hoverTween.restart();
      };
      var reset = function () { hoverTween.reverse(); };
      addListener(element, "pointerenter", play);
      addListener(element, "pointerleave", reset);
      addListener(element, "focus", play);
      addListener(element, "blur", reset);
      return;
    }
    if (entry.kind === "scroll") {
      window.gsap.from(element, Object.assign({}, vars, {
        onStart: function () { markPlayed(entry); },
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
      var timelineKey = [entry.timelineId, entry.trigger, entry.replay].join(":");
      var group = timelines[timelineKey];
      if (!group) {
        group = timelines[timelineKey] = {
          key: "timeline:" + timelineKey,
          entry: entry,
          element: element,
          timeline: window.gsap.timeline({ paused: true }),
          played: false,
        };
      }
      group.timeline.from(element, Object.assign({}, vars, { immediateRender: false }));
      if (entry.trigger === "manual") addListener(element, "onebox-motion-preview", function () {
        if (entry.replay === "once" && (group.played || state.played[group.key])) return;
        group.played = true;
        if (entry.replay === "once") state.played[group.key] = true;
        group.timeline.restart();
      });
      return;
    }
    if (entry.kind === "exit") {
      addReplayListener(element, "onebox-motion-preview", entry, function () { window.gsap.to(element, vars); });
      return;
    }
    if (entry.trigger === "viewport") {
      window.gsap.from(element, Object.assign({}, vars, {
        onStart: function () { markPlayed(entry); },
        scrollTrigger: {
          id: "onebox:" + entry.id,
          trigger: element,
          start: "top 85%",
          toggleActions: entry.replay === "repeat" ? "play reverse play reverse" : "play none none none",
          invalidateOnRefresh: true,
        },
      }));
    } else if (entry.trigger === "manual") {
      addReplayListener(element, "onebox-motion-preview", entry, function () { window.gsap.from(element, vars); });
    } else {
      window.gsap.from(element, Object.assign({}, vars, { onStart: function () { markPlayed(entry); } }));
    }
  }

  function startTimelines(timelines) {
    Object.keys(timelines).forEach(function (key) {
      var group = timelines[key];
      if (group.entry.replay === "once" && state.played[group.key]) return;
      group.timeline.eventCallback("onStart", function () {
        if (group.entry.replay === "once") state.played[group.key] = true;
      });
      if (group.entry.trigger === "load") {
        group.timeline.play(0);
      } else if (group.entry.trigger === "viewport") {
        window.ScrollTrigger.create({
          id: "onebox:" + group.entry.id,
          trigger: group.element,
          animation: group.timeline,
          start: "top 85%",
          toggleActions: group.entry.replay === "repeat" ? "play reverse play reverse" : "play none none none",
          invalidateOnRefresh: true,
        });
      }
    });
  }

  function applyManifest(manifest) {
    cleanup();
    if (!validManifest(manifest) || !manifest.entries.length) {
      document.documentElement.classList.remove("no-motion");
      return;
    }
    document.documentElement.classList.remove("no-motion");
    if (reducedMotionActive()) {
      document.documentElement.classList.add("no-motion");
      return;
    }
    if (!window.gsap || !window.ScrollTrigger) return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    state.context = window.gsap.context(function () {
      var timelines = Object.create(null);
      manifest.entries.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (entry) { installEntry(entry, timelines); });
      startTimelines(timelines);
    }, document.body);
    window.ScrollTrigger.refresh();
  }

  function rehydrate() {
    if (state.destroyed) return;
    var manifest = window.__ONEBOX_MOTION_MANIFEST__ || { version: 1, entries: [] };
    var nextSignature = mediaSignature();
    var nextManifestSignature = validManifest(manifest) ? JSON.stringify(manifest) : "invalid";
    if (state.applied && nextSignature === state.signature && nextManifestSignature === state.manifestSignature) return;
    state.applied = true;
    state.signature = nextSignature;
    state.manifestSignature = nextManifestSignature;
    applyManifest(manifest);
  }

  function scheduleRehydrate() {
    if (state.destroyed || mediaSignature() === state.signature) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(rehydrate, 120);
  }

  function watchMedia(query) {
    if (!window.matchMedia) return;
    var media = window.matchMedia(query);
    var handler = function () { scheduleRehydrate(); };
    if (media.addEventListener) {
      media.addEventListener("change", handler);
      state.mediaRemovers.push(function () { media.removeEventListener("change", handler); });
    } else if (media.addListener) {
      media.addListener(handler);
      state.mediaRemovers.push(function () { media.removeListener(handler); });
    }
  }

  function destroy() {
    state.destroyed = true;
    window.removeEventListener("resize", scheduleRehydrate);
    window.removeEventListener("beforeunload", destroy);
    state.mediaRemovers.splice(0).forEach(function (remove) { remove(); });
    cleanup();
    document.documentElement.classList.toggle("no-motion", reducedMotionActive());
  }

  window.addEventListener("resize", scheduleRehydrate);
  window.addEventListener("beforeunload", destroy);
  watchMedia("(prefers-reduced-motion: reduce)");
  watchMedia(breakpointQueries.mobile);
  watchMedia(breakpointQueries.tablet);
  watchMedia(breakpointQueries.desktop);
  function preview(entry) {
    if (
      state.destroyed ||
      !validEntry(entry) ||
      !matchesBreakpoint(entry.breakpoint) ||
      reducedMotionActive() ||
      !window.gsap ||
      !window.ScrollTrigger
    ) return false;
    var element = exactTarget(entry.editId);
    if (!element || element.matches("canvas,iframe") || element.querySelector("canvas,iframe")) return false;
    if (state.previewContext) state.previewContext.revert();
    state.previewContext = null;
    window.gsap.registerPlugin(window.ScrollTrigger);
    state.previewContext = window.gsap.context(function () {
      var vars = varsFor(entry);
      if (entry.kind === "timeline") {
        window.gsap.timeline({ paused: true }).from(element, Object.assign({}, vars, { immediateRender: false })).restart();
      } else if (entry.kind === "hover" || entry.kind === "exit") {
        window.gsap.to(element, vars);
      } else {
        window.gsap.from(element, vars);
      }
    }, document.body);
    return true;
  }

  window.__ONEBOX_MOTION_RUNTIME__ = { rehydrate: rehydrate, preview: preview, reset: cleanup, destroy: destroy, state: state };
  rehydrate();
})();
