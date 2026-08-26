# Guided pipeline direction and visual audit addendum

Status: Approved by the owner in the 2026-08-25 autonomous audit request.

## Objective

Make the guided OneBox pipeline feel immediate, visual, honest, and dependable while preserving the existing developer timeline. Repair the current map and competitor regression, then audit the complete guided journey and visual system with an independent Opus 5 pass.

## Success criteria

1. After intake completes, the guided view exposes the market map immediately. When Maps Embed is configured, the map renders; when it is not configured, the UI shows a deliberate Google Maps fallback link and never embeds a raw 503 response.
2. Discovered competitor sites become clickable before all crawl and analysis work finishes. Completed competitor research remains visible while the owner chooses references and during later pipeline stages.
3. A successfully captured, non-directory, non-editorial first-party business site is eligible for evidence-based analysis without requiring Google Places. Places remains an optional verification enrichment, not a prerequisite for showing real competitors.
4. Competitor cards show honest provenance and analysis. Ratings, review counts, directory position, and social popularity never influence ranking.
5. The guided journey is visually coherent and usable at desktop, 390px, and 320px; it has no horizontal overflow or console errors, interactive controls meet the existing 44px target, keyboard focus and Escape behavior work, and reduced-motion behavior remains safe.
6. Developer mode continues to render the existing `RunTimeline` without changing its data or component behavior.
7. Opus 5 audits pipeline direction and visual style. Every accepted finding is implemented and every rejected finding has a written evidence-based disposition.
8. Focused tests, the full unit suite, typecheck, lint, production build, guided E2E, security review, and independent TypeScript review pass. The branch is committed, pushed, clean, and its remote SHA matches local HEAD.

## Boundaries

- Local development and repository work only; no production deployment or DNS changes.
- No secrets in repository files, logs, prompts, or browser output.
- Existing run artifacts may be read for diagnosis but are not committed.
- Google credential changes must follow ZS Vault discipline and remain local-only.
