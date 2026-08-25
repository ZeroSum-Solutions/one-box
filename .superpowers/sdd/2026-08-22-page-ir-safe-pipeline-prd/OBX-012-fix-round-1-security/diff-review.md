# OBX-012 Fix Round 1 security diff review

## Authentication

No identity, session, token, cookie, or login boundary changed.

## Authorization

Durable build authorization now reads `run.json` through the existing stable no-follow, nonlinked regular-file boundary.

The parsed durable run ID must equal the validated requested run before candidate or staging output; symbolic links, hard links, and cross-run IDs fail closed.

Evidence and legacy terminal replay both require the absence of an unserved promotable candidate, preventing stale live approval from authorizing completion.

## Untrusted input

The validated run ID remains the only production path authority, and the stable reader rejects linked or changing authorization files before parsing.

The import-boundary test scans production app and pipeline sources only; it executes no discovered source or caller-controlled path.

## Prompt and tool control

No prompt, model, retrieval, or tool-call boundary changed.

## Exports

No external export is added or changed; the diff is limited to run-local authorization, replay control, tests, and documentation.

## Findings

No security findings.
