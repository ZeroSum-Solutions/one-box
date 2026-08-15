# WITS — design contract

**Derived entirely from Refero.** Every rule below cites the Refero style it
came from. Nothing here is a house default, a template, or a carry-over from any
other project. Sources are logged in `RESEARCH-LOG.md`.

| Ref | Style | Refero ID |
|---|---|---|
| **[F]** | Fingerprint | `74adbdf2-822b-4df3-80d1-3c5a1b263a90` |
| **[O]** | Outsource Consultants | `63db7f14-d256-47a7-aa0c-337555022b6b` |
| **[T]** | Tailscale | `5d884659-1d6b-4b82-8ccd-dbb0434667a8` |
| **[A]** | Ambrook | `b11e1e78-3c62-45df-bf28-17c97718ed7d` |
| **[N]** | Andercore | `15fd028d-c493-47a9-8e69-0a59c6fdb14b` |

---

## 1. North star

**A project submittal, not a brochure.**

WITS's actual deliverable is a documented, labelled, tested cable plant. The
buyer's fear is an undocumented mess. So the site should read the way a good
submittal reads: precise, legible, annotated, nothing hidden.

That is not an invented concept — it is the intersection of the two strongest
references. **[F]** names itself *"Data Sheet Precision — a clean, well-organised
technical document with key elements highlighted in a single, vivid accent."*
**[O]** is *"architectural blueprint … monospaced text provides detailed
annotations."* Structured cabling is blueprint work, so the reference language
and the business's own medium are the same thing.

This resolves the brief's internal tension. **Technical** comes from the mono
annotation layer and the data treatment. **Approachable** comes from the warm
off-white canvas and generous measure — not from softness or friendliness cues.

## 2. Palette — from [F]

Foundation is **[F]** wholesale. It is the only candidate whose base is a *warm*
off-white (`#fafaf8`) rather than a cold white or a black; **[A]** independently
confirms the warm-neutral instinct (*"do not use generic light gray … always
select from the earthy palette"*).

| Token | Value | Role | Source |
|---|---|---|---|
| `--color-canvas` | `#fafaf8` | Page background | [F] Canvas White |
| `--color-surface` | `#ffffff` | Card surfaces | [F] Warm White |
| `--color-surface-sunk` | `#f0f0ef` | Section differentiation | [F] Light Gray |
| `--color-ink` | `#141415` | Primary text, headings | [F] Ink Black |
| `--color-ink-secondary` | `#454542` | Secondary text | [F] Graphite |
| `--color-ink-muted` | `#8c8c89` | Tertiary text, labels | [F] Faded Stone |
| `--color-border` | `#e4e5e1` | Component borders, dividers | [F] Border Ash |
| `--color-console` | `#2e2e2c` | Data/console panel background | [F] Code Block Dark |
| `--color-console-ink` | `#abb2bf` | Text inside console panels | [F] Monitor Grey |
| `--color-accent` | `#f35b22` | Primary CTA, active state, key highlight | [F] Accent Orange |
| `--color-accent-edge` | `#be400f` | CTA border, for depth | [F] (button spec) |
| `--color-signal` | `#88d2c3` | Data emphasis only, never interactive | [F] Deep Teal |

**Accent is the single brand swap point.** The brief says WITS has existing brand
colours but the files were *"provided separately"* and were not supplied for this
run. `--color-accent` therefore holds **[F]**'s orange. When the real brand files
arrive, changing `--color-accent` and `--color-accent-edge` re-brands the site;
nothing else needs to move. This is stated rather than guessed at.

**Rule (from [F] don't-list):** no chromatic colour outside this table. Accent
orange is the only interaction colour. `--color-signal` may appear in data
displays and must never be used for a control.

## 3. Type — from [F]

**[F]** pairs a sans for content with a monospace for anything technical, which is
exactly the two registers this brief needs.

| Role | Family | Substitute | Source |
|---|---|---|---|
| Content | Inter | `system-ui, sans-serif` | [F] |
| Annotation, data, labels | JetBrains Mono | `monospace` | [F] |

Licensed families are named for fidelity; the build ships the **substitutes**, per
`RESEARCH-LOG.md` §4.3. No webfont is loaded — the brief's audience is commercial
buyers on office networks, and **[F]**'s own layout is not typographically dependent
on the exact face.

Scale is **[F]**'s, verbatim:

| Token | Size | Line height | Letter spacing |
|---|---|---|---|
| `--text-caption` | 10px | 1.45 | — |
| `--text-label` | 12px | 1.5 | 0.08em (mono, uppercase) |
| `--text-body` | 14px | 1.6 | — |
| `--text-body-lg` | 16px | 1.6 | — |
| `--text-subheading` | 30px | 1.22 | -0.6px |
| `--text-heading` | 36px | 1.15 | — |
| `--text-display` | 48px | 1.17 | -0.99px |

Weights: 400 for all body copy; **600 only** for headings and short critical
statements — **[F]**'s don't-list forbids 700 in paragraphs.

**Rejected:** **[O]**'s 160px display. It is architectural-scale for a firm whose
name is its whole hero. WITS's headline has to carry a proposition, not a
wordmark, and 48px is the size **[F]** proves works for that job.

## 4. Shape — the one synthesis rule

**[F]** uses soft radii (cards 12px, buttons 6px, default 4px). **[O]** mandates
`0px` everywhere and forbids rounding outright. These conflict, so the mix needs a
rule rather than an average:

> **Soft for people, sharp for data.**
> Anything a person acts on or reads as content takes **[F]**'s radii.
> Anything that represents a measurement, a record, or an annotation takes
> **[O]**'s `0px` and its hairline border.

| Element | Radius | Source |
|---|---|---|
| Buttons | 6px | [F] |
| Content cards | 12px | [F] |
| Inputs, default | 4px | [F] |
| Console / spec panel | 0px | [O] |
| Data rows, index rules, annotation blocks | 0px | [O] |

This is legible on the page: the spec panel and the scope index read as
instrument surfaces; the buttons and cards read as interface.

## 5. Elevation — from [T] and [F]

**[T]** is the restraint reference: *"elevation should be subtle"*, `rgba(24,23,23,0.02)`.
**[F]** achieves the same with inset hairlines rather than drop shadows.

- Cards: **[F]**'s inset pair —
  `rgba(228,229,225,0.3) 0 1px 0 0 inset, rgba(110,111,109,0.1) 0 -1px 0 0 inset`
- No drop shadow anywhere. Both **[F]** and **[T]** forbid hard shadows; **[O]** and
  **[N]** forbid shadows entirely.
- Depth comes from surface change and hairline borders.

## 6. Surfaces — from [T]

**[T]** supplies the level system **[F]** lacks. Values are **[F]**'s.

| Level | Value | Purpose |
|---|---|---|
| 0 | `#fafaf8` | Page canvas |
| 1 | `#ffffff` | Cards, raised content |
| 2 | `#f0f0ef` | Section differentiation, quiet bands |
| Inverted | `#2e2e2c` | Console panel [F]; one CTA band [N] |

**[T]**'s rhythm rule is adopted: *"alternating light and very occasional dark
surface treatments"*. The page is light throughout with exactly **two** inverted
elements — the hero spec panel and the closing contact band. **[N]** contributes
only that closing band; its full-dark system was rejected (`RESEARCH-LOG.md` §2).

## 7. Layout — from [F], with [O]'s divider

- Page max width **1232px**, centred. — [F]
- Section gap token **48px**. — [F]
  Major bands use `2 × 48px` vertical padding; **[F]**'s 48px is the *gap* token
  and its own page runs looser between bands. Documented deviation, single rule.
- Element gap **8px**, card padding **12px** base. — [F]
- Hero is a **split**: proposition left, structured visual right. — [F]
  (*"hero section follows a split content pattern … next to a visual example,
  often a screenshot of the product UI in a dark container"*)
- One **full-bleed accent band** acts as a hard divider between the scope of work
  and the process. — [O] (*"a full-bleed … section acting as a strong visual
  divider or call-out"*)
- Feature content in **3-column grids**. — [F]
- Sticky top bar. — [F], [T], [O] all agree.

## 8. Imagery — from [A], and an honesty constraint

The brief states WITS has **no existing project photos** and that stock or
commissioned photography will be needed. So this build ships **no photographs**.
Placing stock imagery of someone else's cable plant on a page whose entire
argument is "our workmanship is careful" would be a lie in the medium the site
is selling.

This is also what the strongest references do. **[O]**: *"minimal imagery …
text-dominant, images playing a supporting, explanatory role."* **[F]**: imagery is
*"product screenshots and abstract graphic elements"*, not atmosphere.

Where photography will go, the build ships an **art-direction plate** — a marked
placeholder carrying aspect ratio and shot direction, so the commission brief is
on the page rather than in a document. Direction is **[A]**'s, which is the only
reference whose imagery rule fits a trade: *"candid, slightly desaturated
photography … real people in natural or work environments"*. **[N]**'s heavy black
tint is rejected with the rest of **[N]**.

Icons, per **[F]**: outlined, monochrome, functional, never decorative.

## 9. Motion — from [A]

The only reference that specifies it. Colour, background, box-shadow and opacity
transition at **0.15s ease**; deliberate state changes at 0.3s. Nothing else
animates. Reduced-motion is honoured.

## 10. Structure

Derived from the brief's own content, not from a section registry. The brief
sets the order by naming its own priorities: trust first, then scope, then
proof of process, then the call.

| # | Section | Why it exists | Design source |
|---|---|---|---|
| 1 | Masthead | Brief: *"feature both phone and email prominently"* — phone is a persistent action, not a footer item | [O] mono nav, [F] sticky |
| 2 | Hero + **spec panel** | Brief: primary purpose is *establish trust*. The panel states the verifiable facts — 15 years, 30 years, service area, scope — as a record rather than a claim | [F] split hero + console |
| 3 | Scope of work | Brief names 3 primary priorities and 5 further services. Rendered at two weights, not eight identical cards | [F] 3-col grid, [O] mono index |
| 4 | Accent band | The five differentiators as one statement, not five icon tiles | [O] full-bleed divider |
| 5 | How a project runs | Brief: FAQs must address *project timelines*. Answered structurally, before it is asked | [O] annotation, [F] rhythm |
| 6 | Coverage | Orlando primary; Florida and Colorado | [F] data treatment |
| 7 | Photography plate | Brief: photography *"will be needed"* — carries the commission direction | [A] art direction |
| 8 | FAQ | The three the brief names, and only those | [O] accordion, 0px |
| 9 | Contact band | Brief: *"call for an estimate"*, phone and email, simple | [N] single dark band |
| 10 | Footer | Thin, mono, factual | [O] |

## 11. Content constraints

Carried from `BRIEF.md` and binding on the copy:

1. No certifications, awards, licences, or memberships — WITS has none.
2. No testimonials, client names, review counts, or ratings — none exist.
3. No project photography presented as WITS's own work.
4. Only two numbers may be stated: **15 years in business**, **30 years industry
   experience**.
5. No online booking. The conversion is a phone call.

## 12. What is deliberately absent

Recorded so the absences read as decisions, not omissions:

- **No hero photograph.** See §8.
- **No trust bar of client logos.** WITS has no client list cleared for use.
- **No testimonial section.** None exist.
- **No statistics beyond the two permitted numbers.**
- **No webfont.** See §3.
- **No booking widget.** See §11.5.
