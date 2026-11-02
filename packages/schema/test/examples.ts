// Synthetic example objects shaped exactly as in specs/plan/data-model.md and protocol.md.
// Shared by the T01 tests. No real conversation data.

const HEX64 = "a".repeat(64);
const ISO = "2026-11-02T10:00:00.000Z";

export const parts = {
  text: { kind: "text", text: "Let us plan the migration." },
  code: { kind: "code", lang: "ts", content: "const x = 1;\n" },
  codeNoLang: { kind: "code", content: "echo hi" },
  table: { kind: "table", markdown: "| a | b |\n| --- | --- |\n| 1 | 2 |" },
  math: { kind: "math", latex: "E = mc^2" },
  citation: { kind: "citation", url: "https://example.org/doc", title: "Doc" },
  toolOutput: { kind: "tool_output", tool: "python", content: "42" },
  attachment: { kind: "attachment", attachmentId: "a001" },
} as const;

export const turnUser = {
  id: "t001",
  role: "user",
  parts: [parts.text, parts.attachment],
  createdAt: ISO,
  sha256: HEX64,
};

export const turnAssistant = {
  id: "t002",
  role: "assistant",
  parts: [parts.code, parts.codeNoLang, parts.table, parts.math, parts.citation, parts.toolOutput],
  sha256: "b".repeat(64),
};

export const attachment = {
  id: "a001",
  turnId: "t001",
  origin: "user_upload",
  name: "diagram.png",
  mime: "image/png",
  bytes: 2048,
  sha256: HEX64,
  status: "carried",
  summary: "800x600 PNG",
  flags: ["metadata_stripped"],
};

export const attachmentListed = {
  id: "a002",
  turnId: "t002",
  origin: "generated",
  name: "report.pdf",
  mime: "application/pdf",
  status: "listed",
  reason: "Not exposed by the page",
  flags: [],
};

export const source = {
  assistant: "gemini",
  adapter: "gemini@0.1",
  url: "https://gemini.example/app/123",
  title: "Migration plan",
  confidence: "structured",
};

export const transcript = {
  schema: "transcript/0.2",
  source,
  capturedAt: ISO,
  turns: [turnUser, turnAssistant],
  attachments: [attachment, attachmentListed],
  extras: { model: "synthetic" },
  warnings: [],
};

export const captureError = { code: "capture_empty", message: "No turns found" };

export const itemDraft = {
  kind: "decision",
  text: "Use PostgreSQL for the main store.",
  topic: "database",
  sourceTurns: ["t002"],
  evidence: "we will use PostgreSQL",
  attachmentRefs: [],
  origin: "assistant",
};

export const itemDraftFact = {
  kind: "fact",
  text: "The service handles 200 requests per second.",
  sourceTurns: ["t001"],
  evidence: "200 requests per second",
  attachmentRefs: ["a001"],
  origin: "user",
};

export const item = {
  ...itemDraft,
  id: "i001",
  status: "active",
  flags: [],
};

export const destination = {
  route: "mcp",
  canPull: true,
  acceptsImages: true,
  acceptsFiles: false,
  pushBudgetTokens: 6000,
};

export const manifestEntries = [
  { ref: "t001-t040", what: "Early brainstorming", why: "condensed", pull: "get_turns(['t001'])" },
  { ref: "t041", what: "A side question", why: "budget" },
  { ref: "a002", what: "report.pdf", why: "unavailable" },
  { ref: "i003", what: "An unchecked claim", why: "ungrounded" },
];

export const stats = { capturedTokens: 12000, pushedTokens: 5000, budget: 6000, cutCount: 3 };

export const contextPack = {
  schema: "contextpack/0.2",
  id: "cp_9f2c41ab",
  title: "Migration plan",
  createdAt: ISO,
  expiresAt: "2026-11-09T10:00:00.000Z",
  source,
  profile: "continue",
  blind: false,
  mode: "condensed",
  destination,
  push: {
    items: [item],
    artifacts: [
      { turnId: "t002", partIndex: 0, kind: "code", content: "const x = 1;\n", sha256: HEX64 },
    ],
    attachments: [
      { id: "a001", as: "image" },
      { id: "a003", as: "excerpt", excerpt: "Page 1…" },
    ],
    recentTurns: [turnAssistant],
    manifest: manifestEntries,
  },
  pull: {
    transcriptRef: "vault/s_0b7e11c3/transcript.json",
    indexRef: "vault/s_0b7e11c3/index.json",
  },
  redactions: [{ placeholder: "[EMAIL_1]", kind: "email" }],
  notices: ["Model unavailable: verbatim pack"],
  stats,
};

export const packMeta = {
  id: "cp_9f2c41ab",
  title: "Migration plan",
  source,
  profile: "continue",
  createdAt: ISO,
  expiresAt: "2026-11-09T10:00:00.000Z",
  stats,
};

export const flag = {
  ref: "t001",
  kind: "possible_instruction",
  match: "ignore previous",
  index: 12,
};

const RID = "3f1c2a9e-5b7d-4c1e-9a2b-6d8e0f1a2b3c";

export const extToHost = {
  hello: { type: "hello", requestId: RID, protocol: 1 },
  ingest: { type: "ingest", requestId: RID, transcript },
  add_file: {
    type: "add_file",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    attachmentId: "a002",
    name: "report.pdf",
    mime: "application/pdf",
    dataBase64: "JVBERi0xLjQK",
  },
  compile: {
    type: "compile",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    selection: ["t001", "t002", "a001"],
    profile: "second_opinion",
    route: "bundle",
    mode: "condensed",
    blind: true,
  },
  revise: {
    type: "revise",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    previewId: "p_44aa0912",
    edits: {
      removeItemIds: ["i002"],
      keepUngroundedIds: [],
      unredact: ["[EMAIL_1]"],
      moveToManifest: ["t003"],
      moveToPush: [],
    },
  },
  approve: {
    type: "approve",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    previewId: "p_44aa0912",
    hash: HEX64,
  },
  delete_pack: { type: "delete_pack", requestId: RID, packId: "cp_9f2c41ab" },
  list_packs: { type: "list_packs", requestId: RID },
} as const;

export const hostToExt = {
  hello_ok: {
    type: "hello_ok",
    requestId: RID,
    protocol: 1,
    hostVersion: "0.1.0",
    model: { available: true, name: "qwen2.5:7b" },
  },
  ingested: {
    type: "ingested",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    turns: [turnUser, turnAssistant],
    attachments: [attachment],
    flags: [flag],
    redactions: [{ placeholder: "[EMAIL_1]", kind: "email" }],
    missingFiles: ["a002"],
    suggestedProfile: "continue",
    suggestedSelection: ["t001", "t002"],
  },
  file_added: { type: "file_added", requestId: RID, attachment },
  progress: { type: "progress", requestId: RID, stage: "extract", done: 2, total: 5 },
  preview: {
    type: "preview",
    requestId: RID,
    sessionId: "s_0b7e11c3",
    previewId: "p_44aa0912",
    hash: HEX64,
    envelope: "<context>…</context>",
    images: [{ attachmentId: "a001", mime: "image/png", dataBase64: "iVBORw0KGgo=" }],
    flags: [{ ref: "i001", kind: "ungrounded" }],
    cutList: manifestEntries,
    notices: [],
    stats,
  },
  committed_clipboard: {
    type: "committed",
    requestId: RID,
    packId: "cp_9f2c41ab",
    route: "clipboard",
    deliverable: { kind: "clipboard", text: "<context>…</context>" },
  },
  committed_bundle: {
    type: "committed",
    requestId: RID,
    packId: "cp_9f2c41ab",
    route: "bundle",
    deliverable: { kind: "bundle", fileName: "cp_9f2c41ab.zip", zipBase64: "UEsDBA==" },
  },
  committed_mcp: {
    type: "committed",
    requestId: RID,
    packId: "cp_9f2c41ab",
    route: "mcp",
    deliverable: {
      kind: "mcp",
      packId: "cp_9f2c41ab",
      instruction: "Load context pack cp_9f2c41ab",
    },
  },
  deleted: { type: "deleted", requestId: RID, packId: "cp_9f2c41ab" },
  packs: { type: "packs", requestId: RID, packs: [packMeta] },
  error: {
    type: "error",
    requestId: RID,
    code: "model_unavailable",
    message: "Local model is not running",
    recoverable: true,
    fallback: "verbatim",
  },
  chunk: { type: "chunk", messageId: "m1", index: 0, count: 2, data: '{"type":"pre' },
} as const;
