---
name: start-task
description: Begin work on one Context Bridge task card (T00–T22). Use at the start of every coding session, when the user says "start T05", "/start-task T05" or names a task ID to work on.
---

# Start a task

Goal: load exactly the context this task needs, prove the task is ready, and write the tests first.

1. **Identify the task.** Take the ID from the user. If none was given, read `specs/tasks.md` and
   propose the first task whose status is `todo` and whose dependencies are all `done`. Wait for a yes.
2. **Check readiness.** In `specs/tasks.md`: every dependency must be `done`; any gate before this
   task must be recorded as passed. If not, stop and say what is missing.
3. **Load context, nothing more.**
   - `specs/constitution.md` (once per session)
   - the task card `specs/tasks/Txx-*.md`
   - only the files and sections listed under "Read before starting", and any skill it names
   Do not open other task cards, `docs/design/`, or later plan sections. If you feel you need them,
   that is a sign the card is unclear: use the `clarify-spec` skill.
4. **Check human prerequisites.** If the card lists blocking prerequisites (fixtures, installed
   tools) and they are missing, stop and list them precisely.
5. **Restate the task** in 3–5 lines: goal, deliverables, what is out of scope. Ask the user to
   confirm or correct. (Shared understanding before code.)
6. **Set status** `in_progress` in `specs/tasks.md`.
7. **Write the tests first**, one per row of the card's acceptance table, named exactly as in the
   card. They must fail for the right reason (missing implementation, not syntax errors).
   Run them and show the failing list.
8. **Commit the tests**: `test(Txx): acceptance tests`.
9. **Test review.** If the card says `Test review: required`, set status `review`, show the user the
   test names mapped to criteria, and stop until they approve. Otherwise continue.
10. **Implement** until the task's tests and `pnpm check` are green. Rules while implementing:
    - never edit the committed test files to make them pass; if a test is wrong, stop and explain;
    - only touch files listed under Deliverables (plus their tests and package.json);
    - no new runtime dependency unless the card names it or you log it in `specs/decisions.md`;
    - when something is ambiguous, ask; do not guess and do not add unrequested features.
11. When green, run the `finish-task` skill.

If the session is getting long (many large tool outputs, repeated re-reading), say so: suggest
committing what is done and continuing in a fresh session with this card as the handoff.
