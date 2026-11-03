// Transcript shapes from specs/plan/data-model.md §Transcript; CaptureError from plan/adapters.md.
import { z } from "zod";
import { ATTACHMENT_ID, SHA256_HEX, TURN_ID } from "./ids.js";

export const TurnIdSchema = z.string().regex(TURN_ID, "turn id must look like t001");
export const AttachmentIdSchema = z
  .string()
  .regex(ATTACHMENT_ID, "attachment id must look like a001");
export const Sha256Hex = z.string().regex(SHA256_HEX, "sha256 must be 64 lowercase hex chars");
export const IsoDateTime = z.string().datetime({ offset: true });

export const Part = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("code"), lang: z.string().optional(), content: z.string() }),
  z.object({ kind: z.literal("table"), markdown: z.string() }),
  z.object({ kind: z.literal("math"), latex: z.string() }),
  z.object({ kind: z.literal("citation"), url: z.string(), title: z.string().optional() }),
  z.object({ kind: z.literal("tool_output"), tool: z.string().optional(), content: z.string() }),
  z.object({ kind: z.literal("attachment"), attachmentId: AttachmentIdSchema }),
]);
export type Part = z.infer<typeof Part>;

export const Turn = z.object({
  id: TurnIdSchema,
  role: z.enum(["user", "assistant"]),
  parts: z.array(Part).min(1),
  createdAt: IsoDateTime.optional(),
  sha256: Sha256Hex,
});
export type Turn = z.infer<typeof Turn>;

export const Attachment = z.object({
  id: AttachmentIdSchema,
  turnId: TurnIdSchema,
  origin: z.enum(["user_upload", "generated", "project"]),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative().optional(),
  sha256: Sha256Hex.optional(),
  status: z.enum(["carried", "extracted", "listed", "unavailable"]),
  reason: z.string().optional(),
  extractRef: z.string().optional(),
  summary: z.string().optional(),
  /** PDF: character start of each page in the sanitised extracted text (T11 decision). */
  pageOffsets: z.array(z.number().int().nonnegative()).optional(),
  flags: z.array(z.enum(["scanned_pdf", "possible_instruction", "metadata_stripped"])),
});
export type Attachment = z.infer<typeof Attachment>;

export const TranscriptSource = z.object({
  assistant: z.string(),
  adapter: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  confidence: z.enum(["structured", "inferred"]),
});
export type TranscriptSource = z.infer<typeof TranscriptSource>;

export const Transcript = z.object({
  schema: z.literal("transcript/0.2"),
  source: TranscriptSource,
  capturedAt: IsoDateTime,
  turns: z.array(Turn).min(1),
  attachments: z.array(Attachment),
  extras: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});
export type Transcript = z.infer<typeof Transcript>;

export const CaptureError = z.object({
  code: z.enum(["capture_empty", "unsupported_page", "parse_failed"]),
  message: z.string(),
});
export type CaptureError = z.infer<typeof CaptureError>;
