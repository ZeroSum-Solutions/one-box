# OBX-011 security diff review

Reviewed staged snapshot `25dfd8d596c757df078cfdfd9ba5fbd141d1adb0` against base `c916d2cf06c97eaedb13b6db70533baecabd56bf`.

No authentication, session, identity, role, or tenant boundary changed. The public site route and existing caller authorization remain unchanged.

Authorization is fail-closed at the local filesystem boundary. Candidate callers can supply only a validated run ID; closed OBX-010 paths and inspection select the root, and no path, report, URL, base URL, or after-edit option is accepted. Candidate evaluation never writes the live site or run-root gate report.

Run IDs, candidate metadata, manifests, provenance, gate inputs, and on-disk files are untrusted inputs. Strict schemas, non-symlink directory checks, stable regular-file reads, provenance hashes, pre/post inventory validation, exact report hashing, and atomic candidate-only replacement reject traversal, cross-run binding, malformed data, links, tamper, browser failure, and partial writes.

No prompt, retrieval, model, provider, or tool-control boundary changed.

No external export was added. Candidate reports remain private local run diagnostics under the existing unserved candidate root.

The exact range-based gitleaks scan found no leak. No security findings remain open.
