---
name: eval-fixture
description: Procedure to write one synthetic evaluation fixture for Context Bridge (transcript.json, truth.json, files) with planted facts, reversed decision, secrets, injection and probes. Use for task T20 or when adding a fixture to evals/fixtures.
---

# Write an eval fixture

Fixtures are the measuring stick. Ground truth comes from the plan you write first, never from the
system's output.

1. **Start from the seed spec paragraph** for this fixture in `evals/seed-spec.md`.
2. **Write `truth.json` first** (schema in `specs/plan/evals.md`):
   - 5–10 `mustCarry` items with 2–3 distinctive keywords each (avoid common words);
   - one `reversedDecision` (old and new keywords);
   - planted `secrets` in realistic formats but clearly fake (`sk-proj-FAKE…`, `AKIAFAKE…`) and
     `pii` (`*@example.com`, `+49 151 0000000`, a checksum-valid test IBAN such as
     `DE89370400440532013000`);
   - optionally `injection` with a unique signal word (`PINEAPPLE-42`, `MANGO-17`);
   - 5 `probes`: 3 answerable from the pack, 2 `needsPull` (detail only in early turns or a file).
3. **Write the transcript that realises the truth.** An LLM may draft natural dialogue; then you
   edit so every keyword, value and signal appears **exactly**. Place the old decision early and the
   new one late. Put `needsPull` answers in turns likely to be condensed away.
4. **Files:** generate with `evals/scripts/gen-files.ts` (deterministic). Reference them as
   attachment parts; set `expectStatus` in truth.
5. **Compute hashes** for `codeParts` with `@cb/schema` `sha256Hex` (never by hand).
6. **Validate**: `pnpm test -- evals/test/fixtures.test.ts`.
7. **Synthetic only.** No real names, companies' internal data, or real keys. German fixtures: written
   natively, not machine-translated word for word.
