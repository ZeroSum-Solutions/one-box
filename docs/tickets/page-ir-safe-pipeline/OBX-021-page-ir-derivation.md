---
id: OBX-021
title: Derive Page IR from approved version-bound inputs
status: ready
priority: P0
epic: Page IR
depends_on: [OBX-020]
requirements: [REQ-IR-005, REQ-OPS-001, REQ-UX-008]
evals: [EVAL-IR-004, EVAL-QUAL-001, EVAL-QUAL-003]
---

## Problem

Approved evidence, design, content, and layout decisions need one traceable handoff to
the compiler. Reading “latest” files or unapproved drafts makes replay and approval
meaningless.

## Delivery

Build a pure derivation boundary that accepts explicit approved artifact versions and
hashes, constructs Page IR, validates it, and records source lineage.

## Acceptance

- Draft, revision-requested, superseded, cross-run, or hash-mismatched artifacts fail.
- Derivation uses explicit version references and produces a stable Page IR hash.
- Model output, if used upstream, is parsed through the closed contracts before use.
- The six-purpose fixtures express purpose-appropriate structure rather than one
  source-code registry order.
- Reference lessons remain traceable and client-owned.

## Non-goals

Automatic approval or reading unversioned “latest” evidence.
