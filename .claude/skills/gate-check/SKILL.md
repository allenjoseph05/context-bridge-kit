---
name: gate-check
description: Verify a Context Bridge gate (G1–G5) after the task that ends it, including the security checklist and the manual end-to-end run. Use when finish-task reports a gate, or the user says "check G2" or "/gate-check".
---

# Gate check

A gate proves the system works end to end before more is built on it.

1. Read the gate's row in `specs/tasks.md` §Gates and the gate section of the task card that ends it.
2. Run `pnpm check` and `pnpm build`.
3. **Guide the human through the manual run** step by step (you cannot click in their browser or
   Claude Desktop). For each step, state the expected result; ask them to report what happened.
4. **Security checklist** (all gates):
   - no process listens on a port (`lsof -iTCP -sTCP:LISTEN | grep -i node` shows nothing of ours);
   - the vault contains no planted secret from the fixtures (`grep -r` for them);
   - the audit log contains no content (spot-check five lines);
   - the extension manifest permissions equal `specs/plan/extension.md`;
   - nothing was delivered before approval in the manual run.
5. **Record** in `specs/tasks.md` under the Gates table a line:
   `G2 · 2026-11-03 · passed | failed · <one-line observation, e.g. "images render in Claude Desktop">`.
   Facts observed only by the human are recorded as such.
6. If anything failed: do not start the next task. Propose a fix task (`Txx-fix-…`) with its own card
   following the template of the existing cards, add it to `tasks.md`, and stop.
