# ONE BOX canvas upgrade — approved spec

- **Status:** approved by the owner, 2026-08-16
- **Branch:** `feat/ui-overhaul-linear`
- **Surface:** the preview editor at `/preview/<id>` — the iframe canvas plus the workbench rail
- **Run state:** `~/.claude/goal-state/onebox-canvas-upgrade/`

## Approval basis

The owner approved this work in three statements, quoted rather than paraphrased so the
contract cannot drift:

1. > "the selection tool shoudl be able to select everthing, including the sections"
2. > "the chat box shoudl be available for one to add references or NLP to edit any section"
3. > "think of the top ten highest leverage plays for the canvas and please implememnt,
   > test and iterate until green"

And approved the design bar in their own words:

> "Framer on the surface, Webflow in the layout engine, and v0 in the AI workflow."

Expanded by the owner as: a Framer-like canvas shell (pan, zoom, pages, device frames,
direct selection, layers and simple responsive layout controls); Lovable/v0-style AI
interaction (chat stays prominent, selecting an element scopes the next prompt, the AI
proposes changes with preview, diff, undo and version history); and a small amount of
Webflow underneath (real parent/child structure; stack, flex, grid, spacing, sizing and
positioning; raw CSS classes and advanced controls hidden until requested).

The method was also specified: the gauntlet loop — a builder and a **separate** harsh
critic per piece, the critic comparing against the bar, looping until the critic picks
ours. Fan out subagents; ultracode.

## Binding constraints (inherited, not negotiable)

- `DESIGN.md` — the One-Box Midnight Instrument contract. Accent discipline, the 34px
  control cap, the 140ms motion rule, the type ramp, structural-not-chromatic errors.
- `AGENTS.md` — surgical changes; never commit `sites/`, `.one-box/`, `.next/`, or
  secrets; do not invent artifact fields outside `src/lib/contracts.ts`; the generated
  site structure comes from the frozen `templates/local-service/` template.
- `docs/security/local-api-threat-model.md` — the local API boundary is a threat surface.
  Every new endpoint field is validated at the boundary.
- The iframe protocol stays data-only and origin-checked. `readEditorStateMessage` and
  `isSelection` remain strict allow-lists; a new field means new validation, never a
  loosened `hasOnlyKeys`.
- An edit may not add classes, ids, inline styles, scripts, or new colours to the
  generated site. Styling comes from the token sheet. This already holds at
  `src/app/api/edit/route.ts:188` and must survive every change here.

## Success criteria

Each criterion is a command with an exit code or a captured mechanical measurement.
Narrative does not satisfy any of them. Proof lands in
`~/.claude/goal-state/onebox-canvas-upgrade/proof/<id>.txt`.

### Owner criteria

| id | criterion | verification |
|---|---|---|
| `A1` | Every `<section>` in a generated site is selectable in the canvas, and reports itself as a section rather than as one of its children. | Harness drives the edit iframe, clicks each section, asserts a `PreviewSelection` arrives whose `editId` is that section's and whose role is section-level. Zero unreachable sections. |
| `A2` | Every currently-unmarked content node named in recon is selectable — section eyebrows, the four section headings, trust-bar items, the area panel, nav links, footer copyright. | Harness enumerates every element the template renders and asserts each is reachable by click. Reports a coverage percentage; must be 100%. |
| `A3` | Selection can walk from a leaf to its parent section and back without reselecting by hand. | Harness selects a leaf, issues the parent-hop, asserts the section is selected; issues the child step, asserts return. |
| `B1` | A chat composer is reachable from every workbench tool and with no selection at all. | Harness iterates all seven tools × {selection, no selection} and asserts a usable composer is present in each of the fourteen states. |
| `B2` | A chat instruction can be scoped to a section and applied to it. | Harness selects a section, submits an instruction, asserts `/api/edit` accepts it and the generated file changes. Unit test covers the section-scoped path. |
| `B3` | A reference can be attached to a chat instruction and reaches the edit request. | Unit test asserts the reference travels through the request contract with boundary validation; harness asserts the attachment is visible in the composer once attached. |

### Repository gates ("green")

| id | criterion | verification |
|---|---|---|
| `G1` | TypeScript clean | `npm run typecheck` exit 0 |
| `G2` | Lint clean | `npm run lint` — 0 errors |
| `G3` | Unit suite green and not shrunk | `npx vitest run` — 0 failures, passing count ≥ the 449 baseline |
| `G4` | Production build succeeds | `npm run build` exit 0 |
| `G5` | Generated-site gates hold | `npm run test:smoke` exit 0 |
| `G6` | Rendered acceptance holds | `npm run test:e2e:preview` exit 0 |
| `G7` | No serious or critical accessibility violations on the canvas at 1440 / 768 / 390 | axe-core sweep, captured output |
| `G8` | Design contract clean | `npx --yes -p @google/design.md@0.3.0 design.md lint --format json DESIGN.md` — 0 errors |
| `G9` | Canvas obeys the visual contract | contract sweep: at most one acid-lime action per view, no interactive control over 34px on desktop, no 700+ weight on Switzer, media inside bounds — 0 problems |

### Method criterion

| id | criterion | verification |
|---|---|---|
| `M1` | Every implemented play was judged by a critic with fresh context that did **not** build it, comparing against the named bar mechanic, and the critic picked ours. | Per-play critic verdict captured in the run log with the bar mechanic named. A play whose critic still prefers the bar is not complete. |

## Task list

Derived from the ranked top ten (see `run.log.md` for the ranking and the three judge
lenses that produced it). Recorded in `state.json`; this section is the human-readable
mirror.

## Out of scope

Named explicitly so scope discipline has something to check against:

- Anything on the intake surface (`/`) or the evidence workspace (`/evidence/<id>`).
  Those shipped in the prior overhaul and are not reopened here.
- A publish or download destination action for the workbench. Previously flagged to the
  owner as a feature decision, not a style fix; it remains unrequested.
- Moving the Maps lane to a keyed JS/Static Maps API. Documented in `DESIGN.md` as the
  real fix for the light-tile embed; still a pipeline change, still not requested.
- Changing the frozen `templates/local-service/` structure beyond adding selection
  attributes and the ids required by criteria A1 and A2.
- Landing the branch. `zs-land` is not run by this spec.
