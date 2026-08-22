---
id: OBX-041
title: Freeze the six-purpose quality corpus and human rubric
status: ready
priority: P1
epic: Evaluation
depends_on: [OBX-021, OBX-022, OBX-040]
requirements: [REQ-UX-008, REQ-OPS-006]
evals: [EVAL-WEB-001, EVAL-WEB-002, EVAL-WEB-003, EVAL-QUAL-001, EVAL-QUAL-002, EVAL-QUAL-003]
---

## Problem

Output quality cannot be proven with one local-service prompt or token variation. The
engine needs structurally distinct, reviewable Website fixtures.

## Delivery

Freeze briefs, facts, references/no-reference states, expected topology, forbidden
outcomes, viewport checks, screenshots, and the named-human rubric for six website
purposes.

## Acceptance

- Corpus includes brochure, portfolio, SaaS marketing, editorial, campaign, and
  institutional fixtures.
- Every fixture defines structure and conversion intent without prescribing pixels.
- Non-brochure fixtures automatically reject a restyled local-service topology.
- Human record is build-hash-bound and cannot be produced by a model.
- Review requires all dimensions at least 3, mean at least 3.2, and no automatic
  rejection.

## Non-goals

Commerce checkout, Web application behavior, or native iOS.
