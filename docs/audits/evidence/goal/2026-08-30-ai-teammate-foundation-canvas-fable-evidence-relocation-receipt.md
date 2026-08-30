# Fable evidence-path relocation receipt

Date: 2026-08-30

Fable 5 finding R-04 correctly identified two evidence artifacts outside the
exhaustive `2026-08-30-ai-teammate-foundation-` supporting-evidence prefix.
They were relocated as follows:

| Historical path | Authorized current path | Current SHA-256 |
| --- | --- | --- |
| `docs/audits/evidence/goal/2026-08-30-ai-teammate-selection-display-boundary-proof.md` | `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-selection-display-boundary-proof.md` | `21d6a192763688da7c448e5e69eedd7447ac6239d72685a3a5ed6e465e2fb9d9` |
| `docs/audits/evidence/goal/2026-08-30-one-box-authority-packet-digest-proof.md` | `docs/audits/evidence/goal/2026-08-30-ai-teammate-foundation-canvas-fable-authority-packet-digest-proof.md` | `f2f216efd6ddedf6a11b151b8806ec0e3c76b344813dc3c14abfef3f775728a6` |

The historical exact-Grok request receipts retain the paths that existed when
those requests were made; rewriting them would falsify the original request.
This superseding receipt resolves those historical proof references to their
current authorized locations. Deterministic tree/path checks returned:

```text
BASELINE_ABSENT docs/audits/evidence/goal/2026-08-30-ai-teammate-selection-display-boundary-proof.md
WORKTREE_ABSENT docs/audits/evidence/goal/2026-08-30-ai-teammate-selection-display-boundary-proof.md
BASELINE_ABSENT docs/audits/evidence/goal/2026-08-30-one-box-authority-packet-digest-proof.md
WORKTREE_ABSENT docs/audits/evidence/goal/2026-08-30-one-box-authority-packet-digest-proof.md
```

The baseline check used `git cat-file -e
899b39433c4be242b4b3adcd39f3e6cd53df99c0:<path>` and the worktree check used
`test -e <path>`. Both old artifacts were created untracked during this goal,
so they were never present in the baseline tree and correctly produce no Git
delete/rename record. The relocation grants no authority and changes no product,
runtime, or packet-digest input.
