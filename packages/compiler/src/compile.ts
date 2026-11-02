// Compiler: verbatim mode (T05). See specs/plan/compiler.md §API, §Verbatim mode.
// Pure and browser-safe: no `node:` imports; hashing uses WebCrypto (`sha256HexWeb`).
import { sha256HexWeb } from "@cb/schema";
import type {
  Attachment,
  ContextPack,
  DestinationProfile,
  Item,
  ManifestEntry,
  Part,
  Profile,
  Transcript,
  Turn,
} from "@cb/schema";
import { countTokens } from "@cb/tokens";
import { renderEnvelope, renderTurn } from "./envelope.js";

/** Thrown for modes that a later task implements. */
export class NotImplementedError extends Error {
  constructor(task: string) {
    super(`not implemented yet (${task})`);
    this.name = "NotImplementedError";
  }
}

export type CompileInput = {
  transcript: Transcript; // sanitised
  selection: string[]; // turn ids the user ticked
  items: Item[]; // [] in verbatim mode
  profile: Profile;
  blind: boolean;
  mode: "condensed" | "verbatim";
  destination: DestinationProfile;
  excluded: string[]; // ids the user removed at review
  forcedPush: string[]; // ids the user moved into push
  /** Filled by the host (T07). */
  meta: Pick<ContextPack, "id" | "title" | "createdAt" | "expiresAt" | "pull">;
  /** From `newFence` over the transcript; the envelope is rendered only here. */
  fence: string;
};

export type CompileError = { code: "over_budget"; needed: number; budget: number };

export type CompileResult =
  { ok: true; pack: ContextPack; envelope: string } | { ok: false; error: CompileError };

type Artifact = ContextPack["push"]["artifacts"][number];
type TurnWhy = Extract<ManifestEntry["why"], "budget" | "profile" | "excluded_by_user">;

const TURN_WHAT: Readonly<Record<TurnWhy, string>> = {
  excluded_by_user: "not selected",
  budget: "cut to fit the budget",
  profile: "answer withheld on purpose (blind)",
};

function artifactOf(part: Part): Pick<Artifact, "kind" | "content" | "lang"> | undefined {
  switch (part.kind) {
    case "code":
      return part.lang !== undefined
        ? { kind: "code", content: part.content, lang: part.lang }
        : { kind: "code", content: part.content };
    case "table":
      return { kind: "table", content: part.markdown };
    case "math":
      return { kind: "math", content: part.latex };
    default:
      return undefined;
  }
}

/** Code/table/math parts of a turn, copied byte for byte, with their sha256 (AC-10). */
async function turnArtifacts(turn: Turn): Promise<Artifact[]> {
  const found = turn.parts.flatMap((part, partIndex) => {
    const a = artifactOf(part);
    return a === undefined ? [] : [{ turnId: turn.id, partIndex, ...a }];
  });
  return Promise.all(found.map(async (a) => ({ ...a, sha256: await sha256HexWeb(a.content) })));
}

function turnNumber(id: string): number {
  return Number(id.slice(1));
}

/** Non-pushed turns in transcript order; consecutive turns with the same why share a range. */
function turnManifest(turns: readonly Turn[], why: ReadonlyMap<string, TurnWhy>): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  let run: { first: string; last: string; why: TurnWhy } | undefined;
  const flush = (): void => {
    if (run === undefined) return;
    const ref = run.first === run.last ? run.first : `${run.first}-${run.last}`;
    entries.push({ ref, what: TURN_WHAT[run.why], why: run.why });
    run = undefined;
  };
  for (const turn of turns) {
    const w = why.get(turn.id);
    if (w === undefined) {
      flush();
      continue;
    }
    if (run !== undefined && run.why === w && turnNumber(turn.id) === turnNumber(run.last) + 1) {
      run.last = turn.id;
    } else {
      flush();
      run = { first: turn.id, last: turn.id, why: w };
    }
  }
  flush();
  return entries;
}

/**
 * Attachments are not pushed in T05 (T16 adds images, excerpts and files). Listed/unavailable
 * ones are "unavailable"; the others take the reason of their turn ("profile" when it was pushed).
 */
function attachmentManifest(
  attachments: readonly Attachment[],
  why: ReadonlyMap<string, TurnWhy>,
): ManifestEntry[] {
  return attachments.map((a) => {
    if (a.status === "listed" || a.status === "unavailable") {
      return { ref: a.id, what: `${a.name}: ${a.reason ?? a.status}`, why: "unavailable" };
    }
    const turnWhy = why.get(a.turnId);
    return turnWhy !== undefined
      ? { ref: a.id, what: `${a.name} (in ${a.turnId})`, why: turnWhy }
      : { ref: a.id, what: `${a.name} (not pushed in verbatim mode)`, why: "profile" };
  });
}

function forcedNotice(count: number): string {
  return count === 1
    ? "1 turn you included didn't fit the budget; it is listed in the manifest."
    : `${count} turns you included didn't fit the budget; they are listed in the manifest.`;
}

/**
 * Compile a context pack. Verbatim mode: push selected turns whole, newest first; drop the oldest
 * unforced turn (then the oldest forced one) until the rendered envelope fits the budget.
 * Returns `over_budget` when even the envelope with no turn pushed is too large.
 */
export async function compile(input: CompileInput): Promise<CompileResult> {
  if (input.mode === "condensed") throw new NotImplementedError("T19");

  const { transcript, destination, fence, meta } = input;
  const budget = destination.pushBudgetTokens;
  const excluded = new Set(input.excluded);
  const forced = new Set(input.forcedPush.filter((id) => !excluded.has(id)));
  const selected = new Set([...input.selection, ...forced].filter((id) => !excluded.has(id)));

  // Fixed reasons for turns that can never be pushed; the rest are candidates.
  const fixedWhy = new Map<string, TurnWhy>();
  const candidates: Turn[] = [];
  for (const turn of transcript.turns) {
    if (input.blind && turn.role === "assistant") fixedWhy.set(turn.id, "profile");
    else if (!selected.has(turn.id)) fixedWhy.set(turn.id, "excluded_by_user");
    else candidates.push(turn);
  }
  // Drop order: oldest unforced first, then oldest forced.
  const dropOrder = [
    ...candidates.filter((t) => !forced.has(t.id)),
    ...candidates.filter((t) => forced.has(t.id)),
  ];
  const position = new Map(transcript.turns.map((t, i) => [t.id, i]));
  const artifacts = new Map(
    await Promise.all(candidates.map(async (t) => [t.id, await turnArtifacts(t)] as const)),
  );
  const turnTokens = new Map(candidates.map((t) => [t.id, countTokens(renderTurn(t))]));
  const capturedTokens = transcript.turns.reduce(
    (sum, t) => sum + (turnTokens.get(t.id) ?? countTokens(renderTurn(t))),
    0,
  );

  const build = (dropped: number): { pack: ContextPack; envelope: string; tokens: number } => {
    const pushed = dropOrder
      .slice(dropped)
      .sort((a, b) => (position.get(b.id) ?? 0) - (position.get(a.id) ?? 0));
    const pushedIds = new Set(pushed.map((t) => t.id));
    const why = new Map(fixedWhy);
    for (const t of candidates) if (!pushedIds.has(t.id)) why.set(t.id, "budget");
    const forcedCut = candidates.filter((t) => forced.has(t.id) && !pushedIds.has(t.id)).length;

    const pack: ContextPack = {
      schema: "contextpack/0.2",
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
      source: transcript.source,
      profile: input.profile,
      blind: input.blind,
      mode: "verbatim",
      destination,
      push: {
        items: [],
        artifacts: pushed.flatMap((t) => artifacts.get(t.id) ?? []),
        attachments: [],
        recentTurns: pushed,
        manifest: [
          ...turnManifest(transcript.turns, why),
          ...attachmentManifest(transcript.attachments, why),
        ],
      },
      pull: meta.pull,
      redactions: [],
      notices: forcedCut > 0 ? [forcedNotice(forcedCut)] : [],
      stats: {
        capturedTokens,
        pushedTokens: 0,
        budget,
        cutCount: candidates.length - pushed.length,
      },
    };
    const envelope = renderEnvelope(pack, { fence });
    const tokens = countTokens(envelope);
    pack.stats.pushedTokens = tokens;
    return { pack, envelope, tokens };
  };

  // Skip drops that cannot fit: while the pushed turns alone exceed the budget, the envelope
  // does too. Only an upper-bound shortcut; from there, drop one turn at a time.
  let start = 0;
  let pushedSum = dropOrder.reduce((sum, t) => sum + (turnTokens.get(t.id) ?? 0), 0);
  while (start < dropOrder.length && pushedSum > budget) {
    pushedSum -= turnTokens.get(dropOrder[start]?.id ?? "") ?? 0;
    start += 1;
  }
  for (let dropped = start; dropped <= dropOrder.length; dropped += 1) {
    const result = build(dropped);
    if (result.tokens <= budget) return { ok: true, pack: result.pack, envelope: result.envelope };
  }
  // Nothing fits. `needed` is the smallest pack compile can build, over every drop count (the
  // nothing-pushed pack is not always the smallest: a notice and manifest entries cost tokens).
  let needed = Infinity;
  for (let dropped = 0; dropped <= dropOrder.length; dropped += 1) {
    needed = Math.min(needed, build(dropped).tokens);
  }
  return { ok: false, error: { code: "over_budget", needed, budget } };
}
