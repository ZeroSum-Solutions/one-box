# Live capture log

Capture date: 2026-08-26
Browser: EGO Lite isolated task space 2
Mutation boundary: no identity entered; no payment initiated; no form or appointment submitted.

## Confirmed-slot proof

### The Practice Beverly Hills

- Endpoint redirected to NexHealth.
- Flow exposed new versus returning patient and nine appointment types.
- Selecting `Consultation - Cosmetic (Virtual or In-Person)` exposed:
  - provider: Dr. Dustin Cohen;
  - location: 8920 Wilshire Blvd, Suite 410;
  - August 26, 2026 at 9:00 AM;
  - August 27, 2026 at 11:00 AM.

Classification: `booked_consultation`. The observed inventory was a cosmetic consultation; treatment was not reserved.

### Cienega Medical

- Service path: Facials, Skincare + More → HydraFacial MD → HydraFacial MD Express.
- Product details: $149; 30-minute end time encoded in the selected slot URL.
- West Hollywood exposed 30 times for the captured week, beginning at 10:00 AM in 15-minute increments.
- Santa Monica and Calabasas explicitly displayed no availability for that week.

Classification: `confirmed_appointment` with service, location, and provider scope.

### Skinsation LA

- Selected `Virtual Consultation`.
- Flow showed 30 minutes, $100 due, `Skinsation LA Staff`, timezone `America/Los_Angeles`, a date picker, and available times from 10:00 AM through 5:30 PM.

Classification: `booked_consultation`. The verified slot was a virtual consultation; direct-treatment inventory was not tested.

### Prehab 2 Perform

- Timely exposed `Initial Consultation with Treatment` and `PT Follow Up Session`.
- Continuing with the initial visit exposed Dr. Dan, September 14, 2026, and 9:15 AM.

Classification: `confirmed_appointment` because the selected inventory is the initial clinical evaluation/treatment visit, not only a phone call.

## Request proof

### Beverly Hills Orthodontics

The live page states that a selected day and time does not guarantee availability, calls the interaction an appointment request, and says a team member will confirm.

Classification: `appointment_request` even though the page contains time controls.

### Zakhor Dental Group

The form asks for a desired date. The page says the team will call or text within two hours to confirm it.

Classification: `appointment_request`.

### Skin Works Medical Spa

The scheduler states: requested appointment times are not guaranteed until the team confirms.

Classification: `appointment_request`.

### LA Beauty Skin Center

The form asks for a date and time. The page says a staff member will contact the visitor within 24 hours to discuss the appointment.

Classification: `appointment_request`.

### Elite Performance Clinic

The page asks for preferred days, time windows, and up to three date/time options. It says the team will confirm by phone or email and labels the submit action `Send request`.

Classification: `appointment_request`.

### MOTI Physiotherapy

The form collects location, visit type, referral, insurance, reason for visit, preferred days, preferred time, and contact method. It says an administrator will assist with scheduling.

Classification: `appointment_request`.

## Contact-only boundary proof

- Smiles by Dr. P captured preferred dates but no explicit staff-confirmation or scheduling-follow-up promise.
- Kevin Sands DDS captured three preferred dates and a time but no explicit staff-confirmation or scheduling-follow-up promise.
- Dr. Jon Marashi promised a call within one business day but exposed no preferred availability or other scheduling payload.
- Beverly Hills Dental Arts and Alpan Orthodontics exposed generic lead forms without inspectable availability and follow-up promises.

Classification: `contact_only`. A request requires both the scheduling payload and the explicit confirmation/follow-up promise; either conjunct alone is insufficient.

## Booked-consultation proof

- Athletic Lab embeds a HubSpot calendar for a free phone consultation.
- Forged PT embeds a HubSpot calendar and says the phone consultation is the first step before care.

Classification: `booked_consultation`; neither site may confirm that treatment is booked.

## Hybrid proof

VERT routes PT acquisition to generic `Request info`/contact channels while its capped group classes advertise a live weekly schedule and real-time reservation. The class inventory was not opened far enough to verify a slot.

Classification: `contact_only` for the verified PT acquisition path, with an **unverified hybrid-router candidate** at service scope. `hybrid` is not a completion state.

## Exclusions and integrity failures

- The Orthospaceship returned a browser error page.
- Aspire PT redirected to a domain-sale page.
- Playa Orthodontics rendered its normal orthodontic content and appointment request form alongside unrelated Portuguese gambling-casino copy. It is retained only as a content-integrity contrast.
- Evolution Physical Therapy and SkinSpirit Beverly Hills are larger multi-region or national operators and are boundary references, not local-denominator members.

## Repository baseline

The isolated worktree began with both `HEAD` and `origin/main` at `cb26ae9`:

```text
Test Files  96 passed | 4 skipped (100)
Tests       1275 passed | 4 skipped (1279)
Duration    73.74s
```
