# OBX-002 security diff review

Reviewed staged snapshot `61635d45822894d22fcd80fb15484c658587fbfe` against base `d544ece6783a89a472d90f639d478251a917e9f9`.

Authentication keeps the existing loopback and exact-origin guard. Asset, evidence, and export routes authorize before run-ID parsing, persisted intake reads, catalog reads, or response construction.

Authorization is stronger for legacy targets. Active POST boundaries keep the shared Website-only denial, while legacy GET paths can only read the catalog, site, and evidence records.

Run IDs remain format-checked at route ingress. Persisted targets pass through the broad intake enum, and React escapes compatibility labels before rendering. The pure catalog reader derives its path through the existing validated run-ID boundary.

No prompt, retrieval, model, provider, or tool-control boundary changed. Legacy classification happens before the asset synchronization path and active operations remain blocked before provider work.

The evidence export remains an operator-initiated local JSON download approved by OBX-002. It adds only the parsed target and fixed compatibility metadata, keeps loopback authorization and `no-store`, and does not add uploaded or media bytes.

The range-based gitleaks scan found no leak. No security findings remain open.
