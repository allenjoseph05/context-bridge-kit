# Context Bridge: User Needs, Use Cases & Requirements

Nov 2, 2026 · @Allen Joseph

People move context between assistants for about ten distinct reasons, and each one changes what must move, how fast, and how much risk is acceptable. This document derives the product's requirements from those needs, so every architectural choice in the next stage traces back to a user problem. Companion research: [Landscape & Architecture](https://claude.ai/artifact/6s46JnE4WviHwfHZ2D2ezV).

**Scope: any assistant to any assistant.** The brief's Gemini → Claude is one example pair (it also allows "two other assistants you choose"). The product must carry the whole useful substance of a conversation — what was asked, what was answered, every file and output, every decision and insight — from any source to any destination, while sending only what the next step needs. The two goals pull against each other; this document is about resolving that tension per motivation.

## Reading the brief

The brief tests judgment more than features: it names four things to show (technical route, consent, a fallback when access is blocked, honesty about what is real) and rewards reasoning over breadth.

| Phrase in the brief | What it is really testing | Where we answer it |
| --- | --- | --- |
| "selected messages or a concise summary" | Two fidelity modes; user control over what moves | What "context" is; Use cases |
| "securely and reliably" | Threat model, data minimisation, and quality that survives the move | Trust and safety; Evaluation |
| "APIs, MCP, or another approach … most appropriate" | Knowing the real integration surfaces and choosing with reasons | Platform access reality |
| "the technical route, user consent" | Consent as a designed step, not a checkbox | User journey; Trust and safety |
| "what happens when a platform does not support direct access" | A fallback ladder that never bypasses controls | Platform access reality |
| "Build or Design", 1 day, "reasoning over the number of features" | Scoping discipline; a thin end-to-end slice beats a wide demo | Decisions needed |
| "No paid services" | Free tiers, local models, mocks | Decisions needed |
| "Do not use real … conversation data" | Synthetic fixtures; privacy by default | Evaluation |
| "Be transparent about what you built, tested, simulated, or inferred" | Labelling real vs mocked vs assumed | Every section marks unknowns |
| "rather than bypassing security controls" | No scraping with stored passwords, no CAPTCHA tricks, no private APIs | Non-goals |
| "be prepared to present … and answer technical questions" | Depth in each concept, not just a working demo | Whole doc |

Three hidden traps. First, Gemini → Claude is only an example, so the design must be any-to-any. Second, the example pair is the hard one: consumer Gemini has the least open access of the three, so the fallback path is the main path for that direction. And "summary" means an LLM rewrites the user's context, which can silently drop or invent facts; reliability therefore needs measurement, not assertion.

## Why users move context

Users never want "a transfer"; they want to keep working without re-explaining. Ten distinct motivations sit under that, and they differ on what must move and how much loss is tolerable.

| # | Motivation | The pain right now | What success looks like | What it demands of us |
| --- | --- | --- | --- | --- |
| M1 | **Capability fit**: the other model is better at this step (coding, long docs, reasoning, search, images) | Re-explaining hours of discussion; the new model misses decisions already made | New assistant answers as if it had been in the room | High-fidelity decisions and constraints; a structured brief beats raw text |
| M2 | **Hit a limit**: rate limit, quota, context window full, outage | Work stops mid-task, often at the worst moment | Continue within a minute | Speed; one click; the latest state and open task, not the whole history |
| M3 | **Second opinion**: verify, red-team, compare answers | Copy-paste is tedious and drops the framing | Same question, same context, side by side | Exact wording of the question and key facts; read-only, nothing persisted |
| M4 | **Cost**: spread work across free tiers or cheaper models | Juggling accounts loses the thread | Free-tier user never pays to keep context | No paid services in the path; small token footprint |
| M5 | **Ecosystem and tools**: needs artifacts, Claude Code, Drive, an IDE, MCP tools only one assistant has | The tool lives in one place, the thinking in another | Planning in one, execution in another, no gap | Artifacts (code, docs) move intact; output fits tool formats (rules files, MCP) |
| M6 | **Permanent switch**: price, trust, policy or quality changed | Months of personalisation lost; lock-in | Day one in the new assistant feels like month six | Bulk import of memory and preferences; official export formats |
| M7 | **Compliance**: employer mandates an approved assistant, or data must leave a consumer tool | Useful work is stranded in a non-approved tool | Move only what is allowed, with a record | Redaction, audit log, no third-party server, admin-friendly |
| M8 | **Hand-off to a person**: teammate, client, future self | Sharing a whole chat leaks irrelevant or private parts | Recipient gets a clean, reviewable brief | Selective export; redaction; a portable, readable file |
| M9 | **Continuity across surfaces**: web chat to IDE agent to phone | Each surface starts cold | Context follows the user, not the app | A canonical copy outside any one assistant; live sync where possible (MCP) |
| M10 | **Ownership and archive**: fear of account loss, deletion, policy change | History is locked in one vendor's UI | A searchable, local copy they control | Local storage, open format, export never depends on our servers |

**Reasoning:** M1, M2 and M3 are the brief's core case and, by our inference (not measured), the most frequent: session-level, minutes long. M6 and M10 are account-level and already partly served by vendor imports, so we interoperate with those rather than compete. M7 and M8 are where security choices are tested hardest.

## Personas

Six personas cover the motivations; the first two define the MVP, the rest stress-test security and scale.

| Persona | Typical move | Top need | Biggest fear | Motivations |
| --- | --- | --- | --- | --- |
| **Maya, product manager** (MVP) | Brainstorms a launch plan in Gemini for 3 hours, wants Claude to draft the PRD | Decisions and constraints survive; no re-explaining | The summary quietly drops or invents a decision | M1, M5 |
| **Dev, software engineer** (MVP) | Debugs in ChatGPT, then continues in Claude Code or Cursor | Code blocks, error logs and file paths move verbatim | Secrets (API keys, tokens) in logs get copied | M1, M2, M5, M9 |
| **Sam, student on free tiers** | Hits a daily limit, continues elsewhere | One click, zero cost | Losing the thread before an exam | M2, M4 |
| **Lena, analyst in a regulated firm** (Germany) | Moves research from a consumer tool to the company-approved assistant | Redaction, an audit trail, nothing via third-party servers | A GDPR breach caused by a tool | M7, M8 |
| **Alex, power user** | Uses 3–4 assistants daily; wants one memory everywhere | Preferences and projects in sync | Stale or conflicting memories across tools | M6, M9, M10 |
| **Jordan, consultant** | Hands a cleaned brief to a client or colleague | Selective, readable, reviewable output | Leaking another client's details | M3, M8 |

**Anti-persona:** someone wanting to bulk-scrape others' chats or bypass account controls. The design must make this hard: capture only from the signed-in user's own open page, on their click.

## Use-case catalogue

Sixteen use cases fall into three tiers by scope; the first four are the brief's example and should drive the MVP.

**Tier 1 — session handoff (one conversation, minutes)**

| ID | Use case | Trigger | What moves | Fidelity | Urgency | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | Continue a project chat in another assistant (brief's example, Gemini → Claude) | User decides the other model is better for the next step | Selected messages + structured brief | Brief + verbatim key turns | Minutes | Medium |
| U2 | Rescue a chat that hit a rate or context limit | Limit banner, error, slow responses | Current task state, last N turns | State-focused brief | Seconds | Medium |
| U3 | Ask for a second opinion | Doubt about an answer | The question, key facts, the answer to check | Verbatim | Minutes | Low–medium |
| U4 | Move a code or debugging session to a coding agent | Need repo access or execution | Code blocks, errors, file paths, decisions | Verbatim for code | Minutes | High (secrets) |
| U5 | Move a draft document to an assistant with better editing tools | Need artifacts, canvas, Docs | The latest draft + style decisions | Verbatim draft, brief for rationale | Minutes | Medium |
| U6 | Branch: explore an alternative path elsewhere without polluting the source chat | "What if" idea | Context up to a chosen message | Brief | Minutes | Low |

**Tier 2 — project and memory (many conversations, days)**

| ID | Use case | Trigger | What moves | Fidelity | Urgency | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- |
| U7 | Merge several chats about one project into one context pack | Project spans many chats or tools | Facts and decisions deduplicated across chats | Structured brief | Hours | Medium |
| U8 | Keep preferences and working style in sync | New tool, or a preference changed | Preferences, tone, recurring constraints | Exact | Days | Low–high |
| U9 | Give an IDE or CLI agent the context of a web chat | Start implementation | Project brief, as a rules file or via MCP | Structured | Hours | Medium |
| U10 | Resume after weeks | Return to a project | Brief + what changed since | Brief | Days | Medium |
| U11 | Hand a clean brief to a colleague or client | Delegation | Redacted brief, chosen excerpts | Brief | Hours | High |

**Tier 3 — account level (whole history, rare)**

| ID | Use case | Trigger | What moves | Fidelity | Urgency | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- |
| U12 | Switch assistant permanently | Pricing, trust or quality change | Memories, instructions, selected history | Mixed | Days | High |
| U13 | Back up and search all chats locally | Fear of loss | Full history | Verbatim | Low | High |
| U14 | Move work into an employer-approved tool | Policy | Approved items only, with audit | Brief | Days | Very high |
| U15 | Exercise data portability rights (GDPR Art. 20) | Leaving a service | Official export, made usable | Verbatim | Low | High |
| U16 | Transfer without any extension (locked-down browser, mobile) | Extension not allowed | Pasted text or official export | Any | Minutes | Any |

**Reasoning for scope:** U1–U4 share one pipeline (select → condense → review → deliver), so building it well covers four use cases. U7–U11 add a store and MCP delivery. U12–U15 are batch jobs on official exports. U16 is the fallback that must always exist, because it is the only path that works on every platform.

## What "context" actually is

A conversation is not one thing: it mixes decisions, facts, artifacts and noise, and each needs a different transfer rule. Treating it as one blob of text is the main cause of poor handoffs.

### Components of a conversation

| Component | Example | Transfer rule | Why |
| --- | --- | --- | --- |
| Goal and task state | "Write the PRD; sections 1–3 done" | Always; first in the brief | The destination needs to know what to do next |
| Decisions and their reasons | "Chose Postgres over Mongo because of joins" | Always, with reason | Without reasons the new model re-litigates them |
| Constraints and preferences | Budget, tone, language, must-use stack | Always, exact wording | Small paraphrase changes meaning ("under" vs "about" 20 EUR) |
| Facts supplied by the user | Numbers, names, requirements | Exact, with source turn | User facts are ground truth |
| Facts produced by the assistant | Claims, citations, calculations | Marked "unverified" | The source model may have hallucinated |
| Artifacts | Code, tables, drafts, JSON | Verbatim, never summarised | A summarised function no longer runs |
| Open questions and rejected options | "Still unsure about pricing tier" | Always | Prevents premature closure and repeated dead ends |
| Attachments and images | PDFs, screenshots | Carried, extracted or listed (see the inventory below) | MCP and upload destinations accept files; paste-only ones do not |
| Model-specific residue | Tool-call traces, regenerated branches, refusals, "as an AI…" | Dropped | Noise that wastes tokens and confuses the destination |
| Chit-chat and dead ends | Greetings, abandoned tangents | Dropped by default | Reduces tokens and distraction |

### Fidelity levels

1. **Verbatim selection** — user-picked messages, copied exactly. Highest trust, highest token cost.
2. **Extractive** — key sentences quoted with turn references. Faithful, compact, can lose connective reasoning.
3. **Abstractive summary** — an LLM rewrites. Compact and fluent; risks omission and invented facts.
4. **Structured brief** (recommended default) — fixed fields (goal, state, decisions, constraints, artifacts, open questions), each item linked to its source turn, artifacts verbatim. Combines the strengths of 1–3 and can be checked field by field.

### Things that must never move by default

- Secrets: API keys, passwords, tokens, private keys (detected and redacted).
- Third-party personal data the user did not mean to share.
- Hidden or non-visible text found in the page or export (a classic injection carrier).
- Instructions addressed to an AI inside the content: they move only as quoted data, never as commands.

### Engineering implications

- **Token budget:** the brief must fit the destination's limit with room to work; a 3-hour chat can run to tens of thousands of tokens, so selection plus condensing is required, not optional.
- **Broken references:** selecting message 40 without message 12 breaks "as I said earlier"; the condenser must resolve references or warn.
- **Branching:** ChatGPT exports store a tree of message nodes (regenerations and edits); only the path the user actually followed should move.
- **Language:** keep the user's language; do not translate unless asked.

## Inputs and outputs inventory

A modern assistant conversation holds far more than text: uploads, generated files, tool results, search citations, canvases, branches and memory. The rule for each type follows from one question: **can it be paraphrased without losing value?** If not, it travels verbatim or as the original file; if yes, it is condensed; if it cannot be retrieved at all, it is listed so the user knows exactly what is missing.

### Inputs (what the user brought in)

| Type | Examples | Why it matters | Default rule | Worst case |
| --- | --- | --- | --- | --- |
| Prompts | Questions, instructions, corrections | Carry intent, constraints and preferences | Condensed into the brief; constraints quoted exactly | Paste fallback still captures them |
| Pasted text | Emails, specs, logs | Often the ground truth | Kept verbatim if selected; otherwise summarised with a pointer | — |
| Images | Screenshots, photos, diagrams | Visual evidence the discussion depends on | Sent as images where the destination accepts them, plus a local text description | Description and a re-attach entry in the manifest |
| Documents | PDF, Word, slides | Large, often the subject of the chat | Text extracted locally; relevant excerpts pushed, full text retrievable | Filename, size and page count listed; user re-attaches |
| Data files | CSV, spreadsheets, JSON | Analyses depend on exact values | Schema, row count and a sample pushed; full file retrievable | Listed for re-attachment |
| Audio and voice | Voice-mode turns, recordings | Same content as typed turns | Use the transcript the assistant shows | Listed |
| Code and repos | Snippets, uploaded files | Must run | Verbatim, hashed | Listed |
| Links | URLs the user shared | Sources of truth | URL and title kept; pages not re-fetched | — |

### Outputs (what the assistant produced)

| Type | Examples | Why it matters | Default rule | Worst case |
| --- | --- | --- | --- | --- |
| Answers | Explanations, plans, recommendations | Where decisions are made | Condensed; claims marked as the source assistant's, unverified | — |
| Code, tables, math | Functions, comparison tables, LaTeX | Paraphrase breaks them | Verbatim, hashed | — |
| Generated files and canvases | Drafts, documents, artifacts | Often the real work product | Latest version verbatim; earlier versions dropped | Listed with title |
| Generated images | Charts, illustrations | Part of the result | As images, with the prompt that produced them | Description plus prompt |
| Tool and agent results | Code execution output, analysis results | Evidence for conclusions | Final result kept; intermediate traces dropped | — |
| Web citations | Search results, sources | Let the next assistant verify | URL, title and the claim it supports | — |
| Branches | Regenerated or edited turns | Only one path was followed | Followed path only | — |

### Context around the chat

| Type | Examples | Default rule |
| --- | --- | --- |
| Custom instructions, personas | Gems, custom GPTs, project instructions | Included as a preferences block only if the user selects it |
| Memory | What the assistant remembers about the user | Exported through the assistant's own answer to a memory-export prompt, never scraped |
| Project knowledge | Files attached to a project or space | Listed in the manifest; carried like documents when the user selects them |
| Metadata | Title, dates, model name | Kept as provenance |
| Hidden reasoning, system prompts | Model internals | Never moved: not visible to the user, not theirs to move |

### Principles that fall out of the inventory

1. **Capture maximally, push minimally, pull on demand.** Everything retrievable is captured and kept locally; the destination receives a compact brief plus the artifacts in use, and can fetch any detail later.
2. **Never paraphrase what must stay exact:** code, numbers, quotes, constraints, data, file contents.
3. **Nothing disappears silently:** every attachment appears in a manifest with a status — carried, extracted, retrievable on request, or unavailable.
4. **Process files locally:** text extraction, image description and data summaries happen on the user's machine, for both privacy and cost.

## From motivation to transfer profile

There is no single right amount of context: a limit rescue needs speed, a second opinion needs independence, a permanent switch needs breadth. So the product offers six transfer profiles, each derived from the motivations above, and each sets what is pushed, what stays retrievable, the token budget, and how much condensing to spend.

| Profile | Motivations | Pushed to the destination | Retrievable on demand | Starting push budget | Condensing | Why this trade-off |
| --- | --- | --- | --- | --- | --- | --- |
| **Continue** (default) | M1, M5 | Structured brief, artifacts in use, attachments referenced in recent turns, last few turns verbatim | Full history, all files | \~6k tokens | Full | Best balance: decisions survive, noise does not |
| **Rescue** | M2, M4 | Current task, last 6–10 turns verbatim, open question | Everything else | \~3k tokens | Light or none | Speed beats polish; the user is blocked now |
| **Second opinion** | M3 | The question, the facts and files needed, the answer under review | Nothing by default | \~2k tokens | Extractive only | Independence: sending the source's reasoning would bias the reviewer; a blind option omits the source's answer entirely |
| **Switch** | M6, M10 | Preferences and memory profile, index of past chats | All chats from official exports | \~2k tokens | Per-chat summaries, built once | Breadth without flooding: details are fetched as topics come up |
| **Share** | M7, M8 | Redacted brief only | Nothing | \~2k tokens | Full, strict redaction | Minimum disclosure to another person or an approved tool |
| **Sync** | M9 | Nothing pushed | Project pack via MCP | 0 | Incremental | Live tools fetch what they need; no stale copies |

Budgets are starting defaults to tune in evaluation, not measured values. The profile is suggested from the trigger (a limit banner suggests Rescue) and the user can change it.

### Why push-and-pull beats "send everything"

- **Cost and limits:** a 3-hour chat can run to tens of thousands of tokens. Pushing it all consumes the destination's context and the user's quota on every later turn, because the whole conversation is re-read each turn.
- **Quality:** long, noisy context dilutes attention; a cited brief puts decisions first, and details are one tool call away.
- **Safety:** less pushed text means less surface for injected instructions and accidental disclosure.
- **No loss:** because the full history and files remain retrievable, condensing becomes a ranking decision, not a deletion.

### Worst case: the destination cannot pull

Where the destination has no MCP or file upload (a locked-down web chat, a mobile app), pull is impossible. The fallback is a single paste-ready block: the brief, then artifacts, then as many verbatim turns as the budget allows, ending with a manifest of everything left out. The user sees the cut list before sending.

## User journey

The journey has seven steps and two consent points; every step that can fail has a defined fallback, so the user always ends with either a working handoff or nothing sent.

&#91;embedded content: Transfer journey · 7 steps, 2 consent points, 4 fallbacks\]

Step 7 is a reliability check, not a courtesy: asking the destination to restate the goal and next step lets the user catch a bad handoff in seconds, before any work builds on it.

## Edge cases and failure modes

Most failures are silent: the transfer "works" but the destination misunderstands. Each case below needs a defined behaviour, not a crash or a guess.

| Area | Case | Expected behaviour |
| --- | --- | --- |
| Capture | Source page layout changed; extension selectors break | Detect zero or malformed messages; fall back to paste or export; never send an empty brief |
| Capture | Very long chat, lazily loaded history | Capture what is loaded; tell the user how many turns were seen |
| Capture | Signed out, Workspace account, or mobile app | Offer paste or official export path (U16) |
| Capture | Edited or regenerated messages (branches) | Keep the visible path only |
| Content | Code, tables, LaTeX, non-Latin scripts | Preserve formatting byte-exact inside fenced blocks |
| Content | Images, files, voice | Carry the file or image where the destination accepts it; otherwise description or extracted text plus a manifest entry to re-attach |
| Content | Contradictions (a decision later reversed) | Latest decision wins; earlier one listed as superseded |
| Content | Source assistant was wrong | Assistant-made claims flagged as unverified |
| Condense | Summary drops a key constraint | Faithfulness checks; user review with a diff against the source turns |
| Condense | Summary invents a fact | Every brief item cites a source turn; uncited items flagged |
| Condense | Summariser unavailable (no key, offline, rate-limited) | Fall back to verbatim selection with a truncation warning |
| Deliver | Brief exceeds destination limits | Show token estimate before sending; trim by priority (artifacts > decisions > history) |
| Deliver | Destination has no import or MCP | Clipboard plus open the destination in a new tab |
| Deliver | Destination treats pasted text as instructions | Data envelope with an explicit header; injected imperatives neutralised |
| Deliver | User sends to the wrong account or assistant | Destination and account shown in the confirm step |
| Safety | Secret or personal data in selection | Redact by default; user can unredact item by item |
| Lifecycle | User regrets a transfer | Local history with delete; explain that text already sent to a vendor follows that vendor's deletion rules |
| Lifecycle | Same chat transferred twice | Deduplicate by content hash; offer to send only what is new |

## Trust, consent and safety

Users will only use this if they can see exactly what leaves, where it goes, and that nothing else happens. Consent is therefore a designed screen with real choices, given per transfer, not a one-time checkbox.

### What users need to feel safe

1. **See it before it goes:** a preview of the exact text the destination will receive, not a description of it.
2. **Edit and remove:** delete items, redact words, unredact deliberately.
3. **Know the route:** source, destination, account, and every party in between (ideally none).
4. **Know the data policy:** whether the destination may train on the content, shown at confirm time.
5. **Least access:** the tool reads only the open chat, only on click; it never sees passwords or cookies.
6. **Undo locally:** clear history and stored packs at any time.
7. **Proof:** an audit entry per transfer (time, source, destination, item count, hash), stored locally.

### Consent model

| Moment | Consent asked | Granularity |
| --- | --- | --- |
| Install or first run | Which sites the tool may read | Per site, revocable in the browser |
| Capture | User clicks "capture this chat" | Per conversation |
| Selection | User ticks messages or accepts the suggested set | Per message |
| Condense with an LLM | Which model sees the text (local, own key, or the source assistant) | Per transfer |
| Send | Final preview, destination, data-policy note | Per transfer |
| Store for later | Save as a context pack, with expiry | Per pack |

### Threats to the user

| Threat | Example | Mitigation principle |
| --- | --- | --- |
| Malicious or compromised extension | Extensions harvesting AI chats from millions of users (see [landscape](https://claude.ai/artifact/6s46JnE4WviHwfHZ2D2ezV)) | Open source, minimal permissions, no remote code, no outbound network except chosen LLM endpoints |
| Indirect prompt injection | A pasted web page inside the source chat says "ignore previous instructions" | Content travels as quoted data inside a fixed envelope; imperatives aimed at AI are flagged |
| Memory poisoning | A poisoned item saved into a pack and reused for weeks | Human approval before storage; provenance; expiry |
| Data leakage to a third party | Summarising via a cloud API the user did not choose | User picks the condenser; local model option; no server of ours in the path |
| Over-sharing | Whole chat sent when two messages were needed | Minimal selection by default; token and item count shown |
| Account or ToS risk | Automating a vendor UI in ways it forbids | Read-only, user-initiated capture; no headless sessions; no stored credentials |

### Legal frame (user in Germany, EEA)

GDPR applies: data minimisation and purpose limitation favour selective transfer; Art. 20 gives a right to receive one's data in a machine-readable format, which the official exports partly satisfy. Keeping processing on the user's device avoids becoming a data processor at all — a strong argument for a local-first design.

## Platform access reality

Capture and delivery are asymmetric: none of the three consumer assistants offers an API to read your chat history, so capture is always user-mediated, while delivery into Claude and ChatGPT has official MCP routes. That asymmetry is the core design fact.

| Platform | Read chats out (capture) | Write context in (delivery) | Constraints that matter |
| --- | --- | --- | --- |
| **Gemini (consumer app)** | Google Takeout: My Activity > Gemini Apps, HTML or JSON ([guide](https://xtrace.ai/blog/how-to-export-gemini-conversations)); per-chat Export to Docs and share links ([Williams College](https://service.williams.edu/TDClient/174/Portal/KB/ArticleDet?ID=8334)) | Paste; memory import box (not in EEA, UK, CH); custom MCP apps reported for eligible US personal accounts only ([eseospace](https://eseospace.com/blog/google-mcp/)) | Takeout is slow, needs activity saving on, misses deleted chats, and some users get empty archives ([Workalizer](https://workalizer.com/insights/gemini/troubleshooting-empty-gemini-history-exports-from-google-takeout-for-google-workspace-users)). The Gemini API is model access, not access to your app chats. |
| **Claude** | Data export: Settings > Privacy (ZIP) | Custom connectors over remote MCP, including Free (1 connector) ([Claude Help](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-MCP)); local MCP servers in Claude Desktop; memory import; paste | Remote connectors are called from Anthropic's cloud, so the server must be reachable on the public internet; a local-only server needs Claude Desktop or a tunnel |
| **ChatGPT** | Data export: Settings > Data controls (`conversations.json` tree) | Developer mode: full MCP client, read and write tools, write actions confirmed by default ([OpenAI](https://developers.openai.com/api/docs/guides/developer-mode)); paste | Developer mode is reported as a paid-plan beta ([CXO Digital Pulse](https://www.cxodigitalpulse.com/?p=37809)); no import feature |
| **Coding agents** (Claude Code, Cursor, Gemini or Antigravity CLI) | Local files and logs | Local stdio MCP; rules files | Best fit for live two-way sync |

Evidence note: Gemini rows rely on vendor-adjacent guides and secondary sources, not Google's own pages opened in full; verify before the demo.

### Fallback ladder: what happens when direct access is not supported

Try each rung in order; every rung below keeps the same review gate and the same output format, so the user experience degrades gracefully instead of breaking.

1. **Official programmatic route** — MCP connector into the destination (Claude, ChatGPT developer mode, coding agents). Used for delivery.
2. **Official bulk export** — Takeout, Claude or ChatGPT export, parsed locally. Reliable and sanctioned, but slow (minutes to hours).
3. **Official per-chat export** — Gemini Export to Docs, share links, copy-response buttons. Sanctioned, one chat at a time.
4. **User-initiated page capture** — browser extension reads the open, visible chat when the user clicks. Fast; fragile to UI changes; must be read-only.
5. **Clipboard** — user copies and pastes. Always works, everywhere, including mobile and locked-down machines.

**Explicitly not on the ladder** (the brief's "rather than bypassing security controls"): storing passwords, replaying session cookies against private endpoints, headless browsing of the user's account, CAPTCHA solving, or reading chats the user did not open.

### Any assistant: design by capability, not by product

The three products above are examples. New assistants appear monthly, so the product classifies every source and destination by what it can do, and each class has a known path. Supporting a new assistant means writing one adapter, not a new bridge.

| Side | Capability class | Examples | Path |
| --- | --- | --- | --- |
| Source | Official export | ChatGPT, Claude, Gemini (Takeout) | Parse locally; most complete, slowest |
| Source | Readable web page with a dedicated adapter | Gemini, ChatGPT, Claude web | Capture on click; structured turns and files |
| Source | Readable web page, no adapter yet | Any other web assistant | Generic capture of the user's text selection, roles inferred, flagged as lower confidence |
| Source | No page access | Mobile apps, desktop apps | Copy or share → paste |
| Destination | MCP client | Claude Desktop, Claude Code, Cursor, ChatGPT developer mode, CLI agents | Push the brief, pull details with read-only tools |
| Destination | Accepts file uploads | Most web assistants | Pack as a Markdown file plus original attachments; the destination reads the file |
| Destination | Paste only | Restricted or mobile chats | One budgeted block with a manifest of what was left out |

Worst case on both sides (no adapter, paste-only destination) still works: selection or paste in, budgeted block out, same sanitiser and review.

## Requirements

Every requirement below traces to a use case or motivation; anything that cannot be traced is out of scope. Priority uses MoSCoW for a 1-day build.

### Functional

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| F1 | Capture the open conversation as ordered turns (role, text, code blocks, timestamps if visible) | U1–U6 | Must |
| F2 | Ingest pasted text and official exports (ChatGPT JSON, Claude ZIP, Gemini Takeout) into the same turn format | U12–U16, fallback ladder | Must (paste); Should (exports) |
| F3 | Let the user select messages, or accept an auto-suggested selection | U1, U3, M8 | Must |
| F4 | Produce a structured brief (goal, state, decisions, constraints, artifacts, open questions) with source-turn citations | U1, U2, U7, U10 | Must |
| F5 | Keep code and artifacts verbatim | U4, U5 | Must |
| F6 | Show the exact payload, token estimate, destination and data-policy note before sending | Consent model | Must |
| F7 | Deliver by clipboard plus opening the destination | U16, fallback rung 5 | Must |
| F8 | Deliver via an MCP server the destination can call (read-only tools) | U9, M9 | Should |
| F9 | Save a brief as a reusable context pack with expiry | U7, U10, U11 | Could |
| F10 | Export to vendor-native formats (Claude memory text, ChatGPT instructions, rules files) | U8, U12 | Could |
| F11 | Merge several conversations into one pack with deduplication | U7 | Won't (this round) |
| F12 | Any-to-any through source and destination adapter interfaces, plus generic selection capture for sites without an adapter | All motivations; capability classes | Must |
| F13 | Capture every part of a turn by type (text, code, table, image, file, citation, tool result) and keep an attachment manifest with a status per item | Inputs and outputs inventory | Must |
| F14 | Process attachments locally: text extracted from documents, images carried and described, data files summarised by schema and sample | Inputs and outputs inventory | Must for images and text documents; Should for data files |
| F15 | Push a compact pack; keep the full history and files retrievable through read-only tools | Push-and-pull; U1, U7, U10 | Must |
| F16 | Transfer profiles that set budget, condensing and what is pushed | Transfer profiles | Must for Continue, Rescue, Second opinion; Should for the rest |
| F17 | Compile the pack to each destination's budget, with a visible cut list | Worst case: paste-only destination | Must |

### Non-functional

| ID | Requirement | Why | Priority |
| --- | --- | --- | --- |
| N1 | Local-first: no server of ours sees content | GDPR, M7, trust | Must |
| N2 | Redact secrets and personal data by default; user can unredact | M7, M8, U4 | Must |
| N3 | Content travels as data in a fixed envelope; never as instructions | Prompt injection | Must |
| N4 | Read only on user action; least browser permissions | Extension threats | Must |
| N5 | Every brief item cites a source turn; uncited items flagged | Faithfulness | Must |
| N6 | Works with no paid service (local model, free tier or no LLM at all) | Brief, M4 | Must |
| N7 | Graceful fallback at every step; never a silent empty send | Reliability | Must |
| N8 | Local audit log of transfers | M7, consent | Should |
| N9 | Adapter isolation: a broken site adapter cannot affect others; selector tests detect UI drift | Reliability | Should |
| N10 | Handoff in under 60 seconds for a 3-hour chat (target, to be measured) | M2 | Should |
| N11 | Synthetic fixtures only in tests and demo | Brief | Must |
| N12 | Incremental, cached processing: an unchanged turn or file is never condensed or extracted twice | Cost and latency; M2, M4 | Should |
| N13 | Attachment safety: size limits, metadata stripped, parsing isolated, no active content executed | Files are an attack and leak vector | Must |
| N14 | Nothing dropped silently: every left-out turn or file is listed | Trust; no important context lost | Must |

## Non-goals

Saying no is part of the design; each non-goal protects either security, the timebox, or user trust.

| Non-goal | Why |
| --- | --- |
| Automatic background syncing of all chats | Violates least access and consent per transfer; makes the extension a surveillance tool if compromised |
| Signing into assistants on the user's behalf or storing credentials | Brief forbids bypassing controls; credential storage is the highest-risk asset |
| Calling undocumented internal APIs of chat apps | Breaks without notice, may violate terms, and looks like bypassing controls |
| Our own cloud backend or account system | Adds a data processor, cost and attack surface with no user benefit for the core case |
| Moving hidden reasoning, system prompts or model internals | Not visible to the user, not theirs to move, and model-specific |
| Uploading files into a vendor's storage on the user's behalf | That is a write action in the user's account; we hand files to the destination through MCP or to the user for upload instead |
| Replacing vendor memory features | Vendors already import memory; we feed them (export to their format) rather than compete |
| Real user conversations in demo or tests | Brief forbids it; synthetic fixtures only |

## How we will know it works

"Reliable" must be measured: the real question is whether the destination can continue as well as if it had seen the whole chat. We test that with synthetic conversations that carry planted facts, traps and attacks.

### Test set (synthetic only)

20–30 generated conversations, each seeded with: 5–10 must-carry facts and decisions, one reversed decision, one code artifact, one image and one PDF attachment, fake secrets in realistic formats, a fake email and phone number, one indirect-injection string inside quoted content, and at least two non-English chats. Ground truth is known because we planted it.

### Metrics

| Metric | How measured | Proposed target |
| --- | --- | --- |
| Continuation accuracy | Destination model answers probe questions given (a) full transcript, (b) our brief, (c) nothing; score b relative to a | b ≥ 90% of a |
| Must-carry recall | Share of planted facts and decisions present in the brief | ≥ 95% |
| Faithfulness | Share of brief items supported by their cited turn (rule checks + an LLM judge from a different model family) | ≥ 98%; zero invented decisions |
| Superseded handling | Reversed decision shown as the latest one | 100% |
| Artifact integrity | Code blocks byte-identical (hash compare) | 100% |
| Redaction | Recall and precision on planted secrets and PII | Recall 100% on secrets; precision ≥ 90% |
| Injection resistance | Destination follows the planted instruction? | 0 successes |
| Compression | Brief tokens / transcript tokens | Reported, not targeted |
| Capture robustness | Adapter parses saved synthetic page fixtures; fails loudly on drift | No silent failures |
| Time to handoff | Click to destination ready | < 60 s |
| Attachment coverage | Share of planted files and images that arrive carried, extracted or listed in the manifest | 100% accounted for |
| Token efficiency | Continuation accuracy per 1k pushed tokens, compared across profiles and against sending the full transcript | Reported; Continue should beat full transcript per token |
| Retrieval success | Probes answerable only from detail outside the pushed pack, answered after the destination calls a retrieval tool | ≥ 80% |
| Second-opinion independence | In blind mode, check the pack for any trace of the source assistant's conclusion | 0 leaks |

Targets are starting proposals to calibrate on the first run, not claims.

### Method notes

- **Deterministic first:** hashes, regex and schema checks run before any LLM judge, because they are cheap and exact.
- **LLM-as-judge with care:** a different model from the summariser, a fixed rubric, and a 10% human spot check to estimate judge error.
- **Regression gate:** the same suite runs on every prompt or model change; prompts are versioned like code.
- **Free to run:** a local model (for example via Ollama) or free-tier keys; the suite must also run with the condenser off (verbatim mode).

## Decisions needed before design

Recommendation: **Option A, a thin end-to-end prototype, plus a short design write-up** for everything the prototype does not build. A working slice proves engineering skill; the write-up proves breadth; together they answer both deliverable lists.

*Update: these questions are settled, with reasoning, in the [Technical Design & Implementation Plan](https://claude.ai/artifact/4VG72u7fxYm8a9tZw14dAV). After review, scope widened to any-to-any transfer with full-fidelity capture and push-and-pull delivery.*

### Proposed 1-day slice (Gemini → Claude)

1. **Capture:** a read-only browser extension that captures the open Gemini chat on click, plus a paste box as the fallback (rungs 4 and 5).
2. **Select:** message checklist with a suggested default.
3. **Condense:** structured brief with source-turn citations; local model or free tier; verbatim mode when no model is available.
4. **Protect:** secret and PII redaction, hidden-text stripping, data envelope.
5. **Consent:** preview screen with the exact payload, token count and destination.
6. **Deliver:** a local MCP server read by Claude Desktop (free plan) exposing `list_packs` and `get_pack`, plus clipboard and open-tab fallback.
7. **Evaluate:** 5 synthetic fixtures through the metrics above, results in a table.

Each part would be labelled built, mocked or inferred in the demo, as the brief asks.

### Open questions

- [ ] Option A (prototype) or Option B (design only)?
- [ ] Direction: Gemini → Claude as in the brief, or also ChatGPT?
- [ ] Condenser: local model (needs a capable laptop) or a free-tier API key?
- [ ] Delivery: local MCP in Claude Desktop, or a remote connector via a tunnel for claude.ai web?
- [ ] Stack preference: TypeScript throughout, or Python for the MCP server and evals?

## Sources

- Challenge brief: "Cross-Assistant Context Bridge" technical take-home (PDF supplied by the user)
- [Get started with custom connectors using remote MCP — Claude Help Center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-MCP)
- [ChatGPT developer mode — OpenAI](https://developers.openai.com/api/docs/guides/developer-mode)
- [OpenAI introduces developer mode — CXO Digital Pulse](https://www.cxodigitalpulse.com/?p=37809)
- [How to export Gemini conversations — xtrace](https://xtrace.ai/blog/how-to-export-gemini-conversations)
- [Saving Gemini chats — Williams College](https://service.williams.edu/TDClient/174/Portal/KB/ArticleDet?ID=8334)
- [Empty Gemini Takeout exports — Workalizer](https://workalizer.com/insights/gemini/troubleshooting-empty-gemini-history-exports-from-google-takeout-for-google-workspace-users)
- [Google and MCP overview — eseospace](https://eseospace.com/blog/google-mcp/)
- [Landscape & Architecture research doc](https://claude.ai/artifact/6s46JnE4WviHwfHZ2D2ezV) (extension incidents, memory poisoning, vendor imports, with its own sources)

Inferences not verified against a primary source are marked in the text (frequency of use cases, metric targets, Gemini MCP availability).
