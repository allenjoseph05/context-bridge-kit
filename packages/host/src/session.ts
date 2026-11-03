// Sessions and message handlers (protocol.md, host.md §Pipeline per session).
// Sessions live in memory only; redaction values never leave the session's SanitizeContext.
import { readFileSync } from "node:fs";
import { buildBundle, compile, newFence } from "@cb/compiler";
import { buildIndex, docsFromTranscript } from "@cb/index";
import {
  canonicalJson,
  ExtToHost,
  newPackId,
  newPreviewId,
  newSessionId,
  TURN_RANGE,
  ATTACHMENT_ID,
} from "@cb/schema";
import type {
  ContextPack,
  Deliverable,
  ErrorCode,
  Flag,
  HostToExt,
  Part,
  Profile,
  Route,
  Transcript,
  Turn,
} from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { createContext, sanitizeTranscript, unredact } from "@cb/sanitizer";
import type { SanitizeContext } from "@cb/sanitizer";
import type { FenceRng } from "@cb/compiler";
import { destinationProfile } from "@cb/tokens";
import type { Vault } from "@cb/vault";

export type HostOptions = {
  vault: Vault;
  /** Sends one reply; the transport chunks and frames it. */
  send: (msg: HostToExt) => void;
  hostVersion?: string;
  /** Injectable clock for pack dates. */
  now?: () => Date;
  /** Injectable pack id generator (tests); default `newPackId`. */
  newPackId?: () => string;
  /** Injectable fence RNG (tests); default: the compiler's crypto RNG. */
  fenceRng?: FenceRng;
};

export type Host = {
  /** Handle one decoded incoming message (any JSON value). Replies go through `send`. */
  handle(raw: unknown): Promise<void>;
  /** Port closed: drop every session and its redaction values. */
  close(): void;
  /** Number of live sessions. */
  sessionCount(): number;
};

/** The host's version, from packages/host/package.json (read once, relative to dist/ or src/). */
const HOST_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;
const RECENT_TURNS = 10;
const DAY_MS = 24 * 3_600_000;
/** Pack id draws before giving up with `vault_error` (a collision needs 4 random bytes to repeat). */
const PACK_ID_TRIES = 5;
const CONDENSED_NOTICE = "condensed mode arrives in T19";

/** `sha256(envelope + "\n" + JSON.stringify(imageIds))`, lowercase hex (AC-15). */
export function previewHash(envelope: string, imageIds: string[]): string {
  return sha256Hex(envelope + "\n" + JSON.stringify(imageIds));
}

/** A number followed by a unit from a fixed list (decisions.md, T07 test review (d)). */
const NUMBER_WITH_UNIT =
  /(?<![\w.,])\d+(?:[.,]\d+)?\s?(?:%|ms|s|sec|min|h|[KMGT]i?B|px|kg|g|km|m|cm|mm|[$€£¥])(?![\w])|[$€£¥]\s?\d/;

function partText(p: Part): string | undefined {
  switch (p.kind) {
    case "text":
      return p.text;
    case "table":
      return p.markdown;
    case "code":
    case "tool_output":
      return p.content;
    default:
      return undefined;
  }
}

function isNotable(turn: Turn): boolean {
  return turn.parts.some(
    (p) =>
      p.kind === "code" ||
      p.kind === "table" ||
      p.kind === "attachment" ||
      (p.kind === "text" && NUMBER_WITH_UNIT.test(p.text)),
  );
}

/**
 * host.md §Suggested selection: the last 10 turns plus any earlier turn with a code part, a table,
 * an attachment, or a number with a unit. Turn ids in transcript order.
 */
/** Manifest reasons that mean "deliberately left out": never stored, never pullable. */
const WITHHELD = new Set(["excluded_by_user", "profile"]);

/**
 * The transcript the vault may hold for `pack` (host.md §Pipeline, approve): without turns the
 * manifest marks `excluded_by_user` or `profile` (ranges expanded in transcript order), and without
 * attachments the user excluded or whose turn was dropped. `droppedShas` are the shas of dropped
 * attachments that no kept attachment shares.
 */
export function shareableTranscript(
  transcript: Transcript,
  pack: ContextPack,
): { transcript: Transcript; droppedShas: string[] } {
  const position = new Map(transcript.turns.map((t, i) => [t.id, i]));
  const droppedTurns = new Set<string>();
  const droppedAttachments = new Set<string>();
  for (const m of pack.push.manifest) {
    if (m.why === "excluded_by_user" && ATTACHMENT_ID.test(m.ref)) droppedAttachments.add(m.ref);
    if (!WITHHELD.has(m.why)) continue;
    const [first, last] = TURN_RANGE.test(m.ref) ? m.ref.split("-") : [m.ref, m.ref];
    const from = position.get(first ?? "");
    const to = position.get(last ?? "");
    if (from === undefined || to === undefined) continue; // attachment or item refs
    for (let i = from; i <= to; i++) droppedTurns.add(transcript.turns[i]!.id);
  }
  const dropped = (a: Transcript["attachments"][number]): boolean =>
    droppedAttachments.has(a.id) || droppedTurns.has(a.turnId);
  const kept = transcript.attachments.filter((a) => !dropped(a));
  const keptShas = new Set(kept.flatMap((a) => (a.sha256 ? [a.sha256] : [])));
  const droppedShas = [
    ...new Set(
      transcript.attachments.filter(dropped).flatMap((a) => (a.sha256 && !keptShas.has(a.sha256) ? [a.sha256] : [])),
    ),
  ];
  return {
    transcript: { ...transcript, turns: transcript.turns.filter((t) => !droppedTurns.has(t.id)), attachments: kept },
    droppedShas,
  };
}

export function suggestSelection(transcript: Transcript): string[] {
  const firstRecent = transcript.turns.length - RECENT_TURNS;
  return transcript.turns.filter((t, i) => i >= firstRecent || isNotable(t)).map((t) => t.id);
}

type CompileParams = {
  selection: string[];
  profile: Profile;
  route: Route;
  mode: "condensed" | "verbatim";
  blind: boolean;
  excluded: string[];
  forcedPush: string[];
  /** Placeholders the user chose to reveal (decisions.md, AC-05 rule); cumulative across revises. */
  revealed: string[];
};

type Preview = {
  previewId: string;
  hash: string;
  pack: ContextPack;
  envelope: string;
  params: CompileParams;
  /** The transcript this preview was compiled from (sanitised, plus revealed values); stored on approve. */
  transcript: Transcript;
};

type Session = {
  id: string;
  ctx: SanitizeContext;
  /** Sanitised; the only transcript the host uses or stores. */
  transcript: Transcript;
  flags: Flag[];
  /** The last preview; `approve` must match it. Consumed by a successful approve. */
  last?: Preview;
};

type Reply<T extends HostToExt["type"]> = Omit<Extract<HostToExt, { type: T }>, "type" | "requestId">;

class HostError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly recoverable: boolean = true,
    readonly extra: { needed?: number; budget?: number } = {},
  ) {
    super(message);
  }
}

function requestIdOf(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "requestId" in raw) {
    const r = (raw as { requestId: unknown }).requestId;
    if (typeof r === "string" && r !== "") return r;
  }
  return "unknown";
}

/** Protocol flags for a sanitised transcript: instruction-like text and redacted placeholders. */
function collectFlags(
  t: Transcript,
  instr: Record<string, Array<{ match: string; index: number }>>,
  ctx: SanitizeContext,
): Flag[] {
  const flags: Flag[] = [];
  const placeholders = [...ctx.redactions.values()].map((r) => r.placeholder);
  for (const turn of t.turns) {
    for (const f of instr[turn.id] ?? []) {
      flags.push({ ref: turn.id, kind: "possible_instruction", match: f.match, index: f.index });
    }
    for (const p of turn.parts) {
      const text = partText(p);
      if (text === undefined) continue;
      for (const ph of placeholders) {
        for (let i = text.indexOf(ph); i !== -1; i = text.indexOf(ph, i + ph.length)) {
          flags.push({ ref: turn.id, kind: "redacted", match: ph, index: i });
        }
      }
    }
  }
  return flags;
}

/** Restore revealed values in every part the sanitiser touches; recompute turn hashes. */
function revealTranscript(t: Transcript, placeholders: string[], ctx: SanitizeContext): Transcript {
  if (placeholders.length === 0) return t;
  const r = (x: string): string => unredact(x, placeholders, ctx);
  const turns = t.turns.map((turn) => {
    const parts = turn.parts.map((p): Part => {
      switch (p.kind) {
        case "text":
          return { ...p, text: r(p.text) };
        case "table":
          return { ...p, markdown: r(p.markdown) };
        case "code":
        case "tool_output":
          return { ...p, content: r(p.content) };
        default:
          return p;
      }
    });
    return { ...turn, parts, sha256: sha256Hex(canonicalJson(parts)) };
  });
  return { ...t, turns };
}

function hasDuplicates(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function union(a: string[], add: string[], remove: string[]): string[] {
  const drop = new Set(remove);
  return [...new Set([...a, ...add])].filter((x) => !drop.has(x));
}

export function createHost(options: HostOptions): Host {
  const { vault, send } = options;
  const now = options.now ?? ((): Date => new Date());
  const mintPackId = options.newPackId ?? newPackId;

  /** A pack id the vault does not have yet; a taken id is redrawn, never reused (decisions.md). */
  function freshPackId(): string {
    for (let i = 0; i < PACK_ID_TRIES; i++) {
      const id = mintPackId();
      if (!vaultCall(() => vault.hasPack(id))) return id;
    }
    throw new HostError("vault_error", `no unused pack id after ${PACK_ID_TRIES} tries`);
  }
  const sessions = new Map<string, Session>();

  function getSession(id: string): Session {
    const s = sessions.get(id);
    if (s === undefined) throw new HostError("unknown_session", "unknown session", true);
    return s;
  }

  async function ingest(transcript: Transcript): Promise<Reply<"ingested">> {
    if (hasDuplicates(transcript.turns.map((t) => t.id))) {
      throw new HostError("invalid_message", "duplicate turn id");
    }
    if (hasDuplicates(transcript.attachments.map((a) => a.id))) {
      throw new HostError("invalid_message", "duplicate attachment id");
    }
    // Always sanitise here, whatever the extension did or claims (decisions.md, T07).
    const ctx = createContext();
    const sanitised = await sanitizeTranscript(transcript, ctx);
    const flags = collectFlags(sanitised.transcript, sanitised.flags, ctx);
    const id = newSessionId();
    sessions.set(id, { id, ctx, transcript: sanitised.transcript, flags });
    const redactions = [...ctx.redactions.values()].map((r) => ({ placeholder: r.placeholder, kind: r.kind }));
    vault.audit({
      event: "captured",
      sessionId: id,
      counts: {
        turns: sanitised.transcript.turns.length,
        attachments: sanitised.transcript.attachments.length,
        redactions: redactions.length,
        flags: flags.length,
      },
    });
    return {
      sessionId: id,
      turns: sanitised.transcript.turns,
      attachments: sanitised.transcript.attachments,
      flags,
      redactions,
      missingFiles: sanitised.transcript.attachments.filter((a) => a.sha256 === undefined).map((a) => a.id),
      suggestedProfile: "continue",
      suggestedSelection: suggestSelection(sanitised.transcript),
    };
  }

  /** Verbatim compile → preview. Stores it as the session's last preview only on success. */
  async function buildPreview(s: Session, params: CompileParams): Promise<Reply<"preview">> {
    const createdAt = now();
    const expiryDays = vault.readConfig().defaults.expiryDays;
    const id = freshPackId();
    const meta = {
      id,
      title: s.transcript.source.title ?? "Untitled chat",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + expiryDays * DAY_MS).toISOString(),
      pull: { transcriptRef: `transcripts/${id}.json`, indexRef: `index/${id}.json` },
    };
    const transcript = revealTranscript(s.transcript, params.revealed, s.ctx);
    const result = await compile({
      transcript,
      selection: params.selection,
      items: [],
      profile: params.profile,
      blind: params.blind,
      mode: "verbatim", // condensed arrives in T19
      destination: destinationProfile(params.route, params.profile),
      excluded: params.excluded,
      forcedPush: params.forcedPush,
      meta,
      fence: newFence(JSON.stringify({ transcript, meta }), options.fenceRng),
    });
    if (!result.ok) {
      const { needed, budget } = result.error;
      throw new HostError(
        "over_budget",
        `the smallest pack needs ${needed} tokens; the budget is ${budget}`,
        true,
        { needed, budget },
      );
    }
    // The envelope is used exactly as compile returned it; redactions are not rendered in it.
    const revealed = new Set(params.revealed);
    const pack: ContextPack = {
      ...result.pack,
      redactions: [...s.ctx.redactions.values()].map((r) =>
        revealed.has(r.placeholder)
          ? { placeholder: r.placeholder, kind: r.kind, revealed: true as const }
          : { placeholder: r.placeholder, kind: r.kind },
      ),
    };
    const envelope = result.envelope;
    const images: Array<{ attachmentId: string; mime: string; dataBase64: string }> = []; // T16
    const hash = previewHash(envelope, images.map((i) => i.attachmentId));
    const previewId = newPreviewId();
    s.last = { previewId, hash, pack, envelope, params, transcript };
    vault.audit({ event: "previewed", sessionId: s.id, sha256: hash });
    return {
      sessionId: s.id,
      previewId,
      hash,
      envelope,
      images,
      // A revealed placeholder no longer appears anywhere, so its redacted-span flags go too.
      flags: s.flags.filter((f) => !(f.kind === "redacted" && f.match !== undefined && revealed.has(f.match))),
      cutList: pack.push.manifest,
      notices: params.mode === "condensed" ? [CONDENSED_NOTICE, ...pack.notices] : pack.notices,
      stats: pack.stats,
    };
  }

  function currentPreview(s: Session, previewId: string, hash?: string): Preview {
    const last = s.last;
    if (last === undefined || last.previewId !== previewId || (hash !== undefined && last.hash !== hash)) {
      throw new HostError("hash_mismatch", "the preview changed; review the current preview and approve again");
    }
    return last;
  }

  function approve(s: Session, previewId: string, hash: string): Reply<"committed"> {
    const p = currentPreview(s, previewId, hash);
    const { pack, envelope } = p;
    const { transcript, droppedShas } = shareableTranscript(p.transcript, pack);
    let written;
    try {
      // The index covers the shareable transcript and the extracted text of its attachments.
      const extracted = new Map<string, string>();
      for (const a of transcript.attachments) {
        if (a.sha256 === undefined || a.status !== "extracted") continue;
        const t = vault.getText(a.sha256);
        if (t.ok) extracted.set(a.id, t.value);
      }
      written = vault.writePack(pack, envelope, transcript, buildIndex(docsFromTranscript(transcript, extracted)));
    } catch (e) {
      console.error("vault write failed:", e instanceof Error ? e.message : e);
      throw new HostError("vault_error", "could not write the pack to the vault");
    }
    if (!written.ok) throw new HostError("vault_error", `could not write the pack (${written.error.code})`);
    // Bytes of deliberately excluded attachments go now, unless another stored pack uses them.
    for (const sha of droppedShas) vaultCall(() => vault.releaseFile(sha));
    s.last = undefined; // a preview is approved once
    const route = p.params.route;
    vault.audit({ event: "approved", sessionId: s.id, packId: pack.id, route, sha256: hash });
    let deliverable: Deliverable;
    switch (route) {
      case "clipboard":
        deliverable = { kind: "clipboard", text: envelope };
        break;
      case "bundle":
        deliverable = {
          kind: "bundle",
          fileName: `context-pack-${pack.id}.zip`,
          zipBase64: Buffer.from(buildBundle(pack, envelope, new Map())).toString("base64"),
        };
        break;
      case "mcp":
        deliverable = {
          kind: "mcp",
          packId: pack.id,
          instruction: `Load context pack ${pack.id} with the Context Bridge tools.`,
        };
        break;
    }
    return { packId: pack.id, route, deliverable };
  }

  function vaultCall<T>(f: () => T): T {
    try {
      return f();
    } catch (e) {
      console.error("vault error:", e instanceof Error ? e.message : e);
      throw new HostError("vault_error", "the vault could not be read or written");
    }
  }

  async function dispatch(msg: ExtToHost): Promise<HostToExt> {
    const r = msg.requestId;
    switch (msg.type) {
      case "hello":
        return {
          type: "hello_ok",
          requestId: r,
          protocol: 1,
          hostVersion: options.hostVersion ?? HOST_VERSION,
          model: { available: false }, // model calls arrive in T17
        };
      case "ingest":
        return { type: "ingested", requestId: r, ...(await ingest(msg.transcript)) };
      case "add_file":
        throw new HostError("invalid_message", "attachments arrive in T15/T16");
      case "compile": {
        const s = getSession(msg.sessionId);
        const params: CompileParams = {
          selection: msg.selection,
          profile: msg.profile,
          route: msg.route,
          mode: msg.mode,
          blind: msg.blind ?? false,
          excluded: [],
          forcedPush: [],
          revealed: [],
        };
        return { type: "preview", requestId: r, ...(await buildPreview(s, params)) };
      }
      case "revise": {
        const s = getSession(msg.sessionId);
        const last = currentPreview(s, msg.previewId);
        const e = msg.edits;
        // Unknown placeholders are ignored (sanitizer `unredact` semantics).
        const known = new Set([...s.ctx.redactions.values()].map((x) => x.placeholder));
        const toManifest = [...e.moveToManifest, ...e.removeItemIds];
        const params: CompileParams = {
          ...last.params,
          excluded: union(last.params.excluded, toManifest, e.moveToPush),
          forcedPush: union(last.params.forcedPush, e.moveToPush, toManifest),
          revealed: union(last.params.revealed, e.unredact.filter((ph) => known.has(ph)), []),
        };
        return { type: "preview", requestId: r, ...(await buildPreview(s, params)) };
      }
      case "approve": {
        const s = getSession(msg.sessionId);
        return { type: "committed", requestId: r, ...approve(s, msg.previewId, msg.hash) };
      }
      case "delete_pack": {
        const res = vaultCall(() => vault.deletePack(msg.packId));
        // Idempotent: a pack that is already gone counts as deleted (decisions.md, T07).
        if (!res.ok && res.error.code !== "not_found") {
          throw new HostError("vault_error", `could not delete the pack (${res.error.code})`);
        }
        return { type: "deleted", requestId: r, packId: msg.packId };
      }
      case "list_packs": {
        const packs = vaultCall(() => {
          vault.sweepExpired();
          return vault.listPacks();
        });
        return { type: "packs", requestId: r, packs };
      }
    }
  }

  return {
    async handle(raw: unknown): Promise<void> {
      const requestId = requestIdOf(raw);
      const parsed = ExtToHost.safeParse(raw);
      if (!parsed.success) {
        // Name the failing fields only; never echo content.
        const where = parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join(".") || "message")
          .join(", ");
        send({ type: "error", requestId, code: "invalid_message", message: `invalid message: ${where}`, recoverable: true });
        return;
      }
      try {
        send(await dispatch(parsed.data));
      } catch (e) {
        if (e instanceof HostError) {
          send({
            type: "error",
            requestId,
            code: e.code,
            message: e.message,
            recoverable: e.recoverable,
            ...e.extra,
          });
        } else {
          console.error("internal error:", e instanceof Error ? e.stack : e);
          send({ type: "error", requestId, code: "internal", message: "internal error", recoverable: false });
        }
      }
    },
    close(): void {
      for (const s of sessions.values()) s.ctx.redactions.clear();
      sessions.clear();
    },
    sessionCount(): number {
      return sessions.size;
    },
  };
}
