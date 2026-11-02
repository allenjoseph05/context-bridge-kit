// Wire protocol from specs/plan/protocol.md (field types: §Field types).
import { z } from "zod";
import { PREVIEW_ID, SESSION_ID } from "./ids.js";
import {
  ManifestEntry,
  PackIdSchema,
  PackMeta,
  PackStats,
  Profile,
  Redaction,
  Route,
} from "./pack.js";
import {
  Attachment,
  AttachmentIdSchema,
  Sha256Hex,
  Transcript,
  Turn,
  TurnIdSchema,
} from "./transcript.js";

const RequestId = z.string().min(1);
const SessionIdSchema = z.string().regex(SESSION_ID, "session id must look like s_0b7e11c3");
const PreviewIdSchema = z.string().regex(PREVIEW_ID, "preview id must look like p_44aa0912");

export const ErrorCode = z.enum([
  "invalid_message",
  "unknown_session",
  "capture_empty",
  "file_refused",
  "model_unavailable",
  "model_invalid_output",
  "over_budget_orientation",
  "hash_mismatch",
  "vault_error",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const Flag = z.object({
  ref: z.string(),
  kind: z.enum(["possible_instruction", "redacted", "ungrounded"]),
  match: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
});
export type Flag = z.infer<typeof Flag>;

export const Edits = z
  .object({
    removeItemIds: z.array(z.string()),
    keepUngroundedIds: z.array(z.string()),
    unredact: z.array(z.string()),
    moveToManifest: z.array(z.string()),
    moveToPush: z.array(z.string()),
  })
  .strict();
export type Edits = z.infer<typeof Edits>;

export const ProgressStage = z.enum(["attachments", "extract", "ground", "compile"]);
export type ProgressStage = z.infer<typeof ProgressStage>;

// ---- Extension → host -------------------------------------------------------

const req = <T extends string>(type: T) =>
  z.object({ type: z.literal(type), requestId: RequestId });

export const HelloMsg = req("hello").extend({ protocol: z.literal(1) });
export const IngestMsg = req("ingest").extend({ transcript: Transcript });
export const AddFileMsg = req("add_file").extend({
  sessionId: SessionIdSchema,
  attachmentId: AttachmentIdSchema.optional(),
  name: z.string(),
  mime: z.string(),
  dataBase64: z.string(),
});
export const CompileMsg = req("compile").extend({
  sessionId: SessionIdSchema,
  selection: z.array(z.string()),
  profile: Profile,
  route: Route,
  mode: z.enum(["condensed", "verbatim"]),
  blind: z.boolean().optional(),
});
export const ReviseMsg = req("revise").extend({
  sessionId: SessionIdSchema,
  previewId: PreviewIdSchema,
  edits: Edits,
});
export const ApproveMsg = req("approve").extend({
  sessionId: SessionIdSchema,
  previewId: PreviewIdSchema,
  hash: Sha256Hex,
});
export const DeletePackMsg = req("delete_pack").extend({ packId: PackIdSchema });
export const ListPacksMsg = req("list_packs");

export const ExtToHost = z.discriminatedUnion("type", [
  HelloMsg,
  IngestMsg,
  AddFileMsg,
  CompileMsg,
  ReviseMsg,
  ApproveMsg,
  DeletePackMsg,
  ListPacksMsg,
]);
export type ExtToHost = z.infer<typeof ExtToHost>;

// ---- Host → extension -------------------------------------------------------

export const HelloOkMsg = req("hello_ok").extend({
  protocol: z.literal(1),
  hostVersion: z.string(),
  model: z.object({ available: z.boolean(), name: z.string().optional() }),
});
export const IngestedMsg = req("ingested").extend({
  sessionId: SessionIdSchema,
  turns: z.array(Turn),
  attachments: z.array(Attachment),
  flags: z.array(Flag),
  redactions: z.array(Redaction),
  missingFiles: z.array(AttachmentIdSchema),
  suggestedProfile: Profile,
  suggestedSelection: z.array(TurnIdSchema),
});
export const FileAddedMsg = req("file_added").extend({ attachment: Attachment });
export const ProgressMsg = req("progress").extend({
  stage: ProgressStage,
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export const PreviewMsg = req("preview").extend({
  sessionId: SessionIdSchema,
  previewId: PreviewIdSchema,
  hash: Sha256Hex,
  envelope: z.string(),
  images: z.array(
    z.object({ attachmentId: AttachmentIdSchema, mime: z.string(), dataBase64: z.string() }),
  ),
  flags: z.array(Flag),
  cutList: z.array(ManifestEntry),
  notices: z.array(z.string()),
  stats: PackStats,
});
export const Deliverable = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("clipboard"), text: z.string() }),
  z.object({ kind: z.literal("bundle"), fileName: z.string(), zipBase64: z.string() }),
  z.object({ kind: z.literal("mcp"), packId: PackIdSchema, instruction: z.string() }),
]);
export type Deliverable = z.infer<typeof Deliverable>;
export const CommittedMsg = req("committed").extend({
  packId: PackIdSchema,
  route: Route,
  deliverable: Deliverable,
});
export const DeletedMsg = req("deleted").extend({ packId: PackIdSchema });
export const PacksMsg = req("packs").extend({ packs: z.array(PackMeta) });
export const ErrorMsg = req("error").extend({
  code: ErrorCode,
  message: z.string(),
  recoverable: z.boolean(),
  fallback: z.enum(["paste", "verbatim", "clipboard"]).optional(),
});

/** Transport-level slice of a host → extension message over 900,000 bytes. */
export const Chunk = z.object({
  type: z.literal("chunk"),
  requestId: RequestId.optional(),
  messageId: z.string().min(1),
  index: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  data: z.string(),
});
export type Chunk = z.infer<typeof Chunk>;

export const HostToExt = z.discriminatedUnion("type", [
  HelloOkMsg,
  IngestedMsg,
  FileAddedMsg,
  ProgressMsg,
  PreviewMsg,
  CommittedMsg,
  DeletedMsg,
  PacksMsg,
  ErrorMsg,
  Chunk,
]);
export type HostToExt = z.infer<typeof HostToExt>;
