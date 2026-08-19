---
version: alpha
name: One-Box Midnight Instrument
description: A Linear-derived midnight precision instrument — void canvas, hairline-bordered carbon surfaces, one acid-lime action per view, coral punctuation, Switzer and Clash Display voice.
colors:
  primary: "#e4f222"
  canvas: "#08090a"
  surface-carbon: "#0f1011"
  surface-obsidian: "#161718"
  border-graphite: "#23252a"
  border-smoke: "#383b3f"
  text-ash: "#80858e"
  text-fog: "#8a8f98"
  text-mist: "#d0d6e0"
  text-bone: "#e5e5e6"
  text-paper: "#ffffff"
  accent-coral: "#eb5757"
  accent-pulse: "#27a644"
  accent-teal: "#02b8cc"
  accent-iris: "#6366f1"
  accent-lavender: "#8b5cf6"
typography:
  display:
    fontFamily: Clash Display
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -0.022em
  heading:
    fontFamily: Clash Display
    fontSize: 32px
    fontWeight: 500
    lineHeight: 1.13
    letterSpacing: -0.022em
  subheading:
    fontFamily: Switzer
    fontSize: 20px
    fontWeight: 590
    lineHeight: 1.33
    letterSpacing: -0.012em
  body:
    fontFamily: Switzer
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: -0.011em
  label:
    fontFamily: Switzer
    fontSize: 13px
    fontWeight: 510
    lineHeight: 1.2
  caption:
    fontFamily: Switzer
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.013em
rounded:
  small: 2px
  badge: 4px
  control: 6px
  card: 12px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  card: 20px
  xl: 24px
  xxl: 32px
  zone: 48px
  section: 56px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-mist}"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface-carbon}"
    rounded: "{rounded.card}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
  button-coral:
    textColor: "{colors.accent-coral}"
    rounded: "{rounded.control}"
  button-ghost:
    textColor: "{colors.text-mist}"
    rounded: "{rounded.control}"
  badge:
    textColor: "{colors.text-fog}"
    rounded: "{rounded.badge}"
  text-muted:
    textColor: "{colors.text-fog}"
  divider:
    backgroundColor: "{colors.border-graphite}"
---

# One-Box — Midnight Instrument
> A midnight precision instrument. Void-black canvas, hairline-bordered carbon
> surfaces, tight quiet type, and exactly one electric action per view.

**Theme:** dark

**Scope:** this contract governs the ONE BOX app shell only (intake, pipeline
timeline, competitive scan, evidence workspace, editor workbench). Generated
client sites carry their own per-run contract under
`evidence/versions/design-contract/` — never mix the two.

**Lineage:** derived from the owner-supplied Linear style bundle (Refero
extraction of linear.app, 2026-07-03; supplied 2026-08-16 with "use this style
please"), amended per owner direction: type moves off Inter to Switzer + Clash
Display, and Coral Red is promoted from decorative-only to carry real roles.
Supersedes "One-Box GSAP Studio" (retired 2026-08-16).

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Void | `#08090a` | Page canvas — the default full-bleed background |
| 1 | Carbon | `#0f1011` | Cards, panels, nav containers |
| 2 | Obsidian | `#161718` | Elevated/nested panels, map body, code blocks |
| 3 | Slate | `#23252a` | Interactive surface tint, ghost fills, border-adjacent backgrounds |

Elevation comes from hairline borders (1px `#23252a`, stepped to `#383b3f` for
stronger separation) and subtle inset rings (`rgb(35,37,42) 0 0 0 1px inset`),
never from layered drop shadows. Two outer shadows exist and no more:
`rgba(0,0,0,.4) 0 2px 4px` for floating elements (menus, map pins), and
`rgba(8,9,10,.6) 0 4px 32px` for large popovers that must separate from a busy
surface behind them (the target and research panels). Nothing else casts.

## Color roles

| Color | Value | Role |
|-------|-------|------|
| Acid Lime | `#e4f222` | THE primary action — one filled lime control per view, nothing else is lime |
| Coral Red | `#eb5757` | Second voice (owner-requested): request-changes/route-back actions, flagged and filtered signals, decorative punctuation (section markers, accent bands) |
| Pulse Green | `#27a644` | Approved/verified marks — gate checkmarks, verified badges |
| Signal Teal | `#02b8cc` | Map pins + roster⇄map sync signals, informational icon fills |
| Iris Violet | `#6366f1` | Tag/badge fills — research and reference chips |
| Lavender | `#8b5cf6` | Secondary tag fills, category indicators |
| Paper→Ash ramp | `#ffffff → #80858e` | All text: paper headings, mist body, fog secondary, ash metadata |

Pipeline-stage badges use the accent set as small dot-badges only (dot + fog
label on `rgba(255,255,255,.05)`): intake=pulse, scanned=teal, locked=coral,
synthesized=iris, built=lavender. Stage identity never fills a surface.

## Typography

- **Clash Display** (Fontshare) — display statements and screen headings only.
  600 at 48–64px display, 500 at 24–32px headings. Sentence case, tight
  tracking (-0.022em class). Never below 20px, never for UI chrome.
- **Switzer** (Fontshare) — everything else: body 15px/400, emphasis 510/590
  (the system NEVER uses 700+; weight discipline is the voice), labels 13px/510,
  captions 12.5px. Tabular numerals on all data.
- **JetBrains Mono** — run ids, gate versions, hex values, keyboard hints,
  timestamps. 11–12px, never headings, never body.

Every text colour clears WCAG AA (4.5:1) on the surface it sits on. Ash is the
one step with a limit: it clears AA on void, carbon and obsidian but not on
slate, so ash never sets type on a slate surface — use fog there. Iris and
lavender are fill-only; they never carry text.

Focus is neutral and system-wide: a 2px `--focus-ring` (mist) outline at 2px
offset. Lime and teal are ruled out because focus would blur the one-action and
map-signal roles.

## Controls

| Control | Spec |
|---------|------|
| Primary (lime) | `#e4f222` fill, void text, 6px radius, 32–34px tall, 14px/510, one per view |
| Coral (route-back) | coral text on `rgba(235,87,87,.08)` fill + 40%-alpha coral border, 6px radius, 32px |
| Ghost | mist text, 1px graphite border, transparent, 6px radius, 24–32px |
| White pill | paper fill, void text, 9999px radius — nav-level CTA only |
| Badge | 4px radius, `rgba(255,255,255,.05)` fill, fog text, 12px, optional 7px accent dot |
| Filter/segment pill | 9999px radius, 24px tall, `rgba(255,255,255,.05)`; active = `rgba(255,255,255,.1)` + paper text |

Pressed/hover states shift surface tint (`rgba(255,255,255,.02–.04)`), never
scale or glow; filled controls brighten instead (`filter: brightness(1.06)`).
Every state change crosses in 140ms ease — an instant swap reads as a glitch.
Compact is the rule: nothing interactive exceeds 34px height except the
composer textarea. 44px touch targets apply only at the ≤768px breakpoint, via
padding expansion — never by inflating the visual control.

A disabled control steps DOWN to a neutral surface (slate fill, ash label). It
is never the enabled fill at reduced opacity: dimming acid lime turns it olive,
which reads as a different colour rather than a different state.

## App components

### Gate rail (evidence workspace)
Vertical list of the six named gates in a carbon card. Three-state dots:
outline graphite = pending, filled mist = current, pulse-green ring + check =
approved. Current gate row gets `rgba(255,255,255,.04)` fill + graphite ring.
Mono metadata right-aligned (version, time, "in review" in coral).

### Artifact viewers
Every gate with a recorded artifact opens from the rail, and each of the six
artifact types gets a reader shaped to what it is — never a JSON dump. Reading
an earlier gate never advances the run: the approve controls stay bound to the
gate the run itself is waiting on, and browsing swaps them for a single ghost
route back. Raw bytes stay one click away from every viewer.

**Client colour is quarantined.** A generated site's palette is arbitrary —
earthy greens, warm limes, whatever the run produced. It appears ONLY inside a
bounded swatch: never a surface, a border, a control, or any text in this
shell. The midnight frame holds the palette; it never joins it.

### Palette card
The showpiece of the token and contract gates. A 96px client-colour swatch
edge-to-edge at the card top, bounded by the card's own graphite hairline, over
name (Switzer 590), hex + CSS variable (mono), the role it plays (fog), and the
prohibition — the word `Never` in coral (punctuation, not danger) followed by
the rule in ash. Below a hairline, measured WCAG ratios against the palette's
own darkest and lightest members: proof, not assertion.

### Artifact panel
Carbon card, header row = title (Clash 500 at 16–18px) + provenance line (fog,
12.5px) + the action pair pinned right: Approve & continue (lime) +
Request changes (coral). Content area per artifact type: token tables with
swatches, mono JSON in obsidian wells, key-value rows (fog label / mist value).
Footer note in ash explains the advance behavior.

### Market feature (pipeline)
The competitive scan's payload is promoted OUT of the run log and rendered
above it: eyebrow, KPI strip, then a split of map (left, ~1.55fr) and the top
three operators as stacked cards (right, ~1fr). Ranks 4–N collapse into one
disclosure row. The rest of the run stays collapsed behind stage rows — this
panel is the answer, everything below it is the log. The run's own status,
spend and elapsed read as one quiet mono line so the market figures are the
only large numbers on the screen.

### Competitor card
Carbon card, graphite hairline, 6px radius. The rank numeral leads in Clash
500 at 24px — the same glyph the map pin carries, which is what binds card to
pin without spending a colour on it. Name in Switzer 590/14px, rating as a
mist 18px tabular figure with an ASH star (never gold — a yellow star would be
a sixth accent with no role), review count in fog. The footer states corroboration
(`two sources` with a pulse dot, or `one source` with a hollow smoke ring) and
the outbound listing link. Hover steps the border to smoke; nothing scales.

### Roster row (scan)
Grid row: rank (ash, tabular) · name (mist, 510) + optional verified badge
(pulse dot) · rating `4.9 · 312` (mist/fog) · ghost "Site" button (24px).
Hairline separators, hover tint. Numbered teal map pins match rank numbers.

### Map panel
Obsidian body inside a carbon card with header (title + teal count badge).
The Google Maps embed fills the body; footer holds source caption (mono, ash)
and the external link. The map never renders full-bleed.

Google's Embed API serves light tiles only and exposes no styling, so the
frame carries a brightness/saturation tone-down to keep a white rectangle from
detonating on a void canvas. Tone only — no inversion, no hue rotation, so
roads, labels, the Google mark and the attribution stay the colours Google
served — and it lifts entirely on hover or focus. Genuinely dark tiles need
the JS or Static Maps API with a keyed custom style; until the Maps lane moves
there, this is the honest ceiling.

### KPI strip
Flat row, no card chrome: paper value (24px/510, tabular) over ash label (12px),
32px gaps, hairline rule below.

### Eyebrow
Every screen and panel names itself with `{ braces }` — lowercase label in fog,
13px, inside literal curly braces. This is the incumbent pattern across the gate
strip, evidence workspace, reference panel and workbench; the intake hero's
coral-dash variant is the outlier and adopts it.

### Error state
Errors are structural, not chromatic. Coral already means route-back-action and
flagged-signal, so it never means danger. An error renders as an obsidian well
inside a stepped smoke border, led by a filled bone dot carrying `!` in void.
Destructive confirmation is the one exception: paper-on-coral fill, and only
inside an explicit confirm dialog.

### Empty and pending states
One card shape for all of them: obsidian well, graphite hairline, 6px radius —
an uppercase ash label, a bone title, and a fog sentence saying what will fill
it. Never a bare paragraph on the canvas.

### Long-run disclosure
Two rules keep long surfaces scannable. **Collapse by default:** in any list of
machine-run stages, only the current stage renders expanded; completed stages
collapse to a one-line summary row (dot-badge + outcome + mono elapsed) that
opens on click. **Bound every payload:** raw JSON opens from a `Raw` disclosure
into a well capped at 320px with internal scroll, and captured imagery renders
as a fixed-size thumbnail that opens full size on click. No artifact sets a
page's height.

### Composer (intake)
Carbon card, 20px padding: placeholder text (fog), hairline-divided control row
— target segment pills, research dot-badges, upload badges — and the lime
submit. Example-prompt pills sit below the card in fog.

## Do

- Keep at most one acid-lime action per view; every other control is neutral, coral, or ghost. Zero is correct wherever the view's primary action is genuinely unavailable — a disabled composer, a gate with no approve path, a tool surface with no destination. Never two.
- Use hairline borders + surface steps for all separation; the 8/12/16/24 spacing ladder inside components, 48–64px between screen zones.
- Set headings in Clash at 500/600 with tight tracking; keep Switzer weights ≤590.
- Use coral deliberately: route-back actions, dropped/flagged counts, section-marker punctuation — visible in every screen, dominant in none.
- Keep data quiet: tabular numerals, fog/mist ramp, mono for identifiers.
- Contain every information unit in a bordered carbon card with an explicit header.

## Don't

- No warm cream, no GSAP palette, no condensed-caps display type.
- No bold (700+) anywhere; no decorative gradients on UI; atmosphere washes cap at radial tints ≤5% alpha.
- No second filled chromatic button in a view; lime never appears as text/border decoration.
- No 44px+ desktop controls, no pill-radius buttons (pills are chips/nav CTA only).
- No full-bleed maps or embeds; no borderless text slabs.
- No coral as an error/danger semantic — errors get their own treatment (coral is action/punctuation; destructive confirmation uses paper-on-coral fill only inside explicit confirm dialogs).
