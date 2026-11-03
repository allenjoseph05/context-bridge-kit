# Data model

Defined once in `@cb/schema` with zod. Types below are the contract; field names are exact.
Every other package imports from `@cb/schema` and never redefines these shapes.

## IDs
| Kind | Format | Example |
| --- | --- | --- |
| Turn | `t` + 3 digits, by position | `t007` |
| Attachment | `a` + 3 digits, by order of appearance | `a002` |
| Item | `i` + 3 digits, assigned by the host | `i014` |
| Pack | `cp_` + 8 lowercase hex | `cp_9f2c41ab` |
| Session | `s_` + 8 lowercase hex | `s_0b7e11c3` |
| Preview | `p_` + 8 lowercase hex | `p_44aa0912` |

## Transcript (capture output; never leaves the device)
```ts
type Part =
  | { kind: "text"; text: string }
  | { kind: "code"; lang?: string; content: string }
  | { kind: "table"; markdown: string }
  | { kind: "math"; latex: string }
  | { kind: "citation"; url: string; title?: string }
  | { kind: "tool_output"; tool?: string; content: string }   // final result only
  | { kind: "attachment"; attachmentId: string };

type Turn = {
  id: string;                         // t001…
  role: "user" | "assistant";
  parts: Part[];                      // at least one
  createdAt?: string;                 // ISO 8601 if the page shows it
  sha256: string;                     // of canonical JSON of parts
};

type Attachment = {
  id: string;                         // a001…
  turnId: string;
  origin: "user_upload" | "generated" | "project";
  name: string;
  mime: string;
  bytes?: number;
  sha256?: string;                    // set once bytes are available
  status: "carried" | "extracted" | "listed" | "unavailable";
  reason?: string;                    // why listed/unavailable, shown to the user
  extractRef?: string;                // vault path of extracted text
  summary?: string;                   // one line: dims for images, schema for CSV, pages for PDF
  flags: Array<"scanned_pdf" | "possible_instruction" | "metadata_stripped">;
};

type Transcript = {
  schema: "transcript/0.2";
  source: {
    assistant: string;                // "gemini" | "chatgpt" | hostname | "paste"
    adapter: string;                  // "gemini@0.1" | "chatgpt@0.1" | "generic@0.1" | "paste@0.1"
    url?: string;
    title?: string;
    confidence: "structured" | "inferred";
  };
  capturedAt: string;
  turns: Turn[];                      // at least one, else a CaptureError
  attachments: Attachment[];
  extras: Record<string, unknown>;    // source-specific data kept, not dropped
  warnings: string[];
};
```

## Item (extracted knowledge)
```ts
type ItemKind = "goal" | "state" | "next_step" | "decision" | "constraint"
              | "fact" | "open_question" | "preference";

type ItemDraft = {                    // what the model returns (see plan/extractor.md)
  kind: ItemKind;
  text: string;                       // ≤ 280 chars
  topic?: string;                     // 1–4 words; required for decision and constraint
  sourceTurns: string[];              // ≥ 1
  evidence: string;                   // exact quote from one of sourceTurns, ≤ 200 chars
  attachmentRefs: string[];
  origin: "user" | "assistant";
};

type Item = ItemDraft & {
  id: string;                         // i001…
  status: "active" | "superseded";
  flags: Array<"ungrounded" | "possible_instruction" | "redacted">;
};
```

## Destination and pack
```ts
type Route = "mcp" | "bundle" | "clipboard";
type Profile = "continue" | "rescue" | "second_opinion";

type DestinationProfile = {
  route: Route;
  canPull: boolean;                   // true only for mcp
  acceptsImages: boolean;             // mcp, bundle: true; clipboard: false
  acceptsFiles: boolean;              // bundle only; mcp: false (files reached by pull, get_attachment)
  pushBudgetTokens: number;           // effective budget, see plan/compiler.md
};

type ManifestEntry = {
  ref: string;                        // turn id, turn range "t001-t040", attachment or item id
  what: string;                       // one line the user and destination can read
  why: "condensed" | "budget" | "profile" | "unavailable" | "excluded_by_user" | "ungrounded";
                                      // condensed = summarised into the pushed items above
  pull?: string;                      // e.g. "get_turns(['t012'])" when the route can pull
};

type ContextPack = {
  schema: "contextpack/0.2";
  id: string;                         // cp_…
  title: string;
  createdAt: string;
  expiresAt: string;
  source: Transcript["source"];
  profile: Profile;
  blind: boolean;                     // second_opinion only
  mode: "condensed" | "verbatim";
  destination: DestinationProfile;
  push: {
    items: Item[];                    // in compiler priority order
    artifacts: Array<{ turnId: string; partIndex: number; kind: "code" | "table" | "math";
                       lang?: string;           // code-fence language, from the code part
                       content: string; sha256: string }>;
    attachments: Array<{ id: string; as: "image" | "excerpt" | "summary" | "file";
                         name: string; mime: string;   // from the transcript Attachment
                         excerpt?: string }>;
    recentTurns: Turn[];              // verbatim
    manifest: ManifestEntry[];
  };
  pull: { transcriptRef: string; indexRef: string };   // vault paths; never sent
  redactions: Array<{ placeholder: string; kind: string; revealed?: true }>;
                                      // never a value; revealed = the user chose to share it at
                                      // review, so the value is in the envelope (AC-05)
  notices: string[];                  // e.g. "Model unavailable: verbatim pack"
  stats: { capturedTokens: number; pushedTokens: number; budget: number; cutCount: number };
};
```

## Invariants (enforced by code and tests)
1. **Artifacts are copied, not generated:** `artifacts[].content` equals the part in the transcript
   byte for byte; `sha256` matches. (AC-10)
2. **Grounded items:** after normalisation, `evidence` is a substring of one of `sourceTurns`;
   otherwise the item carries `ungrounded`. (AC-11)
3. **Total coverage:** every turn id is in `push.recentTurns` or inside a manifest `ref` (single id
   or range); every attachment id is in `push.attachments` or in the manifest. (AC-09)
4. **Budget:** `stats.pushedTokens ≤ stats.budget`. (AC-08)
