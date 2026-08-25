#!/usr/bin/env node

const endpoint = process.env.ONEBOX_PLACES_SMOKE_ENDPOINT
  || "https://places.googleapis.com/v1/places:searchText";
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

  const body = await response.json();
  console.log(`status=ok places=${Array.isArray(body.places) ? body.places.length : 0}`);
} catch {
  console.error("status=provider-unavailable code=network");
  process.exit(3);
}
