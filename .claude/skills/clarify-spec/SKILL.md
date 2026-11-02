---
name: clarify-spec
description: Interview the user one question at a time to resolve an unclear, missing or contradictory requirement in a Context Bridge task card or spec, then record the answers in the spec files. Use when a card leaves a behaviour undecided, two spec files disagree, or a test you would write depends on a guess.
---

# Clarify the spec (grill, then write it down)

Most failures come from misunderstood requirements, not bad code. Ask before building.

1. **Name the gap** in one or two sentences: which card, which criterion, what is undecided, and
   which files disagree (quote the lines).
2. **Build the decision tree** for the gap in your head: the top question, and the questions that
   only make sense once it is answered.
3. **Ask one question at a time**, only once its prerequisites are answered. For each question
   offer 2–3 concrete options with the consequence of each and your recommendation, grounded in
   the constitution and the spec's motivations (Continue, Rescue, Second opinion).
4. **Continue** until every branch that affects the current task is resolved. Do not drift into
   questions about later tasks; note them instead.
5. **Write the decisions down** (this is what makes it spec-driven, not a lost chat):
   - behaviour → the relevant `specs/plan/*.md` section or `specs/spec.md` criterion;
   - task-level detail → the task card (Deliverables or acceptance table);
   - the decision and its reason → `specs/decisions.md`.
   Show the diff to the user before committing: `docs(Txx): clarify <topic>`.
6. Return to the task. If an acceptance test changes, the user must approve the new test text.
