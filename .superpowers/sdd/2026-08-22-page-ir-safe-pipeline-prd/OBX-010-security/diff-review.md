# OBX-010 security diff review

Reviewed staged snapshot `a4d991e956e5cb1893fc119e3ac36627b5039e67` against base `3c417837d82e4127e11d93184f9969a548fe3e55`.

No authentication, session, identity, role, or tenant boundary changed. The public site handler is unchanged; its regression suite proves candidate-shaped URLs and an in-site symlink cannot expose candidate bytes.

Authorization is fail-closed at the filesystem boundary. A validated run ID resolves to one fixed candidate root with no caller-controlled suffix, inspection never mutates it, and cleanup can remove only that root after validated terminal provenance establishes the retention decision.

Run IDs, manifest paths, lifecycle events, provenance, file inventories, and metadata hashes are untrusted inputs. Strict schemas reject unknown keys and unsafe paths. Inventory uses `lstat`, no-follow file handles, regular-file and hardlink checks, exact byte/hash comparison, and a 100 MiB aggregate bound. Malformed or symlinked provenance prevents cleanup.

No prompt, retrieval, model, provider, tool-control, or credential boundary changed.

No external export was added. Candidate bytes remain private local run diagnostics and the site route received no candidate allowlist.

The range-based gitleaks scan found no leak. No security findings remain open.
