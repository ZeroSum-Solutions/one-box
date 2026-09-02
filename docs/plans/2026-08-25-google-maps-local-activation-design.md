# Google Maps local activation design

Date: 2026-08-25
Branch: `codex/onebox-review-evidence-ui`
Base: `cb26ae9f6179e6570ed305262a26ed360bd5a30f`
Owner approval: local development only; production origins, deployment, and promotion remain out of scope.

## Goal

Activate the existing Google Maps lane for local OneBox development. A configured run must verify competitor listings through Places API (New) and render the market map through Maps Embed API. A missing or rejected key must preserve the current key-free Google Maps links and clear degraded-state copy.

## Current state

OneBox already contains the product flow:

- `src/lib/tools/places.ts` calls Places Text Search (New) and creates Maps Embed URLs.
- `src/lib/tools/maps.ts` joins resolved places to competitors.
- `src/lib/pipeline.ts` emits map cards from the local-market query.
- `src/components/StageCard.tsx` renders an iframe or the degraded state.
- `.env.example`, `scripts/dev.sh`, preflight checks, cost accounting, and tests know about a single `GOOGLE_MAPS_API_KEY`.

The existing single-key contract mixes two security classes. Places is a server-side web service. Maps Embed sends a key to the browser. Google recommends separate keys because these uses need different application restrictions. The current `CardMap.embedUrl` can also place a key-bearing URL in replayable run events. Activation must correct both boundaries before the live key is used.

## Chosen approach

### Separate credentials

Use two environment variables:

- `GOOGLE_PLACES_API_KEY`: server-only key for Places API (New).
- `GOOGLE_MAPS_EMBED_API_KEY`: browser-visible key for Maps Embed API.

Do not fall back to the legacy `GOOGLE_MAPS_API_KEY`. A silent fallback would keep the mixed restriction model and make it easy to expose the Places key. Preflight will explain how to migrate when it sees only the legacy variable.

Store both values in ZS Vault. `scripts/dev.sh` may resolve them into the server process, but it must never print them or place them in a committed file.

### Google Cloud restrictions

Reuse the existing dedicated OneBox Maps project only if the account, billing state, enabled APIs, and ownership are correct. Otherwise stop before creating or attaching a billable project.

Configure the local keys as follows:

| Key | API restriction | Application restriction | Additional control |
|---|---|---|---|
| Places | Places API (New) only | No IP restriction for the local laptop because its outbound IP can change | Server-only storage plus a conservative request quota |
| Embed | Maps Embed API only | Websites restricted to the approved `localhost` and `127.0.0.1` development origins | No production hostname |

Devin completes Google sign-in, MFA, billing confirmation, consent, or payment steps. The agent may navigate to the exact page and continue after Devin clears the gate.

### Runtime and artifact boundary

Replace `CardMap.embedUrl` with a key-free embed descriptor, containing only the bounded search query needed to render the map. Persisted artifacts and replay events must never contain either key.

At the browser response boundary, create the Google Embed URL from the public embed key and the bounded query. The Places key remains reachable only from server-side Places calls. Key-free fallback links remain part of the persisted map record.

If a key is missing, rejected, over quota, or unavailable, the scan continues. The UI states whether Places verification, map display, or both are unavailable; it never reports an infrastructure failure as an empty market.

### Cost and data limits

Keep the existing maximum of four competitor lookups per run. Request only the current field mask required for classification, map coordinates, listing links, rating, and website matching. Do not add autocomplete, geocoding, directions, photos, Routes, or Maps JavaScript API.

Before the first live Places smoke test, record the current Google SKU and quota details from the selected Cloud project. Run one bounded lookup after the user has confirmed billing. Do not run a broad load test.

## Test-first implementation

Write and observe failing tests before production changes. Tests must cover:

1. Places calls accept only `GOOGLE_PLACES_API_KEY` and never the Embed key.
2. Embed rendering accepts only `GOOGLE_MAPS_EMBED_API_KEY` and never the Places key.
3. Persisted and replayed map payloads contain no key or key-bearing Google URL.
4. A missing Places key preserves unverified competitors and reports the Places lane as unavailable.
5. A missing Embed key preserves the key-free map link and reports the display lane as unavailable.
6. Rejected, malformed, and quota responses fail closed without exposing provider response secrets.
7. The local iframe renders at desktop, tablet, and phone widths without new console, accessibility, overflow, script-blocked, or reduced-motion regressions.

After local tests pass, verify one live Places query and one browser-rendered local map. Capture only redacted status, response shape, restriction result, and screenshot evidence.

## Security review

The review must map the following surfaces:

- Secrets: both keys, ZS Vault resolution, process environment, logs, fixtures, events, artifacts, screenshots, and Git history range.
- Authentication and authorization: Google account and Cloud project access; no new OneBox browser mutation authority.
- Untrusted input: the market query remains bounded and encoded before it enters a Google URL or request body.
- Export: category, location, candidate business name, and requested listing fields sent to Google Maps Platform.

Run the repository test suite, typecheck, lint, build, smoke gates, Maps-focused browser checks, the security-report validator, and a range-scoped gitleaks scan. A fresh TypeScript/UI reviewer and an independent verifier must review the exact final SHA.

## Non-goals

- Production origins or credentials.
- Vercel, DNS, domain, Preview, staged-production, or production changes.
- Google Search Console, Google Business Profile, or end-user Google OAuth.
- A general map editor, autocomplete field, directions, routing, geofencing, or Maps JavaScript SDK.
- Changes to Page IR authority, evidence gates, reference selection, or deployment policy.

## Acceptance criteria

The local activation is complete when:

- the two keys have the stated API and local application restrictions;
- neither key appears in Git, logs, persisted artifacts, replay events, or screenshots;
- a local run resolves at least one real listing through Places and renders its market map;
- missing or rejected credentials preserve the key-free degraded experience;
- cost, quota, and enabled-API evidence is recorded without secrets;
- automated, security, UI, and independent verification pass at one exact SHA;
- the branch remains undeployed and production-unconfigured.
