# Restricted raw audit payload location

- Moved: 2026-08-29
- Repository state: normalized JSON and readable Markdown receipts remain; raw request/response payloads are excluded
- Restricted archive: `/Users/zero-suminc./Backups/one-box/audits/2026-08-29-historical-grok-raw`
- Archive permissions: directory `0700`; files `0600`
- Files moved: 23
- Recovery: recoverable by moving an exact named file back from the archive; no payload was deleted

Historical audit prose may name the former repository path for a request or raw response. Those names now resolve in the restricted archive above. The move applies the current data-classification rule that raw provider payloads are not repository authority. Normalized audit findings remain under this directory and must be used instead of raw payloads for ordinary review.

Retention review is due 90 days after the relevant planning stage closes unless a named owner records a different legal or operational basis. No planning stage is declared closed by this location record.
