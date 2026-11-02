---
name: finish-task
description: Verify and close a Context Bridge task card after its tests are green. Use when a task's implementation is complete, or when the user says "finish", "wrap up" or "/finish-task".
---

# Finish a task

Goal: prove the task meets its card, leave a handoff for the next session, and stop.

1. **Run** `pnpm check`. All green, no skipped tests added by you.
2. **Walk the card's acceptance table** row by row. For each: the test name, pass/fail, or for manual
   rows what you did and observed. Do not mark a manual row done that you could not perform; say
   it needs the human.
3. **Walk "Done when"** and tick each item in the card.
4. **Check the constitution** quickly against your diff:
   - no `console.log` in host or mcp-server; no non-loopback network call; no test file edited
     after the test commit; no new runtime dependency unlogged; no real data in fixtures.
5. **Write "Implementation notes"** in the card (≤ 15 lines): what was built, deviations and why,
   anything the next task must know (exported functions, file locations, gotchas). This is the
   handoff; the next session will not see this conversation.
6. **Log decisions** you made that the spec did not in `specs/decisions.md`
   (date · task · decision · why · alternatives). If behaviour changed, update the relevant
   `specs/plan/*.md` section in the same commit.
7. **Update `specs/tasks.md`**: status `done` (or `review` if a manual check is left for the human).
8. **Commit**: `feat(Txx): <short summary>` (plus `docs(Txx): …` for spec updates if separate).
9. **If the card ends at a gate** (G1–G5), tell the user to run the `gate-check` skill next.
10. **Stop.** Recommend a fresh session for the next task. Do not start the next task here.
