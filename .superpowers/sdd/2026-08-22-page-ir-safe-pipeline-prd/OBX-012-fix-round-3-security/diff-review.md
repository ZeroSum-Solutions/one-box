# OBX-012 Fix Round 3 security review

## Authentication

No identity, session, credential lifecycle, role, tenancy, or login boundary changed.

## Authorization

Production hero compilation now carries the bytes accepted by the existing
stable no-follow authorization read through to candidate output. The source
path is not reopened after authorization. Evidence build continuation also
denies stale visual-QA authority: an old approval cannot complete, preview,
pause, or bypass an incomplete build. Tests cover deterministic source-path
substitution and stale approved QA with a non-built failed candidate.

## Untrusted input

The run-owned hero path remains closed under the existing run asset boundary,
and its regular-file, nonlinked stable read remains unchanged. Retaining the
authorized buffer removes the second path resolution that could follow a later
substitution. Compression consumes only the candidate copy, and the candidate
manifest continues to bind its final bytes.

## Prompt injection

No prompt, retrieval, model-message, tool-call, or tool-result boundary changed.

## Secrets

The exact immutable snapshot range was scanned with gitleaks; no leaks were found.

## Export policy

No telemetry, webhook, email, object-store, model-provider, redirect, download,
or other external export was added or changed. Export state is `NONE`.
