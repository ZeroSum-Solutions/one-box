# Los Angeles appointment-journey field study

Status: **audited recommendation; human approval required before playbook freeze**
Captured: **2026-08-26**
Scope: cosmetic dentistry and orthodontics; medical spas and aesthetic clinics; physical therapy and sports rehabilitation in greater Los Angeles.

## Decision

The booking-versus-request binary fails the field test.

ONE BOX should keep one shared **appointment-acquisition family**, but it must not treat every appointment CTA as the same archetype. The evidence supports three distinct completion contracts:

1. **Confirmed appointment** — the visitor chooses real inventory and receives a reserved care or treatment slot.
2. **Booked consultation** — the visitor reserves a real consultation slot, but care or treatment is still unscheduled.
3. **Appointment request** — the visitor supplies preferences and the business must accept, match, verify, or schedule them later.

`Contact only` is an observed fallback, not a target quality mode. `Hybrid` is a router: the service, location, or provider determines which completion contract applies.

The homepage shell can remain shared. The completion contract cannot.

## Why the distinction matters

Calling all three outcomes “Book now” creates a false promise. The visitor may believe a slot is reserved when the business has received only a lead. It also produces the wrong interface, analytics event, confirmation copy, accessibility behavior, failure states, and operational handoff.

The implementation rule is therefore:

> Determine the inventory authority first; generate the CTA and completion experience second.

If a business system exposes live inventory, the site may promise a booking. If staff must review anything before accepting the time, the site must call it a request. If only the consultation is reserved, the confirmation must say exactly that.

## Method

- Discovery combined current commercial-intent search, local review/ranking sources, and direct operator sites.
- EGO Lite captured 44 homepage or endpoint candidates. Three did not qualify for a normal denominator: one failed to load, one had become a domain-sale page, and one rendered unrelated gambling copy.
- The final local core contains 13 dentistry/orthodontic operators, 13 med-spa operators, and 12 PT/sports-rehab operators.
- Every core homepage was inspected for section sequence, CTA language, and operational evidence.
- Every appointment endpoint was opened. Representative flows were advanced through service, location, provider, date, and time selection where the controls were public. No identity was entered, no payment was initiated, and no form or appointment was submitted.
- A CTA label was never enough to classify a booking. Live inventory, an explicit non-guarantee, or stated staff follow-up controlled the verdict.

The journey evidence is in [evidence-matrix.csv](./evidence-matrix.csv). The homepage-section counts are reproducible from [homepage-section-coding.csv](./homepage-section-coding.csv).

### Classification rule

- `confirmed_appointment` requires inspectable live inventory for a care or treatment visit.
- `booked_consultation` requires inspectable live inventory for a consultation while making no claim that care or treatment is reserved.
- `appointment_request` applies if and only if the flow has both (a) a scheduling payload, such as preferred availability, and (b) an explicit staff-confirmation or scheduling-follow-up promise.
- `contact_only` applies to every non-inventory lead or contact path that fails either conjunct. A preferred-date form without a follow-up promise is contact-only; a callback promise without preferred availability is also contact-only.
- `indeterminate` means the public evidence was insufficient. Labels, vendor identity, and apparent scheduler chrome do not upgrade it.

## Observed journey distribution

| Vertical | Core operators | Confirmed care appointment | Booked consultation only | Appointment request | Contact only | Indeterminate |
|---|---:|---:|---:|---:|---:|---:|
| Cosmetic dentistry + orthodontics | 13 | 0 | 1 | 2 | 6 | 4 |
| Med spas + aesthetic clinics | 13 | 1 | 1 | 2 | 2 | 7 |
| PT + sports rehabilitation | 12 | 1 | 2 | 3 | 4 | 2 |

The architectural recommendation uses only high-confidence rows:

| Vertical | High-confidence operators | Confirmed care appointment | Booked consultation only | Appointment request | Contact only |
|---|---:|---:|---:|---:|---:|
| Cosmetic dentistry + orthodontics | 9 | 0 | 1 | 2 | 6 |
| Med spas + aesthetic clinics | 6 | 1 | 1 | 2 | 2 |
| PT + sports rehabilitation | 10 | 1 | 2 | 3 | 4 |

These are field-study observations, not market-share estimates. The sample was selected for quality and contrast, not random prevalence. Medium- and low-confidence rows are reported for completeness but excluded from the decision numerator.

## Cross-vertical architecture

### Shared acquisition shell

All three verticals can share the pre-conversion topology:

1. state the outcome and local fit;
2. route the visitor to the right service, condition, or concern;
3. establish practitioner and facility credibility;
4. show representative outcomes and trustworthy reviews;
5. explain the next step and material constraints;
6. resolve location, provider, payment, insurance, or eligibility questions;
7. present an action whose wording matches the completion contract;
8. show a truthful success state and recovery path.

This is a topology, not a fixed visual template. Section order and emphasis still vary by vertical.

### Completion contracts

| Contract | Inventory authority | Required success message | Required recovery |
|---|---|---|---|
| `confirmed_appointment` | Live scheduler | Reserved date, time, service, location, and provider when applicable | Reschedule/cancel path; unavailable-slot recovery |
| `booked_consultation` | Live consultation calendar | Consultation is reserved; treatment is not | Reschedule/cancel path; explain the next care-scheduling step |
| `appointment_request` | Staff or clinical team | Request received; no slot promised; response owner and window | Call/text/email alternative; overdue-response escalation |
| `contact_only` | None | Message or call channel only | Visible phone/hours and an accessible alternative |

### Hybrid router

The route may vary by:

- service ambiguity or risk;
- new versus returning patient;
- location;
- provider;
- insurance, referral, or eligibility status;
- deposit or cancellation policy;
- clinical appointment versus class, consultation, or follow-up.

The router chooses one completion contract. It is not a fourth confirmation state.

## Vertical blueprint 1: cosmetic dentistry and orthodontics

### What the field showed

The category is consultation-first. In the nine high-confidence rows, two satisfied the strict appointment-request rule, six offered only contact channels, and one—[The Practice Beverly Hills](https://thepracticebh.com/)—exposed live inventory for a cosmetic consultation through NexHealth. None of the observed dental flows verified a care or treatment appointment.

Premium cosmetic sites sell trust in judgment before they sell a procedure. Orthodontic sites add treatment options, family/age fit, technology, insurance, and payment-plan reassurance. Both converge on a consultation as the commercial handoff.

### Recommended homepage topology and observed presence

The sequence below is a design recommendation synthesized from the field evidence. The counts measure section presence only; they do not claim a statistically observed order.

| Recommended module | Observed presence | Quality requirement |
|---|---:|---|
| Outcome-led hero + consultation action | 13/13 | Name the specialty, geography, and next step without guaranteeing candidacy or outcome |
| Practitioner authority or signature point of view | 13/13 | Real clinician, licensure/credentials, method, and non-generic reason to trust their judgment |
| Transformations, representative cases, or treatment proof | 9/13 | Comparable cases, consent-safe media, and context; avoid decontextualized glamour grids |
| Treatment and concern router | 13/13 | Help visitors self-locate without diagnosing them |
| Process, consultation contents, or technology | 10/13 | Explain evaluation, records/scans, plan, and what happens after the inquiry |
| Reviews, press, or third-party recognition | 11/13 | Attribute every claim and avoid substituting celebrity language for clinical proof |
| Financing, insurance, and fit constraints | 7/13 | State what is known and convert unknowns into discovery questions |
| FAQ + final consultation action | 6/13 | Resolve permanence, timeline, cost, discomfort, maintenance, and emergency boundaries |
| Location, hours, phone, and response promise | 13/13 | Local proof and a truthful request-confirmation expectation |

### Vertical quality failures

- Preferred date/time fields presented as if they were live inventory.
- “Book now” leading to a generic contact form.
- Before/after media without case context or consent-safe presentation.
- Awards, media, or celebrity language that cannot be traced.
- No distinction between cosmetic consultation, general exam, emergency visit, and orthodontic evaluation.
- Content-integrity failures. One reviewed orthodontic homepage visibly rendered unrelated gambling copy and is excluded from the quality denominator.

## Vertical blueprint 2: med spas and aesthetic clinics

### What the field showed

Med spas show a clear case for a service-level router. Standardized, lower-ambiguity services can expose real treatment inventory, while complex concerns and higher-ambiguity procedures can begin with a paid or complimentary consultation or staff-confirmed request. The strict high-confidence subset contained one confirmed treatment appointment, one booked consultation, two requests, and two contact-only paths. Seven additional core rows remain indeterminate because their public flows did not expose enough evidence.

[Cienega Medical](https://cienegaspa.com/) showed the clearest public treatment-booking evidence: treatment option, price, multiple locations, provider ID, and live 15-minute slots. [Skinsation LA](https://skinsationla.com/) exposed duration, deposit, staff assignment, date, timezone, and available times for a virtual consultation—not verified treatment inventory. [Skin Works Medical Spa](https://skinworksmed.com/) provided a useful request counterexample: its scheduler explicitly says requested times are not guaranteed until staff confirms.

### Recommended homepage topology and observed presence

The sequence below is a design recommendation synthesized from the field evidence. The counts measure section presence only; they do not claim a statistically observed order.

| Recommended module | Observed presence | Quality requirement |
|---|---:|---|
| Outcome-led hero + book/consult action | 13/13 | Pair the aspiration with practitioner-led restraint and a truthful action |
| Concern or treatment-category router | 13/13 | Route by concern and service; surface consultation when the visitor is unsure |
| Medical oversight and provider proof | 10/13 | Name the medical director and treating providers; distinguish role, license, and supervision |
| Results, before/after, or visual treatment proof | 4/13 | Show representative results and meaningful qualifiers, not only idealized imagery |
| How selection and consultation work | 7/13 | Explain candidacy, deposits, provider choice, and when treatment may happen same day |
| Pricing, offer, membership, or financing | 10/13 | Separate deposit, starting price, full price, and “price varies” clearly |
| Reviews and reputation proof | 8/13 | Prefer attributable local reviews and real counts over generic testimonials |
| Safety, policies, contraindication boundaries, or FAQ | 4/13 | Make age, cancellation, consultation, and clinical escalation rules visible |
| Location + repeated action | 13/13 | Preserve service/location/provider context when handing off to the scheduler |

### Vertical quality failures

- Treating a deposit as if it were the full treatment price.
- Hiding the medical director or conflating physician oversight with the person performing the procedure.
- Letting a booking widget erase the service, location, or provider context chosen on the site.
- Sending every service through the same completion mode.
- Broken or placeholder scheduler pages.
- Aggressive offer language without clear expiry, eligibility, or cancellation terms.

## Vertical blueprint 3: physical therapy and sports rehabilitation

### What the field showed

PT commonly requires a staff handoff because insurance verification, referral status, condition fit, location, and clinician matching may precede care. In the ten high-confidence rows, four were contact-only, three were appointment requests, two booked phone consultations, and only [Prehab 2 Perform](https://www.prehab2perform.com/) exposed a verified clinical appointment slot. VERT's PT path was contact-only; its advertised class reservation path remains an unverified service-level router candidate.

### Recommended homepage topology and observed presence

The sequence below is a design recommendation synthesized from the field evidence. The counts measure section presence only; they do not claim a statistically observed order. The single `process_or_method` code supports the combined care-model/process row rather than two independent frequency claims.

| Recommended module | Observed presence | Quality requirement |
|---|---:|---|
| Patient outcome hero + first-step action | 11/12 | Name the population, problem space, and first step; avoid guaranteed recovery claims |
| Conditions, sports, or service-fit router | 12/12 | Let patients recognize fit and urgent/non-fit boundaries without self-diagnosis |
| Care model + assessment-to-return process | 8/12 | State visit length, one-to-one care, aide use, evaluation, progression, and return criteria |
| Clinician credentials and specialty fit | 9/12 | Real DPTs, relevant board certification, and who will actually deliver care |
| Patient outcomes and reviews | 10/12 | Use attributable functional outcomes; avoid medical promises |
| Insurance, direct access, referral, and pricing | 4/12 | Make known coverage and verification steps clear; do not imply coverage before verification |
| Location, hours, response window, and action | 12/12 | Keep the selected location/service in the request and state who follows up when |

### Vertical quality failures

- Calling a phone consultation a physical-therapy appointment.
- Collecting insurance or medical detail without explaining privacy, necessity, and follow-up.
- Hiding whether visits are one-to-one or delegated.
- Treating group class inventory as clinical appointment inventory.
- “Contact us” as the only conversion path without response ownership or timing.
- Expired domains and dead booking shells.

## Candidate ONE BOX contract

This is a proposed schema boundary, not an implementation authorization:

```ts
type JourneyMode =
  | "confirmed_appointment"
  | "booked_consultation"
  | "appointment_request";

type JourneyFallback = "contact_only";

type ModeScope = "site" | "service" | "location" | "provider";

interface AppointmentJourneyContract {
  mode: JourneyMode | JourneyFallback;
  scope: ModeScope[];
  inventoryAuthority: "live" | "staff_confirmed" | "none";
  ctaLabel: string;
  completionPromise: string;
  responseOwner?: string;
  responseWindow?: string;
  requiresService: boolean;
  requiresLocation: boolean;
  requiresProvider: boolean;
  requiresEligibilityCheck: boolean;
  requiresDeposit: boolean;
  rescheduleOrRecoveryPath: string;
}
```

### Generation gates

ONE BOX should fail generation or downgrade the CTA when:

- `confirmed_appointment` lacks inspectable live inventory;
- the success state omits the reserved date/time or implies treatment when only a consultation was booked;
- `appointment_request` omits response owner or response window;
- a preferred date/time is styled as guaranteed availability;
- a third-party handoff drops service, location, provider, or mode context;
- deposit and treatment price are conflated;
- insurance is presented as accepted or covered without an evidence source;
- the booking endpoint is broken, expired, or visually inconsistent enough to undermine trust;
- the source page contains unrelated or compromised content.

## Recommended skill split

Do not build a single “booking versus request” skill. Build one coordinator and three bounded evaluators:

- **Journey classifier** — establishes inventory authority, scope, evidence confidence, and permitted completion contract.
- **Vertical blueprint extractor** — derives page structure and evidence modules for the niche and geography.
- **Journey verifier** — opens the final endpoint and checks semantics, context preservation, success copy, recovery, mobile behavior, and accessibility without submitting a real appointment.

The classifier must run before copy or UI generation. The verifier must run after integration. Neither may upgrade an indeterminate system to confirmed booking.

## Limits

- This is a purposive Los Angeles sample, not a statistically representative census.
- Review counts and external rankings were discovery signals, not independent proof of design or clinical quality.
- Some third-party schedulers gate availability behind identity. Those rows carry medium or low confidence and remain non-authoritative.
- No form, payment, or appointment was submitted, so post-submit messages were evaluated only where the pre-submit product exposed the promise.
- Medical, dental, privacy, and advertising compliance require separate expert review before production rules are frozen.

## Adversarial audit

The first-pass [Grok 4.6 audit](../../audits/grok-4.6/la-appointment-journey-field-study.json) rejected several optimistic classifications. This revision accepts its seven findings:

- The Practice and Skinsation are booked consultations, not confirmed care.
- Identity-gated systems remain indeterminate when no public time inventory is visible.
- Uninspectable embedded schedulers remain indeterminate regardless of their labels.
- Homepage-frequency claims now have row-level coding.
- `appointment_request` and `contact_only` use a stricter, reproducible boundary.
- `hybrid` is a router candidate, never a completion state.
- Medium- and low-confidence rows are excluded from decision numerators.

Residual uncertainty remains where a third-party scheduler requires identity, renders no content, or hides its post-submit promise. The architecture does not infer through those gaps.

The [second-pass audit](../../audits/grok-4.6/la-appointment-journey-field-study-v2.json) then found that three dental rows still failed the published request rule and that section-presence counts had been over-described as observed page order. Those rows are now contact-only, all affected denominators are recounted, and the blueprint tables are labeled as recommended topology with observed presence—not measured sequence.

## Human decision requested

Approve, revise, or reject the following architecture:

> Adopt one appointment-acquisition family with three non-interchangeable completion contracts, selected at service/location/provider scope and verified against the live endpoint. Preserve `contact_only` as a fallback and `hybrid` as a router, not as completion states.

Approval should authorize a playbook and contract-design phase. It should not directly authorize production implementation.
