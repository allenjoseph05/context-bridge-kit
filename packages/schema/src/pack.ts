// Destination and pack shapes from specs/plan/data-model.md §Destination and pack.
import { z } from "zod";
import { ATTACHMENT_ID, ITEM_ID, PACK_ID, TURN_ID, TURN_RANGE } from "./ids.js";
import { Item } from "./items.js";
import { IsoDateTime, Sha256Hex, TranscriptSource, Turn, TurnIdSchema } from "./transcript.js";

export const Route = z.enum(["mcp", "bundle", "clipboard"]);
export type Route = z.infer<typeof Route>;

export const Profile = z.enum(["continue", "rescue", "second_opinion"]);
export type Profile = z.infer<typeof Profile>;

export const PackIdSchema = z.string().regex(PACK_ID, "pack id must look like cp_9f2c41ab");

export const DestinationProfile = z.object({
  route: Route,
  canPull: z.boolean(),
  acceptsImages: z.boolean(),
  acceptsFiles: z.boolean(),
  pushBudgetTokens: z.number().int().nonnegative(),
});
export type DestinationProfile = z.infer<typeof DestinationProfile>;

const MANIFEST_REF_PATTERNS = [TURN_ID, TURN_RANGE, ATTACHMENT_ID, ITEM_ID];

export const ManifestEntry = z.object({
  ref: z
    .string()
    .refine(
      (r) => MANIFEST_REF_PATTERNS.some((re) => re.test(r)),
      "ref must be a turn id, turn range, attachment id or item id",
    ),
  what: z.string(),
  why: z.enum(["condensed", "budget", "profile", "unavailable", "excluded_by_user", "ungrounded"]),
  pull: z.string().optional(),
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

export const PackStats = z.object({
  capturedTokens: z.number().int().nonnegative(),
  pushedTokens: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative(),
  cutCount: z.number().int().nonnegative(),
});
export type PackStats = z.infer<typeof PackStats>;

export const Redaction = z.object({ placeholder: z.string(), kind: z.string() });
export type Redaction = z.infer<typeof Redaction>;

export const ContextPack = z.object({
  schema: z.literal("contextpack/0.2"),
  id: PackIdSchema,
  title: z.string(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  source: TranscriptSource,
  profile: Profile,
  blind: z.boolean(),
  mode: z.enum(["condensed", "verbatim"]),
  destination: DestinationProfile,
  push: z.object({
    items: z.array(Item),
    artifacts: z.array(
      z.object({
        turnId: TurnIdSchema,
        partIndex: z.number().int().nonnegative(),
        kind: z.enum(["code", "table", "math"]),
        content: z.string(),
        sha256: Sha256Hex,
      }),
    ),
    attachments: z.array(
      z.object({
        id: z.string().regex(ATTACHMENT_ID, "attachment id must look like a001"),
        as: z.enum(["image", "excerpt", "summary", "file"]),
        excerpt: z.string().optional(),
      }),
    ),
    recentTurns: z.array(Turn),
    manifest: z.array(ManifestEntry),
  }),
  pull: z.object({ transcriptRef: z.string(), indexRef: z.string() }),
  redactions: z.array(Redaction),
  notices: z.array(z.string()),
  stats: PackStats,
});
export type ContextPack = z.infer<typeof ContextPack>;

export const PackMeta = z.object({
  id: PackIdSchema,
  title: z.string(),
  source: TranscriptSource,
  profile: Profile,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  stats: PackStats,
});
export type PackMeta = z.infer<typeof PackMeta>;
