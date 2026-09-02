# EOS-004 program board — confirmed on main

Date: 2026-09-02
Base commit: `4b02f75ff8954ee09b1c58d4e16a600f6fe4ca41` (PR #19 merge, `main`)
Task: W0.2 of the autonomous run `one-box-gauntlet-r1`
(`~/.claude/goal-state/one-box-gauntlet-r1/contract.md` §5, wave 0).

## What W0.2 required

> W0.2 EOS-004 program board — `docs/tickets/one-box-program/manifest.json` lists
> every wave-2 ticket with requirement IDs, eval IDs, dependencies, owner,
> evidence path. `verify:plans` validates it.
> Proof: `npm run verify:plans` exit 0.

This is a **confirmation record, not a manifest change.** The disposition was set
before the task started, in the run log entry `[W0.2 DISPOSITION]`, from the
wave-2 authorization plan (`~/.claude/goal-state/one-box-gauntlet-r1/plans/wave-2-authorization-path.md`
§1.3 and §5 item 5): the four wave-2 parents are already present and complete, the
child tickets belong in the phase packet documents, and adding rows to the manifest
would re-pin the authority packet a second time in the same wave for no gain. §5
item 5 states the contradiction and which side wins:

> 5. Contract W0.2 "manifest lists every wave-2 ticket" versus verifier ready
>    rules. Satisfied by the four parents already present; child tickets only as
>    `proposed` or in the phase packet ledger.
> (`plans/wave-2-authorization-path.md:225`)

## 1. The four wave-2 parents are listed with every required field

All citations are `docs/tickets/one-box-program/manifest.json` at the base commit.

### OBX-P200 — P1 closed website lifecycle (`:353-376`)

- `:354` — `"id": "OBX-P200"`
- `:355` — `"title": "Plan P1 closed website lifecycle implementation"`
- `:356` — `"status": "proposed"`
- `:359-365` — `"dependsOn": [ "OBX-P110", "OBX-P120", "OBX-P130", "OBX-P140", "OBX-P150" ]`
- `:366-369` — `"requirements": [ "P1", "EOS-002" ]`
- `:370-372` — `"evaluations": [ "PROG-EVAL-LIFE-001" ]`
- `:373` — `"ownerRole": "website lifecycle owner"`
- `:375` — `"file": "OBX-P200.md"`

### OBX-P210 — P2 lifecycle projection in Canvas (`:377-400`)

- `:378` — `"id": "OBX-P210"`
- `:379` — `"title": "Plan P2 lifecycle projection in Canvas"`
- `:380` — `"status": "proposed"`
- `:383-385` — `"dependsOn": [ "OBX-P200" ]`
- `:386-392` — `"requirements": [ "P2", "A0", "A1", "A2", "A3" ]`
- `:393-396` — `"evaluations": [ "PROG-EVAL-LIFE-001", "PROG-EVAL-CANVAS-001" ]`
- `:397` — `"ownerRole": "Canvas owner"`
- `:399` — `"file": "OBX-P210.md"`

### OBX-P220 — P3 client review origin and decisions (`:401-424`)

- `:402` — `"id": "OBX-P220"`
- `:403` — `"title": "Plan P3 client review origin and decisions"`
- `:404` — `"status": "blocked"`
- `:407-412` — `"dependsOn": [ "OBX-P200", "OBX-P210", "OBX-P130", "OBX-P170" ]`
- `:413-416` — `"requirements": [ "P3", "EOS-007" ]`
- `:417-420` — `"evaluations": [ "PROG-EVAL-CLIENT-001", "PROG-EVAL-UX-BASELINE-001" ]`
- `:421` — `"ownerRole": "client review owner"`
- `:423` — `"file": "OBX-P220.md"`

### OBX-P230 — P4 immutable qualification engine (`:425-446`)

- `:426` — `"id": "OBX-P230"`
- `:427` — `"title": "Plan P4 immutable qualification engine"`
- `:428` — `"status": "proposed"`
- `:431-435` — `"dependsOn": [ "OBX-P200", "OBX-P220", "OBX-P140" ]`
- `:436-438` — `"requirements": [ "P4" ]`
- `:439-442` — `"evaluations": [ "PROG-EVAL-QUAL-001", "PROG-EVAL-SEC-TENANT-001" ]`
- `:443` — `"ownerRole": "qualification owner"`
- `:445` — `"file": "OBX-P230.md"`

### The evidence file is the ticket document, and it is checked

`file` is the per-ticket evidence document; each one exists and carries the five
sections the manifest requires. `docs/tickets/one-box-program/manifest.json:8`:

> `"requiredTicketSections": ["Outcome", "Readiness gate", "Bounded delivery", "Acceptance criteria", "Evidence boundary"]`

`docs/tickets/one-box-program/OBX-P200.md:34-36` carries the evidence boundary
those sections name:

> ## Evidence boundary
>
> Planning artifacts and audits are review input, not implementation or release
> authorization. Any live, metered, provider, repository-settings,
> client-invitation, schema, deployment, or appointment effect keeps its separate
> authority gate.

The verifier reads the file, not just the path: it re-derives the front-matter
requirement and evaluation lists from the manifest row and fails on drift
(`scripts/verify-plan-authority.mjs:1340-1343`):

> ```
> const requirementLine = `requirements: ${ticket.requirements.join(", ")}`;
> const evaluationLine = `evaluations: ${ticket.evaluations.join(", ")}`;
> if (!body.includes(requirementLine)) fail(`${ticket.id}: ticket body requirement list drift`);
> if (!body.includes(evaluationLine)) fail(`${ticket.id}: ticket body evaluation list drift`);
> ```

## 2. `verify:plans` validates the manifest

Run on this integration branch after the three wave-0 task merges, before any
packet-doc edit:

```
$ GITHUB_ACTIONS=true npm run verify:plans

> one-box@0.1.0 verify:plans
> node scripts/verify-plan-authority.mjs

NOTE untracked baseline read skipped under GITHUB_ACTIONS; exact record binding still enforced
Plan authority verification passed: 17 domains, 29 tickets, 21 program evaluations.
Authority packet SHA-256: 6abc215646fd239feb001fc3d94e8f3cf9ca39bdf7ab756763639178487e66ab
```

Exit code 0. "29 tickets" is the whole program board including the four parents
above; the ticket-manifest gates run at `scripts/verify-plan-authority.mjs:1288-1355`.

`GITHUB_ACTIONS=true` is the documented local invocation on a machine that does not
hold the protected untracked baseline
(`docs/audits/evidence/security/2026-09-02-obx-p180-ci-oracle-authority-repin.json`,
`localNote`). The packet digest above is the pre-edit value; the wave-0 re-pin
record supersedes it for the merged tree.

## 3. `humanAssignments` is unassigned-blocking, so no ticket can become ready

`docs/tickets/one-box-program/manifest.json:9-13`:

> ```
> "humanAssignments": {
>   "status": "unassigned-blocking",
>   "records": [],
>   "rule": "No ticket may become ready or later until an OwnerAssignmentV1 records one accountable human and the required non-author verifier. Names are not inferred by this planning packet."
> },
> ```

**Precisely what is mechanical, and what is not.** No branch of the verifier
reads `humanAssignments.status`. `scripts/verify-plan-authority.mjs:1295-1305`
is the only code that touches `humanAssignments`, and it reads `.records`:

> ```
> if (!isPlainObject(ticketManifest.humanAssignments) || !Array.isArray(ticketManifest.humanAssignments.records)) {
>   fail("ticket manifest: humanAssignments.records must exist");
> } else {
>   for (const record of ticketManifest.humanAssignments.records) {
>     ...
>     assignments.set(record.ticketId, record);
>   }
> }
> ```

So `"status": "unassigned-blocking"` is a declared label with no oracle behind
it, and the `rule` string is prose. The **enforced** lock is the pair of empty
`records` and the active-status gate below. Filling `records` would lift it;
the label would not stop that. Read the label as a statement of intent and the
next two citations as the mechanism.

`scripts/verify-plan-authority.mjs:45` defines the statuses the gate covers:

> `const activeTicketStatuses = new Set(["ready", "in-progress", "verification", "done"]);`

and `:1351-1354` fails the build when a ticket enters one of them without an
assignment:

> ```
> if (activeTicketStatuses.has(ticket.status)) {
>   const assignment = assignments.get(ticket.id);
>   if (!isPlainObject(assignment) || !assignment.accountableOwner || !assignment.nonAuthorVerifier) fail(`${ticket.id}: ${ticket.status} requires accountableOwner and nonAuthorVerifier assignment`);
> }
> ```

`records` is empty, so `assignments` is empty, so **every** transition to `ready`
fails today. That is the real lock. A second gate compounds it at `:1349`:

> `else if (activeTicketStatuses.has(ticket.status) && tickets.get(dependency).status !== "done") fail(`${ticket.id}: ${ticket.status} requires done dependency ${dependency}`);`

Each wave-2 parent depends on tickets that are not `done`, so even a manifest with
assignment records would still fail. The plan states the same conclusion:

> Making any of them `ready` requires every dependency `done`
> (`verify-plan-authority.mjs:1349`) plus the assignment triple (`:1351-1354`). ...
> This chain is not closable in this run.
> (`plans/wave-2-authorization-path.md:68`)

`implementationAuthorized: false` at `manifest.json:5` is the third lock; the
verifier refuses any other value at `scripts/verify-plan-authority.mjs:1289`.

## 4. Child tickets live in the phase packet documents as a sequenced ledger

The P1 and P2 child tickets are defined on branch `wave-2/governance` (commit
`ecdd478`), not in the program manifest.

`wave-2/governance:docs/plans/2026-09-02-release-1-p1-lifecycle-authorization-design.md:27-33`
carries the P1 ledger — `OBX-P200-T01` contracts and pure transitions,
`OBX-P200-T02` persistence and controller binding, `OBX-P200-T03` read-only
projection and Canvas status — each row naming its work package, its effects, and
its exact paths. The same file, `:39-42`, states why they stay out of the manifest:

> Child tickets are not added to `docs/tickets/one-box-program/manifest.json` in
> this wave. `OBX-P200` cannot become `ready` while no OwnerAssignmentV1 record
> exists, so the ledger above is the sequencing authority, exactly as the OBX-P180
> Step 6 precedent does.

`wave-2/governance:docs/plans/2026-09-02-release-1-p2-canvas-approval-authorization-design.md:29-36`
carries the P2 ledger — `OBX-P210-T00` fingerprint and lock-order design note,
`OBX-P210-T01` mutation to lifecycle and approval invalidation, `OBX-P210-T02`
promotion binding and visual-review receipt, `OBX-P210-T03` Canvas approval-state
projection — and repeats the exclusion at `:42-43`:

> Child tickets are not added to `docs/tickets/one-box-program/manifest.json` in
> this wave, for the same reason as P1.

The ledger is a **sequence**, not a queue of runnable work. Its rows may not become
`ready`: they are not manifest tickets at all, so the `activeTicketStatuses` gate
never sees them, and the authority they sequence comes from the per-phase scoped
records, which are separately gated. The precedent is the OBX-P180 Step 6 ticket
ledger; the plan names it at `plans/wave-2-authorization-path.md:70`:

> the parent stays `proposed` and the scoped record carries
> `parentTicketStatus: "proposed"` and `childTicketIds`
> (`scoped-implementation-authorizations.json:433-437`); the verifier even enforces
> that `OBX-P180` stays `proposed` (`verify-plan-authority.mjs:720`, `:1356`).

## 5. Verdict

EOS-004 is confirmed on `main`: the four wave-2 parents are on the program board
with requirements, evaluations, dependencies, owner role, and an evidence file that
the verifier reads; `verify:plans` validates the board and exits 0; and two
independent locks — the empty `humanAssignments.records` list checked against
`activeTicketStatuses`, and the `done`-dependency rule — keep every one of them out
of `ready`. The `unassigned-blocking` label states that intent; the two gates
enforce it. The child tickets
are sequenced in the P1 and P2 phase packets on `wave-2/governance` and are
likewise unable to become ready.

No manifest change was made, so this record does not move the authority packet
digest. `docs/audits/` is outside the packet input set.
