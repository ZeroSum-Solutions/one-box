# ONE BOX program planning traceability

> Audit status (2026-08-29): the exact Grok 4.6 lane was unavailable after the
> first phase timed out. The owner-authorized OAuth fallback produced one
> `REVISE` review; its findings were dispositioned in the evaluation packet
> without a second model pass. See [fallback audit](../../audits/grok-4.6/2026-08-29-program-evaluation-strategy-opus-5-fallback-audit.md).

This table connects the engineering gap register to the first program-level
evaluation and ticket that must close it. Phase-specific requirements and evals
remain in their owning PRD and manifest; this is the program seam, not a duplicate.

| Gap | Primary evaluation | Planning owner ticket |
|---|---|---|
| EOS-001 authority map | PROG-EVAL-AUTH-001 | OBX-P100 |
| EOS-002 target topology | PROG-EVAL-TOPO-001, PROG-EVAL-LIFE-001 | OBX-P120 |
| EOS-003 identity and tenancy | PROG-EVAL-SEC-TENANT-001, PROG-EVAL-TOPO-001 | OBX-P130 |
| EOS-004 shared mutation model | PROG-EVAL-SEC-TENANT-001, PROG-EVAL-TOPO-001, PROG-EVAL-CLIENT-001 | OBX-P130 |
| EOS-005 desktop/browser isolation | PROG-EVAL-SEC-BROWSER-001 | OBX-P160 |
| EOS-006 agent and model routing | PROG-EVAL-SEC-AGENT-001, PROG-EVAL-COST-001 | OBX-P180 |
| EOS-007 client review and media | PROG-EVAL-CLIENT-001 | OBX-P170 |
| EOS-008 ExperienceModule boundary | PROG-EVAL-MODULE-001, PROG-EVAL-SC-001 | OBX-P185 |
| EOS-009 evaluation and CI tiers | PROG-EVAL-TEST-001 | OBX-P140 |
| EOS-010 cloud and desktop operations | PROG-EVAL-TOPO-001, PROG-EVAL-COMPAT-001, PROG-EVAL-PROD-001, PROG-EVAL-DRILL-001 | OBX-P190 |
| EOS-011 supply chain | PROG-EVAL-SC-001 | OBX-P150 |
| EOS-012 cost and capacity | PROG-EVAL-COST-001 | OBX-P180 |
| EOS-013 handoff and post-launch | PROG-EVAL-HANDOFF-001, PROG-EVAL-LIFE-001, PROG-EVAL-PROD-001, PROG-EVAL-DRILL-001 | OBX-P190 |
| EOS-014 usability and cognitive load | PROG-EVAL-UX-BASELINE-001, PROG-EVAL-CANVAS-001 | OBX-P170 |
| EOS-015 capability contract | PROG-EVAL-LIFE-001, PROG-EVAL-COMPAT-001 | OBX-P110 |
| EOS-016 fallback retirement | PROG-EVAL-LIFE-001, PROG-EVAL-COMPAT-001 | OBX-P110 |
| EOS-017 motion and visual qualification | PROG-EVAL-MOTION-001, PROG-EVAL-CANVAS-001 | OBX-P175 |
| EOS-018 contribution controls | PROG-EVAL-AUTH-001, PROG-EVAL-TEST-001 | OBX-P100 |
| EOS-019 provider and appointment independence | PROG-EVAL-PROVIDER-001, PROG-EVAL-APPT-001 | OBX-P195 |

## Closure rule

A gap is closed only when its authoritative design/contract is owner-accepted,
all linked tickets are done, every blocking linked evaluation is PASS on current
evidence, no unaccepted P0/P1 remains, and the authority manifest points to the
accepted artifact. A Grok review, plan existence, or implemented happy path alone
does not close a gap.
