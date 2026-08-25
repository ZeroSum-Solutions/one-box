# Google Maps local activation

## Scope and activation state

This runbook covers local OneBox development only. The activation state is
**Not yet activated**: no Google Cloud project, billing attachment, API
enablement, quota, pricing/SKU source, Vault value, or live provider outcome
has been verified for this runbook.

The only approved APIs are:

- **Places API (New)** for server-side Places Text Search competitor
  verification.
- **Maps Embed API** for the market-map iframe destination.

No other Google API is approved for this lane. In particular, Maps JavaScript,
Geocoding, Directions, Routes, Places legacy, Street View, autocomplete, and
photo services are outside the approved capability and must remain disabled
when the two approved APIs are configured.

## Credential restrictions

| Key lane | API restriction | Application restriction | Additional control |
| --- | --- | --- | --- |
| Places | Places API (New) only | No IP restriction for the local laptop because its outbound IP can change | Server-only storage and a conservative request quota |
| Embed | Maps Embed API only | Website restrictions for the owner-approved loopback origins below | No production hostname |

The owner-approved local HTTP hosts are `localhost` and `127.0.0.1`. No Cloud
referrer rule is recorded while activation remains incomplete. The OneBox
launcher defaults to `http://127.0.0.1:3000`, and `localhost` is used by local
browser and test flows. When configured, the Embed key's referrer restrictions
must cover only those two loopback hosts; do not add a LAN address, preview
URL, staging hostname, or production hostname.

## Data sent to Google

Each Places Text Search request sends a fixed local-service query with one
result page. The request exports the search category and location represented
by that query. When resolving an individual competitor, the query can also
contain the candidate business name.

The response field mask is limited to:

- `places.id`
- `places.displayName`
- `places.formattedAddress`
- `places.location`
- `places.googleMapsUri`
- `places.websiteUri`
- `places.rating`
- `places.userRatingCount`

This supports business matching, address and map location, map links, website
matching, rating, and rating-count display. Do not request photos, route data,
autocomplete data, or unrelated business details.

## Cloud evidence record

| Record | Current state |
| --- | --- |
| Cloud project and billing | Not yet activated |
| Enabled APIs and restrictions | Not yet activated |
| Configured quota | Not yet activated |
| Current SKU source URL | Not yet activated |
| Live smoke result | Not yet activated |

After owner-gated Cloud setup, record only verified, redacted values in this
table: the selected project ID, API restriction classes, exact quota control,
the current Google pricing/SKU documentation URL and date, and the live smoke
timestamp/status. Never record a key value.

## Vault and local verification

The two canonical Vault IDs are `google_places_api_key` and
`google_maps_embed_api_key`. `scripts/dev.sh` resolves each only when its
corresponding environment variable is missing, and does not print either
value. The legacy mixed-use `GOOGLE_MAPS_API_KEY` is not a fallback.

After the owner has completed Cloud setup and unlocked Vault, verify presence
without emitting values:

```zsh
printenv GOOGLE_PLACES_API_KEY >/dev/null || zsvault get google_places_api_key >/dev/null
printenv GOOGLE_MAPS_EMBED_API_KEY >/dev/null || zsvault get google_maps_embed_api_key >/dev/null
```

Then run one bounded live check:

```zsh
npm run smoke:maps:live
```

It makes one Places request with `pageSize: 1` and emits only a redacted status,
HTTP code when unavailable, and result count. Do not retry a billing,
restriction, or quota failure until the Cloud configuration has been inspected.

## Degraded behavior and rotation

If the Places key is missing, rejected, over quota, or otherwise unavailable,
the scan continues with unverified competitors and explicit Places-unavailable
copy. If the Embed key is unavailable, the map display is unavailable while
the key-free Google Maps fallback link remains. Neither state turns an
infrastructure problem into an empty market.

Rotate one lane at a time: create a new key restricted to that lane, obtain
owner approval for any Cloud or Vault action, store the replacement under the
same canonical Vault ID without printing it, verify presence with the redacted
commands above, run the single bounded smoke check for the Places lane, and
then retire the superseded Cloud key. Keep the other lane unchanged until its
own rotation is separately verified.

## Explicit gates

- Google sign-in, account selection, MFA, consent, billing confirmation, and
  payment actions are owner-controlled.
- This integration does not use end-user Google OAuth. Adding OAuth requires a
  separate approved design and review.
- Production origins, Vercel, DNS, preview/staging promotion, deployment, and
  production credentials are out of scope. Each requires a separate owner
  authorization.
- Do not run the live smoke command until billing, API restrictions, quota, and
  Vault setup have been verified by the owner-gated activation task.
