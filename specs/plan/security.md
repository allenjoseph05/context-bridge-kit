# Security controls

Threat → control → where → test. Every task that touches a control lists its row ID.

| ID | Threat | Control | Where | Task | Test |
| --- | --- | --- | --- | --- | --- |
| S1 | Hostile text instructs the extractor | Random-nonce turn delimiters; data rule in prompt; schema-constrained output | extractor | T17 | injection fixtures produce no instruction-following items |
| S2 | Hostile text instructs the destination | Envelope notice + random fence; flags at review; read-only tools | compiler, MCP | T04, T11 | fence cannot be closed from inside; eval injection metric |
| S3 | Summariser invents or drops facts | Evidence quotes checked by exact match; recall measured | extractor | T18 | ground-check unit tests; must-carry recall |
| S4 | Code corrupted | Model returns references; host copies bytes; sha256 | compiler | T05 | hash equality on every artifact |
| S5 | Secrets/PII leave the device or hit disk | Deterministic redaction before model and delivery; values memory-only | sanitizer, vault | T03, T06 | planted values absent from envelope, vault, audit |
| S6 | Web page talks to our local service | No listening port; native messaging `allowed_origins` = our ID; host checks caller origin | host | T07 | foreign origin → exit 1; `lsof` shows no listener |
| S7 | Extension over-reach | Minimal permissions; inject on click only; no remote code; no `fetch` in content scripts except displayed images | extension | T08, T12 | manifest checklist; code search |
| S8 | Stored ≠ approved | Approval carries preview hash | host | T07 | tampered approval rejected |
| S9 | Prompt-injected destination alters or dumps the vault | Five read-only tools; responses capped; committed + unexpired only; audited | MCP | T11 | tool list test; expired/unapproved pack not visible |
| S10 | Stale data lingers | Expiry, delete on start, user delete | vault | T06 | fake-clock expiry test |
| S11 | Malicious file | Size/count limits; archives refused; magic bytes; worker with timeout and memory limit | attachments | T15 | oversized, archive, malformed fixtures refused cleanly |
| S12 | Hidden data in files | Image metadata stripped; extracted text sanitised | attachments | T15 | GPS-tagged image has no EXIF after processing |
| S13 | Content sent off-machine by the model call | Loopback-only model URL unless explicit override | extractor | T17 | non-loopback URL refused |
| S14 | XSS via captured content in the panel | Render as text only; strict extension CSP | extension | T09 | test that HTML in a turn renders literally |
| S15 | Local attacker reads the vault | User-only modes 700/600 (encryption designed, not built) | vault | T06 | permission test; stated limitation |

Known limits (state them, do not hide them): delimiting and envelopes reduce but do not eliminate
prompt injection; pattern redaction misses unusual personal data; the vault is not encrypted.
