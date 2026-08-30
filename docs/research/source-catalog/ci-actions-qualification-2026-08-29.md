# CI action pin and provenance receipt

- Date: 2026-08-29
- Scope: `.github/workflows/ci.yml`
- Decision state: exact pins recorded; human license/supply-chain acceptance remains blocking
- Owner ticket: `OBX-P150`

## Immutable identities

| Action | Upstream release | Pinned commit | Upstream license | Receipt |
|---|---|---|---|---|
| `actions/checkout` | `v6` | `d23441a48e516b6c34aea4fa41551a30e30af803` | MIT | [commit](https://github.com/actions/checkout/tree/d23441a48e516b6c34aea4fa41551a30e30af803), LICENSE SHA-256 `3e855f32be4ab3f8f9a11701835e41aa8c4d4a3e3f69b7d4fa7898eebf47f754`, `action.yml` SHA-256 `d59227b0e3f37c84fba2ef549fbcdf13d2f2bed57511713316aadc3898c3824c` |
| `actions/setup-node` | `v6` | `249970729cb0ef3589644e2896645e5dc5ba9c38` | MIT | [commit](https://github.com/actions/setup-node/tree/249970729cb0ef3589644e2896645e5dc5ba9c38), LICENSE SHA-256 `7d070bc6b600a8b1f8f58113b402505e1030db592da2154ad90f264ece4919da`, `action.yml` SHA-256 `ad45ef68a1e31bd62983c1b8c006c29e710387292ccd331869519150dc4c99d2` |

The workflow uses the full commits above and keeps the human-readable `v6` labels only as comments. A tag movement therefore cannot change executed action bytes.

## Bounded permissions and data flow

- Workflow default permissions are `contents: read`; neither action receives a write token from this workflow.
- `checkout` reads the current repository revision into the ephemeral hosted runner. Persisted credentials must remain disabled in any future job that invokes untrusted repository code with broader credentials.
- `setup-node` installs Node 20 and enables the npm cache. The cache is performance state, not build authority; `package-lock.json` and `npm ci` remain dependency authority.
- Pull requests receive no production, deployment, model-provider, or client credentials in this workflow. A future secret-bearing job requires a separate trust-boundary review.
- The GitHub-hosted runner, cache service, action transitive runtime, artifact provenance, update cadence, removal drill, and named human license decision remain qualification gates.

## Acceptance boundary

This receipt closes mutable-tag execution and records current source/license hashes. It does not claim a completed legal, runner, vulnerability, provenance, or human supply-chain review. `SC-CI-001` therefore remains incomplete and release-blocking until the named owner records those decisions. Replacing either commit invalidates this receipt.
