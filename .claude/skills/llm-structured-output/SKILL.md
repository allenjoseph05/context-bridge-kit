---
name: llm-structured-output
description: How Context Bridge calls the local model — prompt files and versioning, JSON-schema output with Ollama, spotlighting delimiters, retry with validation errors, caching, fake providers in tests. Use for task T17 and any change to the extractor prompt or model provider.
---

# Structured output from a local model

## Principles
- The model only does judgement (which statements are goals, decisions, facts). Everything checkable
  is checked by code afterwards (ground-check, reduce). Never trust output you did not validate.
- Untrusted conversation text is **data**: wrap each turn in tags with a random nonce per call and
  say so in the system prompt. Never concatenate untrusted text into the instructions.
- Deterministic settings: `temperature: 0`, explicit `num_ctx` (do not rely on the runtime default,
  which may be smaller than the chunk).

## Prompt files
- Live in `packages/extractor/prompts/extract-vN.md`; the version string is part of the cache key.
- Never edit a released version in place: copy to `vN+1`, change, and log the reason in
  `specs/decisions.md`. Evals compare versions.
- Structure: role and task → output schema in words → rules (from `plan/extractor.md` §2) →
  two short synthetic examples → the data rule repeated at the end.

## Ollama call
```ts
const res = await fetch(`${baseUrl}/api/chat`, {
  method: "POST",
  signal,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model, stream: false,
    format: itemDraftsJsonSchema(),          // JSON Schema object from @cb/schema
    options: { temperature: 0, num_ctx: 8192 },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  }),
});
const json = JSON.parse((await res.json()).message.content);
```
- Check the base URL host is loopback before any call (`127.0.0.1`, `::1`, `localhost`) unless
  `CB_ALLOW_REMOTE_MODEL=1`.
- `available()` = `GET /api/tags` lists the model.
- Even with `format` set, models can return extra text or invented fields: always `JSON.parse` in a
  try and validate with zod.

## Retry
On a parse or zod error: one retry with the same messages plus a user message
"Your previous output was invalid: <zod error summary>. Return only JSON matching the schema."
Second failure → the chunk fails visibly. Never fill gaps with guesses.

## Cache
Key = sha256(promptVersion + modelId + chunk turn hashes). Store validated drafts only.

## Tests
- `FakeProvider` with a script: `[validJson, "not json", { items: [{ bad: 1 }] }, new TimeoutError()]`.
- Unit tests never call Ollama. A manual script (`scripts/try-extract.ts`) does.
- Record the model, its size, the machine and the time per chunk in `specs/decisions.md`.
