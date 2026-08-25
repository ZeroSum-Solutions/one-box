#!/usr/bin/env node

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PRODUCTION_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MIN_MS = 10;
const TEST_TIMEOUT_MAX_MS = 1_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

class ResponseTooLargeError extends Error {}

function endpointForSmoke() {
  if (process.env.NODE_ENV !== "test") return PLACES_ENDPOINT;

  const override = process.env.ONEBOX_PLACES_SMOKE_ENDPOINT;
  if (!override) return PLACES_ENDPOINT;

  try {
    const endpoint = new URL(override);
    const literalLoopback = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]";
    if (
      endpoint.protocol !== "http:"
      || !literalLoopback
      || endpoint.username
      || endpoint.password
    ) {
      return undefined;
    }
    return endpoint.toString();
  } catch {
    return undefined;
  }
}

function timeoutForSmoke() {
  const requested = process.env.ONEBOX_PLACES_SMOKE_TIMEOUT_MS;
  if (process.env.NODE_ENV !== "test" || !requested || !/^\d+$/.test(requested)) {
    return PRODUCTION_TIMEOUT_MS;
  }

  const timeout = Number(requested);
  return Number.isSafeInteger(timeout)
    && timeout >= TEST_TIMEOUT_MIN_MS
    && timeout <= TEST_TIMEOUT_MAX_MS
    ? timeout
    : PRODUCTION_TIMEOUT_MS;
}

async function readBoundedResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel().catch(() => {});
        throw new ResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const endpoint = endpointForSmoke();
if (!endpoint) {
  console.error("status=invalid-test-endpoint");
  process.exit(4);
}

const key = process.env.GOOGLE_PLACES_API_KEY;

if (!key) {
  console.error("status=not-configured");
  process.exit(2);
}

const fieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
].join(",");

try {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutForSmoke()),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({ textQuery: "plumber in Austin, TX", pageSize: 1 }),
  });

  if (!response.ok) {
    console.error(`status=provider-unavailable code=${response.status}`);
    process.exit(3);
  }

  const body = JSON.parse(await readBoundedResponse(response));
  console.log(`status=ok places=${Array.isArray(body.places) ? body.places.length : 0}`);
} catch (error) {
  if (error instanceof ResponseTooLargeError) {
    console.error("status=provider-unavailable code=response-too-large");
    process.exit(3);
  }
  console.error("status=provider-unavailable code=network");
  process.exit(3);
}
