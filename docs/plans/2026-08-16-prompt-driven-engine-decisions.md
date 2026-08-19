# Prompt-driven engine — decision record

Date: 2026-08-16. Owner: Devin. Method: multi-model — a 4-member premium LLM
council (Gemini 3.1 Pro, Grok 4.6, Kimi K3, DeepSeek V4 Pro; GPT-5.6 Sol-Pro
chairman), an independent file-grounded adversarial verification (GPT-5.6 Sol
via codex, read-only, xhigh), a measured anatomy pass over all 430 harvested
prompt bodies, and a 4-analyst visual pass over 41 rendered previews.

Goal (owner, verbatim intent): ONE BOX must produce sites at MotionSites
level for ANY client — dentist, lawyer, jeweler, bricklayer, plumber, new
product, tech — with fun, exciting motion and genuinely gorgeous design.

## Decisions

**D1 — Build target: prompt → validated Page IR → deterministic static
compile ("option D").** The first council voted B (prompt-authored static)
unanimously; adversarial verification proved B's plank false in the current
builder (the Tailwind candidate filter at `src/lib/builder.ts:63` rejects
variant/arbitrary/opacity syntax; utilities attach only to the hero CTA) and
every member independently named B's failure mode ("the frozen template one
layer down"). D is B with the compiler made explicit: stable `data-edit-id`
identities, evidence-bound content slots, semantic tokens as constraints
(not generators), hashed local asset manifest, capability allowlist with
escalation. The current engine (C) remains the production fallback until D
passes on four representative anchors: static, stateful, video, motion-led.
Feasibility of the translations is proven, not assumed — the 30/30 template
run solved WebGL→CSS/SVG, canvas→CSS masks, HLS→mp4, scroll-scrub→vanilla
per-template (prompt-catalog `pipeline/RUN-STATE.md`).

**D2 — Motion is the default, everywhere.** Owner directive 2026-08-16.
One signature mechanic per page plus entrance/hover choreography, written
with numbers; reduced-motion branch removes rather than shortens;
accessibility gates non-negotiable. This supersedes the opportunity map's
"avoid motion for local services" posture at the DEFAULT level; a client
subtracts, we do not negotiate upward.

**D3 — Quality is defined by instrument, not vibes.** Three files in
prompt-catalog/pipeline/ now govern: `PROMPT-ANATOMY.md` (what the format
is, measured), `HARD-RULES.md` (how a build must consume a prompt, incl.
the nine composition rules the corpus never writes down), and
`QUALITY-RUBRIC.md` (10 dimensions 0–4 + hard gates + ship bar; the
craft-critic instrument for the dual-family gate). ONE BOX's rubric-v2
"Visual quality" row resolves to QUALITY-RUBRIC.

**D4 — The corpus is the anchor library; donors are authored.** 435
harvested prompts supply page grammar (190 heroes + 126 full pages); the
sections service businesses convert on (process, contact, proof) do not
exist in it and are authored in-house per PROMPT-STANDARD, in the harvested
spec style. Trade-transfer rules (HARD-RULES R12) govern cross-vertical
transplants.

**D5 — Licence position (owner, 2026-08-16).** The MotionSites plan was
paid for commercial use; building client work from these prompts is
in-scope. Verbatim marketplace text still never ships as a product and
never leaves the catalog store. The 326 CloudFront asset URLs are an
engineering matter (vendor local, transcode, hash — HARD-RULES R10), not a
rights blocker.

**D6 — Corpus growth via site-to-prompt.** New skill at
prompt-catalog/.claude/skills/site-to-prompt/ reverse-engineers any live
site into an anatomy-complete prompt (measurables extracted + composition
judgment written in). Primary use: fill the trades/professional-services
gap with prompts at harvested-corpus concreteness. Council conditions
incorporated: mandatory timed behavioral inventory, anti-bloat clause,
authorized-sources-only with abstract-patterns-only for unlicensed
references.

**D7 — Composition judgment is enforced ENGINE-SIDE, in the Page IR
(council Q3, unanimous across all four members + chairman).** The nine
composition discriminators become compile constraints validated on the
layout tree before rendering (first-viewport region count, largest-object
ratio, occlusion relations, whitespace fraction, ground/accent tokens,
one signature-motion node). Prompt-side enforcement is bypassable;
critic-only enforcement is rejection sampling against an unchanged
generator. The non-geometric judgment (asset↔business coherence) becomes a
required declared-mapping field in the IR that the critic verifies. This
is a direct requirement on the D1 IR spec.

## Ratification

2026-08-16, second premium council run: P1 (hard rules), P2 (rubric), and
P3 (site-to-prompt skill) adopted — 4/4 conditional yes, chairman
synthesis final. Binding amendments, all incorporated in the files:
ground commitment replaces dark-by-default (R3); signature-vs-ambient
motion taxonomy with composed-static reduced-motion landing (R9);
delete-and-recompose for thin intake with designed empty states (R11);
transfer/break lists scoped to all proof-led verticals (R12); weighted
ship bar (≥30/40 AND D1/D2/D3/D6/D7 each ≥3 AND others ≥2 AND hard
gates); two added hard gates (mobile-390 integrity, display-font first
paint); the 7-step scripted live-render protocol; critic disagreement
protocol (|Δ|≥2 → third adjudication).

## Standing risks (accepted, tracked)

- The IR compiler can become "the frozen template one layer down" if it
  normalizes diverse prompts into few output shapes — named independently
  by three council members. Countermeasure: topology diversity is graded
  (rubric D3) and same-topology repetition across runs is a defect.
- Prompt bodies are untrusted input (Sol finding): they enter the model
  as data through the IR boundary, never as executable instructions;
  capability allowlist enforced at IR validation.
- Both repos carried uncommitted work at decision time; commit hashes and
  a DB snapshot should be pinned before D implementation starts.

## Next implementation steps

1. Pin baselines (commit prompt-catalog docs; snapshot catalog.db).
2. Spec the Page IR (types, capability allowlist v1) — resolves ENG-001..004.
3. Wire QUALITY-RUBRIC into the craft-critic stage; negative-test gates.
4. First four anchor builds (static / stateful / video / motion-led) through
   the full path; owner verdicts appended to CALIBRATION-V3.
