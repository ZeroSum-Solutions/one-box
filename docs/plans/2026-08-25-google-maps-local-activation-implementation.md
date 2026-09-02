# Google Maps Local Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate OneBox Places verification and market-map rendering for local development without persisting credentials or authorizing production use.

**Architecture:** Split the mixed Google key into a server-only Places key and a browser-visible Embed key. Persist only a bounded map query, send browser map requests through a same-origin redirect boundary, and preserve the existing key-free degraded state. Configure the two local keys in Google Cloud and ZS Vault only after the user clears sign-in and billing gates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Vitest 4, Playwright 1.62, Google Places API (New), Maps Embed API, ZS Vault.

**Spec:** `docs/plans/2026-08-25-google-maps-local-activation-design.md`

## Global Constraints

- Local development only. Do not add a production origin, deploy, promote, or change DNS.
- Devin completes Google sign-in, MFA, billing confirmation, consent, and payment prompts.
- Use separate `GOOGLE_PLACES_API_KEY` and `GOOGLE_MAPS_EMBED_API_KEY` values. Do not fall back to `GOOGLE_MAPS_API_KEY`.
- Store credentials through ZS Vault. Never print, commit, persist, replay, log, or screenshot a key.
- Keep at most four Places lookups per OneBox run and one result page per lookup.
- Keep key-free Google Maps links and explicit degraded-state copy when either provider lane is unavailable.
- Add no Google SDK or new npm dependency.
- Read the relevant Next.js 16 route-handler documentation under `node_modules/next/dist/docs/` before changing an App Router route.
- Use test-driven development. Each production behavior starts with a focused test that fails for the intended reason.

## File and interface map

- `src/lib/tools/places.ts`: server-only Places Text Search client; exports `placesApiKey`, `placesConfigured`, and `findPlace`.
- `src/lib/tools/mapEmbed.ts`: key-free embed descriptor helpers and server-only destination builder; exports `MapEmbedQuerySchema`, `mapsEmbedConfigured`, `embedSearchQuery`, and `googleEmbedDestination`.
- `src/app/api/maps/embed/route.ts`: same-origin GET boundary that validates a query and redirects to Google Maps Embed without persisting the public key.
- `src/lib/contracts.ts`: changes `CardMap.embedUrl` to `CardMap.embedQuery`.
- `src/lib/pipeline.ts`: emits only bounded embed queries and key-free fallback URLs.
- `src/components/StageCard.tsx`: maps `embedQuery` to the same-origin route and keeps the no-map message.
- `src/lib/preflight.ts`: reports Places and Embed capability gaps independently and flags the legacy mixed key.
- `scripts/dev.sh` and `.env.example`: resolve and document the two Vault-backed variables.
- `scripts/smoke/google-maps-live.mjs`: one bounded, redacted provider smoke test.
- `scripts/e2e/maps-local.mjs`: rendered local map and degraded-state coverage.
- `docs/security/google-maps-local.md`: enabled APIs, restriction model, quota, exported fields, and user-controlled gates without credential values.

---

### Task 1: Split the server-side Places credential

**Files:**
- Create: `src/lib/tools/places.test.ts`
- Modify: `src/lib/tools/places.ts`
- Create: `src/lib/preflight.test.ts`
- Modify: `src/lib/preflight.ts`
- Modify: `src/lib/pipelineEvidence.test.ts`
- Modify: `src/lib/tools/maps.ts`

**Interfaces:**
- Produces: `placesApiKey(): string | undefined`
- Produces: `placesConfigured(): boolean`
- Preserves: `findPlace(query: string, runId?: string, maxResults?: number): Promise<FindPlaceResult>`
- Consumes later: `GOOGLE_PLACES_API_KEY`

- [ ] **Step 1: Write failing Places credential tests**

Create `src/lib/tools/places.test.ts` with focused tests that prove the server client ignores the Embed and legacy keys, sends the Places key only in the Google header, uses `pageSize`, and redacts a rejected response:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { findPlace, placesApiKey, placesConfigured } from "./places";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Places credential boundary", () => {
  it("uses only the server-side Places key", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect(placesApiKey()).toBe("places-test-key");
    expect(placesConfigured()).toBe(true);
    await findPlace("plumber in Austin, TX", undefined, 1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "places-test-key" });
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: "plumber in Austin, TX",
      pageSize: 1,
    });
  });

  it("does not fall back to Embed or legacy keys", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(await findPlace("bakery in Portland, OR")).toEqual({
      places: [],
      unavailable: "GOOGLE_PLACES_API_KEY is not set",
    });
  });

  it("does not copy provider response text into the unavailable message", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "request included places-test-key" } }),
      { status: 403 }
    )));
    const result = await findPlace("electrician in Reno, NV");
    expect(result.unavailable).toBe("places searchText unavailable (403)");
    expect(JSON.stringify(result)).not.toContain("places-test-key");
  });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `npm test -- src/lib/tools/places.test.ts`

Expected: FAIL because `placesApiKey` and `placesConfigured` do not exist, the client still reads `GOOGLE_MAPS_API_KEY`, uses `maxResultCount`, and returns provider response text.

- [ ] **Step 3: Implement the minimal Places split**

In `src/lib/tools/places.ts`:

```ts
export function placesApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || undefined;
}

export function placesConfigured(): boolean {
  return !!placesApiKey();
}
```

Update `findPlace` to call `placesApiKey()`, return `GOOGLE_PLACES_API_KEY is not set`, send `{ textQuery: query, pageSize: maxResults }`, and return only `places searchText unavailable (${res.status})` for non-2xx responses. Delete `mapsApiKey`, `mapsConfigured`, and key-bearing embed helpers from this file.

Use these exact provider-boundary branches:

```ts
const key = placesApiKey();
if (!key) return { places: [], unavailable: "GOOGLE_PLACES_API_KEY is not set" };

const res = await fetch(PLACES_SEARCH_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
    "X-Goog-FieldMask": FIELD_MASK,
  },
  body: JSON.stringify({ textQuery: query, pageSize: maxResults }),
});

if (!res.ok) {
  return { places: [], unavailable: `places searchText unavailable (${res.status})` };
}
```

Update `src/lib/tools/maps.ts` to import and call `placesConfigured`. Update its degraded copy to name Places independently.

- [ ] **Step 4: Write failing preflight tests**

Create `src/lib/preflight.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflight } from "./preflight";

afterEach(() => vi.unstubAllEnvs());

describe("Google Maps preflight", () => {
  it("reports Places and Embed as separate advisory capabilities", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const keys = preflight("none", {
      businessResearch: false,
      referenceResearch: false,
    }).advisory.map((issue) => issue.key);
    expect(keys).toEqual(["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_EMBED_API_KEY"]);
  });

  it("flags a legacy mixed key without treating either lane as configured", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    const result = preflight("none", {
      businessResearch: false,
      referenceResearch: false,
    });
    expect(result.advisory.map((issue) => issue.key)).toEqual([
      "GOOGLE_PLACES_API_KEY",
      "GOOGLE_MAPS_EMBED_API_KEY",
      "GOOGLE_MAPS_API_KEY",
    ]);
  });
});
```

- [ ] **Step 5: Run preflight tests and verify RED**

Run: `npm test -- src/lib/preflight.test.ts`

Expected: FAIL because preflight still emits one `GOOGLE_MAPS_API_KEY` advisory.

- [ ] **Step 6: Implement independent preflight advisories**

Replace the single Maps advisory with two lane-specific advisories. Add a third migration advisory only when the legacy variable is present and either new variable is absent. Do not include any environment value in copy or returned data.

```ts
if (!process.env.GOOGLE_PLACES_API_KEY) {
  advisory.push({
    key: "GOOGLE_PLACES_API_KEY",
    message: "Google Places competitor verification",
    fix: "add the restricted server-side Places key to ZS Vault",
  });
}
if (!process.env.GOOGLE_MAPS_EMBED_API_KEY) {
  advisory.push({
    key: "GOOGLE_MAPS_EMBED_API_KEY",
    message: "Google Maps market-map display",
    fix: "add the local-origin-restricted Maps Embed key to ZS Vault",
  });
}
if (
  process.env.GOOGLE_MAPS_API_KEY &&
  (!process.env.GOOGLE_PLACES_API_KEY || !process.env.GOOGLE_MAPS_EMBED_API_KEY)
) {
  advisory.push({
    key: "GOOGLE_MAPS_API_KEY",
    message: "legacy mixed-use Maps credential is ignored",
    fix: "split it into the Places and Embed Vault entries",
  });
}
```

Change `src/lib/pipelineEvidence.test.ts` to stub `GOOGLE_PLACES_API_KEY` instead of the legacy key.

- [ ] **Step 7: Verify Task 1 GREEN**

Run: `npm test -- src/lib/tools/places.test.ts src/lib/preflight.test.ts src/lib/pipelineEvidence.test.ts`

Expected: all selected tests PASS with no credential values in output.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/lib/tools/places.ts src/lib/tools/places.test.ts src/lib/tools/maps.ts src/lib/preflight.ts src/lib/preflight.test.ts src/lib/pipelineEvidence.test.ts
git commit -m "fix: separate the Places credential boundary"
```

---

### Task 2: Replace key-bearing map artifacts with a bounded embed boundary

**Files:**
- Create: `src/lib/tools/mapEmbed.ts`
- Create: `src/lib/tools/mapEmbed.test.ts`
- Create: `src/app/api/maps/embed/route.ts`
- Create: `src/app/api/maps/embed/route.test.ts`
- Modify: `src/lib/contracts.ts`
- Modify: `src/lib/contracts.test.ts`
- Modify: `src/lib/pipeline.ts`
- Modify: `src/components/StageCard.tsx`
- Create: `src/components/StageCard.test.tsx`
- Modify: `src/components/MarketFeature.tsx`
- Modify: replay and pipeline tests that construct `CardMap`

**Interfaces:**
- Produces: `MapEmbedQuerySchema: z.ZodString`
- Produces: `mapsEmbedConfigured(): boolean`
- Produces: `embedSearchQuery(query: string): string | undefined`
- Produces: `googleEmbedDestination(query: string): URL`
- Changes: `CardMap` from `{ embedUrl?: string }` to `{ embedQuery?: string }`

- [ ] **Step 1: Read the current Next.js route-handler documentation**

Run: `rg -n "Route Handlers|redirect" node_modules/next/dist/docs/01-app/03-api-reference node_modules/next/dist/docs/01-app/01-getting-started | head -40`

Read the matching files in full before implementing the route. Record no code change in this step.

- [ ] **Step 2: Write failing embed-helper tests**

Create `src/lib/tools/mapEmbed.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MapEmbedQuerySchema,
  embedSearchQuery,
  googleEmbedDestination,
  mapsEmbedConfigured,
} from "./mapEmbed";

afterEach(() => vi.unstubAllEnvs());

describe("map embed boundary", () => {
  it("accepts a trimmed bounded market query", () => {
    expect(MapEmbedQuerySchema.parse("plumber in Austin, TX")).toBe("plumber in Austin, TX");
    expect(() => MapEmbedQuerySchema.parse("x".repeat(201))).toThrow();
    expect(() => MapEmbedQuerySchema.parse("bad\r\nquery")).toThrow();
  });

  it("uses only the Embed key and returns a key-free descriptor", () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(mapsEmbedConfigured()).toBe(true);
    expect(embedSearchQuery("plumber in Austin, TX")).toBe("plumber in Austin, TX");
    expect(embedSearchQuery("plumber in Austin, TX")).not.toContain("key=");
    expect(googleEmbedDestination("plumber in Austin, TX").toString()).toBe(
      "https://www.google.com/maps/embed/v1/search?key=embed-test-key&q=plumber+in+Austin%2C+TX"
    );
  });

  it("does not use the Places or legacy key", () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "legacy-test-key");
    expect(mapsEmbedConfigured()).toBe(false);
    expect(embedSearchQuery("plumber in Austin, TX")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run helper tests and verify RED**

Run: `npm test -- src/lib/tools/mapEmbed.test.ts`

Expected: FAIL because `src/lib/tools/mapEmbed.ts` does not exist.

- [ ] **Step 4: Implement the bounded helper**

Create `src/lib/tools/mapEmbed.ts`:

```ts
import { z } from "zod";

export const MapEmbedQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value), "map query cannot contain line breaks");

function mapsEmbedApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_EMBED_API_KEY || undefined;
}

export function mapsEmbedConfigured(): boolean {
  return !!mapsEmbedApiKey();
}

export function embedSearchQuery(query: string): string | undefined {
  if (!mapsEmbedConfigured()) return undefined;
  return MapEmbedQuerySchema.parse(query);
}

export function googleEmbedDestination(query: string): URL {
  const key = mapsEmbedApiKey();
  if (!key) throw new Error("Google Maps Embed is not configured");
  const destination = new URL("https://www.google.com/maps/embed/v1/search");
  destination.searchParams.set("key", key);
  destination.searchParams.set("q", MapEmbedQuerySchema.parse(query));
  return destination;
}
```

- [ ] **Step 5: Write failing route tests**

Create `src/app/api/maps/embed/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/maps/embed", () => {
  it("redirects a bounded query without caching", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    const response = await GET(new Request(
      "http://127.0.0.1:3000/api/maps/embed?q=plumber%20in%20Austin%2C%20TX"
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.google.com/maps/embed/v1/search?key=embed-test-key&q=plumber+in+Austin%2C+TX"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects malformed or missing queries before reading credentials", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "embed-test-key");
    const response = await GET(new Request("http://127.0.0.1:3000/api/maps/embed?q="));
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid map query");
  });

  it("returns a redacted unavailable response when Embed is not configured", async () => {
    vi.stubEnv("GOOGLE_MAPS_EMBED_API_KEY", "");
    const response = await GET(new Request(
      "http://127.0.0.1:3000/api/maps/embed?q=plumber%20in%20Austin%2C%20TX"
    ));
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Map display is not configured");
  });
});
```

- [ ] **Step 6: Run route tests and verify RED**

Run: `npm test -- src/app/api/maps/embed/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 7: Implement the route**

Create `src/app/api/maps/embed/route.ts`:

```ts
import {
  MapEmbedQuerySchema,
  googleEmbedDestination,
  mapsEmbedConfigured,
} from "@/lib/tools/mapEmbed";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "origin",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  const parsed = MapEmbedQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) {
    return new Response("Invalid map query", { status: 400, headers: RESPONSE_HEADERS });
  }
  if (!mapsEmbedConfigured()) {
    return new Response("Map display is not configured", {
      status: 503,
      headers: RESPONSE_HEADERS,
    });
  }
  return new Response(null, {
    status: 307,
    headers: {
      ...RESPONSE_HEADERS,
      Location: googleEmbedDestination(parsed.data).toString(),
    },
  });
}
```

- [ ] **Step 8: Write failing contract and rendering tests**

Add a `CardMap` contract test that constructs `{ embedQuery, fallbackUrl, pins }` and rejects any legacy serialized `embedUrl` path used by schemas or adapters. Create `src/components/StageCard.test.tsx` and export a small pure helper from `StageCard.tsx`:

```ts
export function mapFrameSrc(map: CardMap): string | undefined {
  if (!map.embedQuery) return undefined;
  return `/api/maps/embed?q=${encodeURIComponent(map.embedQuery)}`;
}
```

The test expectation is the literal same-origin path and must also assert that it contains no `key=` substring.

- [ ] **Step 9: Run contract and rendering tests and verify RED**

Run: `npm test -- src/lib/contracts.test.ts src/lib/pipelineReplay.test.ts`

Expected: FAIL while `CardMap` and pipeline events still use `embedUrl`.

- [ ] **Step 10: Migrate map payloads and rendering**

Change `CardMap.embedUrl?: string` to `embedQuery?: string`. Update both map constructions in `src/lib/pipeline.ts` to call `embedSearchQuery(marketQuery)`. Update `CardMapView` to call `mapFrameSrc(map)` and render its existing degraded note when the helper returns undefined.

```ts
const joinedMap: CardMap = {
  embedQuery: embedSearchQuery(marketQuery),
  fallbackUrl: mapsSearchUrl(marketQuery),
  pins: joinedPins,
  note:
    mapsNote ??
    (joinedPins.length ? undefined : "No competitor resolved to a Google Places listing."),
};
```

```tsx
const frameSrc = mapFrameSrc(map);
return frameSrc ? (
  <iframe
    className="stage-card__map-frame"
    src={frameSrc}
    title="Competitor locations"
    loading="lazy"
    referrerPolicy="origin"
    allowFullScreen
  />
) : (
  <p className="stage-card__map-note">{map.note ?? "Map unavailable."}</p>
);
```

Update fixtures and tests that construct a `CardMap`. Do not add a legacy fallback that accepts a key-bearing URL. Historical events with `embedUrl` must ignore that unknown field and keep their key-free `fallbackUrl` rather than rendering the old URL.

- [ ] **Step 11: Verify Task 2 GREEN and scan persisted surfaces**

Run: `npm test -- src/lib/tools/mapEmbed.test.ts src/app/api/maps/embed/route.test.ts src/lib/contracts.test.ts src/lib/pipelineReplay.test.ts`

Run: `rg -n 'embedUrl|GOOGLE_MAPS_API_KEY' src scripts .env.example --glob '!*.map'`

Expected: tests PASS. The search returns no runtime use of `embedUrl` or legacy key, apart from the explicit legacy migration advisory test and documentation.

- [ ] **Step 12: Commit Task 2**

```bash
git add src/lib/tools/mapEmbed.ts src/lib/tools/mapEmbed.test.ts src/app/api/maps/embed/route.ts src/app/api/maps/embed/route.test.ts src/lib/contracts.ts src/lib/contracts.test.ts src/lib/pipeline.ts src/lib/pipelineReplay.test.ts src/components/StageCard.tsx src/components/StageCard.test.tsx src/components/MarketFeature.tsx
git commit -m "fix: keep Maps keys out of run artifacts"
```

---

### Task 3: Wire local Vault resolution and operator documentation

**Files:**
- Modify: `scripts/dev.sh`
- Modify: `.env.example`
- Create: `scripts/smoke/google-maps-live.mjs`
- Create: `scripts/smoke/google-maps-live.test.mjs`
- Modify: `package.json`
- Create: `docs/security/google-maps-local.md`

**Interfaces:**
- Consumes: Vault IDs `google_places_api_key` and `google_maps_embed_api_key`
- Produces: `node scripts/smoke/google-maps-live.mjs`

- [ ] **Step 1: Write a failing smoke-script behavior test**

Create `scripts/smoke/google-maps-live.test.mjs` with Node test runner. Launch the smoke script with a local HTTP endpoint override and a synthetic key in the child environment. Assert that the script sends `pageSize: 1`, prints only `status=ok places=1`, and never prints the synthetic key. Add a second case that returns 403 and expects a nonzero exit plus `status=provider-unavailable code=403` without the provider body.

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `node --test scripts/smoke/google-maps-live.test.mjs`

Expected: FAIL because `scripts/smoke/google-maps-live.mjs` does not exist.

- [ ] **Step 3: Implement the redacted one-call smoke script**

The script must:

```js
const endpoint = process.env.ONEBOX_PLACES_SMOKE_ENDPOINT
  || "https://places.googleapis.com/v1/places:searchText";
const key = process.env.GOOGLE_PLACES_API_KEY;
if (!key) {
  console.error("status=not-configured");
  process.exit(2);
}
```

Send exactly one request for a fixed local-service query with `pageSize: 1` and the production field mask. Print only status, HTTP code, and result count. Never print request headers, destination query parameters, response bodies, business details, or environment values. The main branch is:

```js
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.googleMapsUri",
      "places.websiteUri",
      "places.rating",
      "places.userRatingCount",
    ].join(","),
  },
  body: JSON.stringify({ textQuery: "plumber in Austin, TX", pageSize: 1 }),
});
if (!response.ok) {
  console.error(`status=provider-unavailable code=${response.status}`);
  process.exit(3);
}
const body = await response.json();
console.log(`status=ok places=${Array.isArray(body.places) ? body.places.length : 0}`);
```

- [ ] **Step 4: Verify the smoke script GREEN**

Run: `node --test scripts/smoke/google-maps-live.test.mjs`

Expected: PASS.

- [ ] **Step 5: Split local launcher resolution**

Update `scripts/dev.sh` to resolve missing variables with:

```zsh
export GOOGLE_PLACES_API_KEY="$(zsvault get google_places_api_key 2>/dev/null || true)"
export GOOGLE_MAPS_EMBED_API_KEY="$(zsvault get google_maps_embed_api_key 2>/dev/null || true)"
```

Keep the reads conditional. Print separate missing-lane warnings without values. Do not read `google_maps_api_key` and do not export `GOOGLE_MAPS_API_KEY`.

- [ ] **Step 6: Update environment and security documentation**

Replace the legacy variable in `.env.example` with the two new optional variables. The smoke script is invoked directly as `node scripts/smoke/google-maps-live.mjs`; `package.json` is hash-pinned by the program records and gains no alias.

Create `docs/security/google-maps-local.md` with:

- the exact two APIs and why no other Google API is enabled;
- the key restriction table from the approved design;
- the local origins approved by the owner;
- Places request fields and the business/location data exported to Google;
- the configured quota and current SKU source URL, recorded after Cloud setup;
- Vault IDs and verification commands that suppress values;
- degraded-state behavior and rotation procedure;
- explicit production, OAuth, deployment, and billing gates.

- [ ] **Step 7: Verify Task 3**

Run: `zsh -n scripts/dev.sh`

Run: `node --test scripts/smoke/google-maps-live.test.mjs`

Run: `npm run typecheck && npm run lint`

Expected: all commands exit 0. Lint may report only the repository's recorded pre-existing warnings.

- [ ] **Step 8: Commit Task 3**

```bash
git add scripts/dev.sh .env.example scripts/smoke/google-maps-live.mjs scripts/smoke/google-maps-live.test.mjs package.json docs/security/google-maps-local.md
git commit -m "chore: wire local Google Maps credentials"
```

---

### Task 4: Configure Google Cloud and ZS Vault at user-controlled gates

**Files:**
- Modify after verified configuration: `docs/security/google-maps-local.md`
- Modify after verified configuration: `docs/plans/2026-08-25-capability-roadmap.md`
- External state: Google Cloud project, two API keys, APIs, restrictions, and quota
- External state: ZS Vault entries `google_places_api_key` and `google_maps_embed_api_key`

**Interfaces:**
- Produces: restricted local credentials available to `scripts/dev.sh`
- User gates: sign-in, MFA, billing confirmation, consent, payment, and Vault unlock

- [ ] **Step 1: Open the correct Google Cloud project without authenticating for the user**

Use the real Chrome session and the `agent-login` workflow. Navigate to Google Cloud Console with `devzerosum@gmail.com`. If the session needs sign-in, account selection, MFA, consent, billing confirmation, or payment information, stop and ask Devin to complete that screen.

- [ ] **Step 2: Classify the existing OneBox Maps project and key**

Confirm the project owner/account, billing link, current APIs, current quotas, and the restrictions on the key corresponding to the Vault label `one-box-maps-0816`. Do not reveal or copy its full value. Reuse the project only if it is dedicated to OneBox Maps and billing is intentionally active.

- [ ] **Step 3: Enable only the required APIs**

Enable `Places API (New)` and `Maps Embed API`. Leave Maps JavaScript, Geocoding, Directions, Routes, Places legacy, Street View, and other Maps services disabled.

- [ ] **Step 4: Create and restrict the Places key**

Create `onebox-local-places`. Restrict it to Places API (New). Do not add a brittle laptop IP restriction. Set the smallest Cloud quota that still supports five local runs per minute, based on four maximum lookups per run. Record the exact quota control and current pricing source in `docs/security/google-maps-local.md`.

- [ ] **Step 5: Create and restrict the Embed key**

Create `onebox-local-embed`. Restrict it to Maps Embed API and Website application restrictions for the exact approved local HTTP origins used by OneBox. Add no production hostname.

- [ ] **Step 6: Store both keys through ZS Vault without printing them**

Ask Devin to unlock ZS Vault if `zsvault status` reports locked. For each key, let Devin place the value in the clipboard, then store it through stdin:

```bash
pbpaste | tr -d '\n' | zsvault add google_places_api_key --type api_key --label 'Google Places API New, OneBox local' --env-name GOOGLE_PLACES_API_KEY --yes --value-stdin
pbpaste | tr -d '\n' | zsvault add google_maps_embed_api_key --type api_key --label 'Google Maps Embed, OneBox local origins' --env-name GOOGLE_MAPS_EMBED_API_KEY --yes --value-stdin
```

Before replacing an existing canonical entry, preserve it and smoke-test the candidate in process memory as required by the credential-access skill. Never overwrite a working key solely because the label matches.

- [ ] **Step 7: Verify Vault resolution without values**

Run:

```bash
printenv GOOGLE_PLACES_API_KEY >/dev/null || zsvault get google_places_api_key >/dev/null
printenv GOOGLE_MAPS_EMBED_API_KEY >/dev/null || zsvault get google_maps_embed_api_key >/dev/null
```

Expected: both commands exit 0 and print no value.

- [ ] **Step 8: Run one approved Places call**

Start a shell through `./scripts/dev.sh` or export the two Vault reads only into the smoke process. Run `node scripts/smoke/google-maps-live.mjs` once.

Expected: exit 0 with `status=ok places=1`. Do not retry a billing, restriction, or quota failure until its Cloud configuration is inspected.

- [ ] **Step 9: Record redacted configuration evidence**

Update `docs/security/google-maps-local.md` with project ID, API names, restriction classes, quota, pricing documentation date, live smoke timestamp, HTTP outcome, and zero secret values. Change the Maps roadmap row to `Shipped for local development; production externally gated`. Commit the evidence:

```bash
git add docs/security/google-maps-local.md docs/plans/2026-08-25-capability-roadmap.md
git commit -m "docs: record local Maps activation evidence"
```

---

### Task 5: Rendered acceptance, security review, and exact-SHA verification

**Files:**
- Create: `scripts/e2e/maps-local.mjs`
- Modify: `package.json`
- Create: `docs/security/reviews/google-maps-local/security-review.json`
- Create: redacted command evidence under the same review directory
- Create: project screenshots under `docs/screenshots/2026-08-25-google-maps-local/`

**Interfaces:**
- Produces: `npm run test:e2e:maps-local`
- Produces: validated security report for the exact final SHA

- [ ] **Step 1: Write the failing rendered acceptance scenario**

Create `scripts/e2e/maps-local.mjs` using the existing Playwright script style. It must start OneBox on loopback with synthetic test keys, intercept the Google Embed destination with a deterministic map fixture, and cover:

- 1440, 768, and 390 pixel viewports;
- map heading, located count, iframe title, and fallback Google Maps link;
- no horizontal overflow or serious/critical Axe findings;
- keyboard focus and visible focus for the fallback link;
- missing Embed key with explicit display-unavailable copy and no iframe;
- missing Places key with competitors retained as unverified and explicit verification-unavailable copy;
- script-blocked and reduced-motion modes;
- no console errors, page errors, leaked synthetic keys, or external un-intercepted request.

- [ ] **Step 2: Run the E2E scenario and verify RED**

Run: `node scripts/e2e/maps-local.mjs`

Expected: FAIL until the fixture and final runtime wiring expose the expected map and lane-specific degraded states.

- [ ] **Step 3: Make only the minimal fixture and runtime corrections required by the scenario**

Do not add new product scope. Any discovered bug receives a focused failing unit or route test before its fix.

The E2E fixture may add only deterministic test data and request interception. Product corrections stay in the files owned by Tasks 1 and 2:

```js
await context.route("https://www.google.com/maps/embed/v1/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body><main aria-label='Test market map'>Map fixture</main></body></html>",
  });
});
```

- [ ] **Step 4: Verify rendered acceptance GREEN**

Run: `node scripts/e2e/maps-local.mjs`

Expected: PASS at all three viewports and both degraded modes. Save redacted screenshots without query secrets or key-bearing URLs.

- [ ] **Step 5: Run the full deterministic verification matrix**

Run each command separately and record exit codes:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
node scripts/e2e/evidence-review.mjs
node scripts/e2e/maps-local.mjs
```

Expected: tests, typecheck, build, smoke, evidence review, and Maps E2E pass. Lint has zero errors and only previously recorded warnings.

- [ ] **Step 6: Produce and validate the security review**

Use the `security-review` skill against `origin/main...HEAD`. Map every changed path to the six canonical surfaces. Record Google export fields and the owner approval in the export-policy item. Run the exact range scan:

```bash
gitleaks detect --source . --no-banner --redact --log-opts origin/main..HEAD
python3 /Users/zero/.codex/skills/security-review/scripts/validate_report.py --report docs/security/reviews/google-maps-local/security-review.json
```

Expected: range scan exit 0, validator exit 0, no open or unavailable finding, and verdict `PASS` or `PASS-WITH-ACCEPTED-RISK` only with explicit owner acceptance.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add scripts/e2e/maps-local.mjs package.json docs/security/reviews
git commit -m "test: verify local Google Maps activation"
```

- [ ] **Step 8: Run fresh exact-SHA reviews**

Invoke a fresh TypeScript/UI reviewer and an independent verifier on `git rev-parse HEAD`. The TypeScript/UI review must cover env separation, App Router response semantics, redirect safety, client rendering, error paths, and tests. The verifier must read the approved design and this plan, then execute every acceptance criterion against the exact SHA.

- [ ] **Step 9: Reconcile and publish without merging or deploying**

Confirm the worktree is clean, the remote branch matches the reviewed SHA, and the draft PR describes the local-only Maps activation, current billing/quota evidence, tests, and production gate. Push only after all required reviews pass. Wait for hosted CI and Blacksmith checks. Do not merge, deploy, add production origins, or promote.
