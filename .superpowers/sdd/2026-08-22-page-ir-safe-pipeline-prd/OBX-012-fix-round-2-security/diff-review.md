# OBX-012 Fix Round 2 security review

## Authentication

No identity, session, credential lifecycle, role, tenancy, or login boundary changed.

## Authorization

The production pipeline now denies every post-build continuation unless the
candidate is exactly present and `promotable`, and a promotable reconnect parks
before pause, preflight, cost-cap, or execution. The fixture live publisher is
deny-by-default unless `ONEBOX_TEST_FIXTURE_PUBLISH=1`, remains forbidden in
production, and is mechanically unreachable from every non-test/spec
TypeScript source under `src/`. Tests cover missing, failed, ready, promotable,
over-cap, no-flag, and production cases.

## Untrusted input

Fixture staging and publish paths remain caller-supplied filesystem inputs, but
the helper is test-only, affirmative-authorized, and production-denied. Rename
failure does not broaden the target: restoration uses the fixed retired sibling.
If both renames fail, both errors surface and the retired snapshot remains.

## Prompt injection

No prompt, retrieval, model-message, tool-call, or tool-result boundary changed.

## Secrets

The exact committed snapshot range was scanned with gitleaks; no leaks were found.
The new environment flag is a literal authorization switch, not a credential.

## Export policy

No telemetry, webhook, email, object-store, model-provider, redirect, download,
or other external export was added or changed. Export state is `NONE`.
