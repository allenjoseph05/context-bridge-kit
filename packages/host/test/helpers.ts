// Shared test helpers for T07. Synthetic data only; every vault lives in a fresh temp dir.
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HostToExt, Transcript } from "@cb/schema";
import type { Part } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { canonicalJson } from "@cb/schema";
import { openVault } from "@cb/vault";
import type { Vault } from "@cb/vault";
import { afterEach, expect } from "vitest";
import { createHost } from "../src/session.js";
import type { Host } from "../src/session.js";

const FIXTURES = fileURLToPath(new URL("../../schema/test-fixtures/", import.meta.url));

export function loadFixture(name: string): Transcript {
  return Transcript.parse(JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")));
}

/** Planted in small-chat.json t007; must never reach the vault or the audit log. */
export const PLANTED_SECRET = "sk-proj-FAKEFAKEFAKEFAKEFAKE1234";
export const PLANTED_EMAIL = "jane.doe@example.com";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fresh temp directory, removed after the test. */
export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "cb-host-"));
  dirs.push(d);
  return d;
}

export const T0 = new Date("2026-11-03T10:00:00Z");

/** Every file under `root`, recursively, as absolute paths. */
export function walk(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Files the vault holds for packs (packs/, transcripts/, index/). */
export function packFiles(root: string): string[] {
  return walk(root).filter((p) => /[\\/](packs|transcripts|index)[\\/]/.test(p.slice(root.length)));
}

export type Harness = {
  host: Host;
  vault: Vault;
  root: string;
  replies: HostToExt[];
  /** Send one message (requestId added) and return the replies it produced. */
  send(msg: Record<string, unknown>): Promise<HostToExt[]>;
  /** Send raw (no requestId added). */
  sendRaw(raw: unknown): Promise<HostToExt[]>;
};

/** Deterministic ids for tests: pack ids cp_00000001, cp_00000002, … and a fixed fence. */
export type HarnessOptions = { deterministicIds?: boolean };

export function harness(opts: HarnessOptions = {}): Harness {
  const root = tempDir();
  const vault = openVault({ root, now: () => T0 });
  const replies: HostToExt[] = [];
  let packs = 0;
  const ids = opts.deterministicIds
    ? {
        newPackId: (): string => `cp_${(++packs).toString(16).padStart(8, "0")}`,
        fenceRng: (): Uint8Array => new Uint8Array([0xa1, 0xb2, 0xc3]),
      }
    : {};
  const host = createHost({ vault, send: (m) => replies.push(m), now: () => T0, ...ids });
  const sendRaw = async (raw: unknown): Promise<HostToExt[]> => {
    const from = replies.length;
    await host.handle(raw);
    const got = replies.slice(from);
    // Every reply is a valid protocol message.
    for (const r of got) expect(HostToExt.safeParse(r).success, JSON.stringify(r)).toBe(true);
    return got;
  };
  return {
    host,
    vault,
    root,
    replies,
    sendRaw,
    send: (msg) => sendRaw({ requestId: randomUUID(), ...msg }),
  };
}

/** The single reply of a request, asserted to have the given type. */
export function only<T extends HostToExt["type"]>(
  replies: HostToExt[],
  type: T,
): Extract<HostToExt, { type: T }> {
  const last = replies[replies.length - 1];
  expect(last?.type, JSON.stringify(last)).toBe(type);
  return last as Extract<HostToExt, { type: T }>;
}

/** ingest → compile; returns the session id and the preview. */
export async function ingestAndCompile(
  h: Harness,
  fixture: string,
  compile: Record<string, unknown> = {},
): Promise<{
  sessionId: string;
  ingested: Extract<HostToExt, { type: "ingested" }>;
  preview: Extract<HostToExt, { type: "preview" }>;
}> {
  const ingested = only(await h.send({ type: "ingest", transcript: loadFixture(fixture) }), "ingested");
  const preview = only(
    await h.send({
      type: "compile",
      sessionId: ingested.sessionId,
      selection: ingested.suggestedSelection,
      profile: "continue",
      route: "clipboard",
      mode: "verbatim",
      ...compile,
    }),
    "preview",
  );
  return { sessionId: ingested.sessionId, ingested, preview };
}

/** A synthetic transcript from part lists, one turn each, alternating user/assistant. */
export function makeTranscript(
  turns: Part[][],
  attachments: Transcript["attachments"] = [],
): Transcript {
  return Transcript.parse({
    schema: "transcript/0.2",
    source: { assistant: "gemini", adapter: "test@0", confidence: "structured", title: "Synthetic" },
    capturedAt: "2026-11-03T09:00:00.000Z",
    turns: turns.map((parts, i) => ({
      id: `t${String(i + 1).padStart(3, "0")}`,
      role: i % 2 === 0 ? "user" : "assistant",
      parts,
      sha256: sha256Hex(canonicalJson(parts)),
    })),
    attachments,
    extras: {},
    warnings: [],
  });
}

export const text = (t: string): Part => ({ kind: "text", text: t });
