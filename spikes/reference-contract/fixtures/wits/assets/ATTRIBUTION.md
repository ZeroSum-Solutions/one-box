# Image provenance — generated placeholders, not photography

`hero-ambrook.jpg` and `hero-pipe.jpg` are **synthetically generated** with
local ImageMagick (`magick`) — gradients, a plasma-noise overlay, and Gaussian
noise for real pixel variance. No photograph, stock or otherwise, was
fetched, scraped, or reused from any other spike in this repo.

This is deliberate, not a shortcut taken under time pressure:

1. **Scope.** This spike's task instructions scope read-only reuse to
   `spikes/layout-ir/`. Pulling `spikes/refero-baseline/site/img/*.jpg` (real
   Unsplash stock, already used elsewhere for WITS) would have reached
   outside that boundary.
2. **Honesty about what these prove.** Gate C2 is a composition/topology
   proof, not a photography-direction proof. A generated image with real,
   non-uniform pixel content is sufficient to exercise every check that
   matters here — `object-fit: cover`, `focalCrop`/bleed constraints, and
   the C1-derived hero-paint pixel-variance assertion in `verify.mjs` — and
   it carries zero licensing ambiguity.
3. **It matches WITS's actual intake state.** `BRIEF.md`: *"No existing
   project photos or videos. Stock imagery and/or new professional project
   photography will be needed."* A placeholder is the honest artifact for
   this business today, not a simulation gap.

Each image's tone is a literal translation of its contract's own documented
descriptor, not a free illustration choice:

| File | Contract | Descriptor translated | Source |
|---|---|---|---|
| `hero-ambrook.jpg` | Ambrook | "candid, slightly desaturated ... real work environments" — warm amber-to-brown gradient, soft plasma texture, no hard edges | `spikes/refero-baseline/RESEARCH-LOG.md` §3/§5 |
| `hero-pipe.jpg` | Pipe | "Near-black canvas, molten orange, split photographic hero" — near-black base, a diagonal molten-orange split | `spikes/refero-baseline/RESEARCH-LOG.md` §2 |

If WITS commissions real photography, `spikes/refero-baseline/site/img/ATTRIBUTION.md`'s
"Replacement brief" (candid, slightly desaturated, real work in progress, no
posed stock) already describes what should replace `hero-ambrook.jpg`.
