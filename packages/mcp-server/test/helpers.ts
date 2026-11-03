// Shared test helpers for T11. Synthetic data only; every vault lives in a fresh temp dir.
// Packs are seeded through the real host (ingest → compile → approve, route mcp), so the stored
// transcript and index are exactly what the host writes.
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHost } from "@cb/host";
import { canonicalJson, Transcript } from "@cb/schema";
import type { HostToExt, Part } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { countTokens } from "@cb/tokens";
import { openVault } from "@cb/vault";
import type { Vault } from "@cb/vault";
import { afterEach, expect } from "vitest";
import { createServer } from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("../../schema/test-fixtures/", import.meta.url));

export function loadFixture(name: string): Transcript {
  return Transcript.parse(JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")));
}

const dirs: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) await c.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "cb-mcp-"));
  dirs.push(d);
  return d;
}

export const T0 = new Date("2026-11-03T10:00:00Z");
export const DAY = 24 * 3_600_000;

/** Every regular file under `dir`, recursively, as absolute paths. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Parsed lines of `audit.jsonl` (empty if the file does not exist). */
export function auditLines(root: string): Record<string, unknown>[] {
  let raw: string;
  try {
    raw = readFileSync(join(root, "audit.jsonl"), "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

export const text = (t: string): Part => ({ kind: "text", text: t });

/** A synthetic transcript from part lists, one turn each, alternating user/assistant. */
export function makeTranscript(turns: Part[][], attachments: unknown[] = []): Transcript {
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

/**
 * Deterministic filler of at least `tokens` tokens. Every word carries `tag`, so two fillers
 * with different tags share no words.
 */
export function filler(tag: string, tokens: number): string {
  const words: string[] = [];
  let i = 0;
  let out = "";
  while (countTokens(out) < tokens) {
    for (let j = 0; j < 50; j += 1) words.push(`${tag}${i++}`);
    out = words.join(" ");
  }
  return out;
}

export type Seed = {
  root: string;
  /** Vault on `root` with the seeding clock (T0). */
  vault: Vault;
  /** Ingest, compile (route mcp, verbatim) and approve; returns the pack id and preview. */
  approve(
    transcript: Transcript,
    compile?: Record<string, unknown>,
  ): Promise<{ packId: string; envelope: string; budget: number }>;
};

export function seedVault(root: string = tempDir()): Seed {
  const vault = openVault({ root, now: () => T0 });
  const replies: HostToExt[] = [];
  const host = createHost({ vault, send: (m) => replies.push(m), now: () => T0 });
  const send = async (msg: Record<string, unknown>): Promise<HostToExt> => {
    const from = replies.length;
    await host.handle({ requestId: randomUUID(), ...msg });
    const last = replies.slice(from).at(-1);
    if (last === undefined) throw new Error("host sent no reply");
    return last;
  };
  return {
    root,
    vault,
    async approve(transcript, compile = {}) {
      const ingested = await send({ type: "ingest", transcript });
      expect(ingested.type, JSON.stringify(ingested)).toBe("ingested");
      if (ingested.type !== "ingested") throw new Error("ingest failed");
      const preview = await send({
        type: "compile",
        sessionId: ingested.sessionId,
        selection: transcript.turns.map((t) => t.id),
        profile: "continue",
        route: "mcp",
        mode: "verbatim",
        ...compile,
      });
      expect(preview.type, JSON.stringify(preview)).toBe("preview");
      if (preview.type !== "preview") throw new Error("compile failed");
      const committed = await send({
        type: "approve",
        sessionId: ingested.sessionId,
        previewId: preview.previewId,
        hash: preview.hash,
      });
      expect(committed.type, JSON.stringify(committed)).toBe("committed");
      if (committed.type !== "committed") throw new Error("approve failed");
      return { packId: committed.packId, envelope: preview.envelope, budget: preview.stats.budget };
    },
  };
}

/** An MCP client connected in-process to a server reading the vault at `root` with clock `now`. */
export async function connect(root: string, now: () => Date = () => T0): Promise<Client> {
  const server = createServer({ vault: openVault({ root, now }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "cb-test", version: "0.0.0" });
  await client.connect(clientSide);
  clients.push(client);
  return client;
}

export type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: string; [k: string]: unknown };

export type ToolResult = { isError?: boolean; content: Content[] };

export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

/** The text blocks of a result. */
export function texts(r: ToolResult): string[] {
  return r.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text);
}

/** All text of a result joined, for searching. */
export function allText(r: ToolResult): string {
  return texts(r).join("\n");
}

/** The notice that wraps pack content: reference data from another assistant, not instructions. */
export const NOTICE_RE = /reference data[^\n]*not instructions/i;

/** The result's text block after the notice line (the payload). */
export function payload(r: ToolResult): string {
  const t = texts(r);
  expect(t.length, JSON.stringify(r)).toBeGreaterThanOrEqual(2);
  expect(t[0]).toMatch(NOTICE_RE);
  return t.slice(1).join("\n");
}

/** Truncation suffix of a capped page (mcp-server.md §Rules). */
export const TRUNCATED_RE = /\n… \[truncated; call again with offset=(\d+)\]$/;
