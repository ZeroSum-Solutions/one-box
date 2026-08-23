# OBX-012 security diff review

## Authentication

No identity, session, token, cookie, or login boundary changed.

## Authorization

Production compilation now denies a missing durable run before filesystem writes and repeats the Website-only target decision.

Supplied build inputs must match stable durable run-owned artifacts before candidate compilation; the standalone publish helper is test-only and rejects production runtime use.

## Untrusted input

Run IDs still pass the closed run-ID schema before path derivation, and every build input is schema-parsed from a stable regular non-linked file.

Hero assets must remain below the authorized run's `assets/` root; candidate receipt bytes are parsed, hash-checked, and rebound immediately before disposition.

## Prompt and tool control

The old build-stage model repair prompt was removed. The replacement runs deterministic candidate gates and does not send gate reports or candidate files to a model or tool.

## Exports

No new external export is reachable. This change eliminates the build-stage repair-model egress and otherwise performs only run-local filesystem operations.

## Findings

No security findings.
