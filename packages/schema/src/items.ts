// Item shapes from specs/plan/data-model.md §Item.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ITEM_ID } from "./ids.js";
import { AttachmentIdSchema, TurnIdSchema } from "./transcript.js";

export const ItemKind = z.enum([
  "goal",
  "state",
  "next_step",
  "decision",
  "constraint",
  "fact",
  "open_question",
  "preference",
]);
export type ItemKind = z.infer<typeof ItemKind>;

/** 1–4 whitespace-separated words. */
const Topic = z
  .string()
  .trim()
  .min(1)
  .refine((t) => t.split(/\s+/).length <= 4, "topic must be 1–4 words");

const itemDraftShape = {
  kind: ItemKind,
  text: z.string().min(1).max(280),
  topic: Topic.optional(),
  sourceTurns: z.array(TurnIdSchema).min(1),
  evidence: z.string().max(200),
  attachmentRefs: z.array(AttachmentIdSchema),
  origin: z.enum(["user", "assistant"]),
};

const KINDS_NEEDING_TOPIC: ReadonlySet<ItemKind> = new Set(["decision", "constraint"]);

function requireTopic(
  v: { kind: ItemKind; topic?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (KINDS_NEEDING_TOPIC.has(v.kind) && v.topic === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["topic"],
      message: `topic is required for ${v.kind}`,
    });
  }
}

const ItemDraftObject = z.object(itemDraftShape);

export const ItemDraft = ItemDraftObject.superRefine(requireTopic);
export type ItemDraft = z.infer<typeof ItemDraft>;

export const Item = ItemDraftObject.extend({
  id: z.string().regex(ITEM_ID, "item id must look like i001"),
  status: z.enum(["active", "superseded"]),
  flags: z.array(z.enum(["ungrounded", "possible_instruction", "redacted"])),
}).superRefine(requireTopic);
export type Item = z.infer<typeof Item>;

/** What the model returns: `{ items: ItemDraft[] }`. */
export const ItemDrafts = z.object({ items: z.array(ItemDraft) });
export type ItemDrafts = z.infer<typeof ItemDrafts>;

/**
 * JSON Schema of `{ items: ItemDraft[] }` for the model's structured output.
 * Inlined (no `$ref`). The topic rule for decision/constraint cannot be expressed here;
 * it is enforced when the output is parsed with `ItemDrafts`.
 */
export function itemDraftsJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(ItemDrafts, { $refStrategy: "none" }) as Record<string, unknown>;
}
