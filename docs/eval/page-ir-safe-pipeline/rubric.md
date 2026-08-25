# Human visual and product-quality rubric

This rubric evaluates the promoted output, not the model, prompt, or implementation
effort. The reviewer must be a named human and must inspect the desktop, tablet, and
mobile renders plus the runnable static site.

Score each dimension from 0 to 4 and cite visible evidence.

| Score | Meaning |
|---|---|
| 0 | Broken, absent, unsafe, or unrelated to the brief |
| 1 | Major defects; generic or structurally inappropriate |
| 2 | Usable but below the intended product bar; obvious repair required |
| 3 | Strong and client-ready with only minor non-blocking refinements |
| 4 | Excellent, specific, coherent, and unusually well resolved |

## Dimensions

| Dimension | Reviewer question |
|---|---|
| Brief fidelity | Does the site communicate the approved business, audience, facts, and action without invention? |
| Purpose topology | Does the section structure visibly fit this website purpose, or is it the local-service skeleton in different clothes? |
| Hierarchy | Can a first-time visitor understand the offer, proof, and next action in the intended order? |
| Composition and spacing | Are density, rhythm, alignment, and whitespace coherent at all three widths? |
| Typography and color | Do type and color form an intentional, accessible system rather than decorative variation? |
| Business specificity | Would the output still make sense if the business name were removed, or is it clearly specific to this client and category? |
| Reference alignment | Are approved reference lessons translated into client-owned decisions without copying composition or branding? |
| Responsive behavior | Does the topology adapt intentionally at tablet/mobile rather than merely stack? |
| Interaction and motion | Are interactions purposeful, safe, and respectful of reduced motion? |
| Craft and completeness | Are empty, error, focus, hover, image, and conversion states polished enough for a client review? |

## Passing rule

- No automatic rejection.
- No dimension below 3.
- Mean score at least 3.2.
- `Purpose topology`, `Business specificity`, and `Responsive behavior` each score at
  least 3.
- All blocking mechanical gates pass before scoring.
- The review is bound to the promoted build SHA-256.

## Automatic rejection

- Any invented business fact or testimonial.
- Any broken blocking gate.
- Missing desktop, tablet, or mobile evidence.
- A fixture whose section order/topology is materially the frozen local-service shape
  when the fixture purpose is not `brochure-local-service`.
- Copied reference branding or composition without documented synthesis.
- Hidden paid fallback or missing source/build provenance.
- A Web app or iOS deliverable represented as supported Phase 1 output.
- A site served before candidate gates passed.
- A Page IR edit that disappears after restart or rebuild, or a Page IR run whose
  compiled files were mutated outside the IR-to-candidate lifecycle.

## Reviewer record

The record includes reviewer name, reviewer kind `human`, attestation, timestamp,
fixture ID, build hash, per-dimension score, evidence, findings, and overall pass/fail.
Automated or model findings may be attached separately but cannot populate this record.
