/**
 * Google Maps Platform lane — competitor verification + map rendering.
 *
 * TWO tiers, and the free one always works:
 *   1. mapsSearchUrl() / mapsPlaceUrl() — plain google.com/maps links. No key,
 *      no billing, no network call. Every competitor always gets one.
 *   2. findPlace() — Places API (New), which uses its own server-side
 *      credential. A missing key degrades the scan card; it does not fail the
 *      run.
 *
 * WHY a second Google key: the vault's `google_api_key` is an AI-Studio key
 * scoped to generativelanguage.googleapis.com. Verified 2026-08-13 — Places,
 * Geocoding and Maps Embed all reject it (401 CREDENTIALS_MISSING /
 * REQUEST_DENIED). Maps Platform needs its own key from a Cloud project with
 * billing + those APIs enabled. See README §Maps lane.
 *
 * Place verification doubles as the competitor classifier: a real local
 * operator resolves to a Google place whose website domain matches the site we
 * found. A listicle never does — which is exactly how "best-bakeries-in-
 * portland.com/guide" gets caught (see maps.ts classifyResult).
 */
import { addCost, CostCapExceeded } from "../runstate";
import type { Place } from "../contracts";

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Places API (New) Text Search, Pro SKU — the field mask below (location,
 * rating, websiteUri) puts it in the Pro tier at ~$32/1000 calls. One call per
 * competitor, so ~$0.13 per 4-competitor run. Tracked into costUsd like every
 * other metered call, so the $3 cap sees it.
 */
const PLACES_SEARCH_COST_USD = 0.032;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
].join(",");

export function placesApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || undefined;
}

export function placesConfigured(): boolean {
  return !!placesApiKey();
}

// ---------- tier 1: key-free links ----------

/** Google Maps search deep link. No key, always valid. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Deep link to a specific resolved place. */
export function mapsPlaceUrl(place: Place): string {
  return (
    place.mapsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      place.name
    )}&query_place_id=${encodeURIComponent(place.placeId)}`
  );
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
}

function toPlace(raw: RawPlace): Place | undefined {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (!raw.id || typeof lat !== "number" || typeof lng !== "number") return undefined;
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? "",
    address: raw.formattedAddress ?? "",
    lat,
    lng,
    rating: typeof raw.rating === "number" ? raw.rating : undefined,
    userRatingCount:
      typeof raw.userRatingCount === "number" ? raw.userRatingCount : undefined,
    mapsUri: raw.googleMapsUri ?? "",
    websiteUri: raw.websiteUri,
  };
}

export interface FindPlaceResult {
  places: Place[];
  /** set when the lookup could not run — no key, API error, quota */
  unavailable?: string;
}

/**
 * Text Search for a local business. Returns [] on a clean miss and
 * {unavailable} when the lane itself could not be used, so callers can tell
 * "no such business" apart from "Maps is not wired".
 */
export async function findPlace(
  query: string,
  runId?: string,
  maxResults = 3
): Promise<FindPlaceResult> {
  const key = placesApiKey();
  if (!key) return { places: [], unavailable: "GOOGLE_PLACES_API_KEY is not set" };

  let res: Response;
  try {
    res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: maxResults }),
    });
  } catch (err) {
    return { places: [], unavailable: err instanceof Error ? err.message : String(err) };
  }

  // Bill the call before reading the body — a 200 that we then fail to parse
  // was still a charged request. A cap trip is a hard stop, per runstate.
  if (runId && res.ok) {
    try {
      await addCost(runId, PLACES_SEARCH_COST_USD);
    } catch (err) {
      if (err instanceof CostCapExceeded) throw err;
    }
  }

  if (!res.ok) {
    return { places: [], unavailable: `places searchText unavailable (${res.status})` };
  }

  const json = (await res.json().catch(() => ({}))) as { places?: RawPlace[] };
  const places = (json.places ?? [])
    .map(toPlace)
    .filter((p): p is Place => p !== undefined);
  return { places };
}
