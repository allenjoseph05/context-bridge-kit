// Shared test helpers for T06. Synthetic data only; every vault lives in a fresh temp dir.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, newFence } from "@cb/compiler";
import { Transcript } from "@cb/schema";
import type { Attachment, ContextPack } from "@cb/schema";
import { createContext, sanitizeTranscript } from "@cb/sanitizer";
import { destinationProfile } from "@cb/tokens";
import { afterEach } from "vitest";

const FIXTURES = fileURLToPath(new URL("../../schema/test-fixtures/", import.meta.url));

export function loadFixture(name: string): Transcript {
  return Transcript.parse(JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")));
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fresh temp directory, removed after the test. */
export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "cb-vault-"));
  dirs.push(d);
  return d;
}

export const T0 = new Date("2026-11-02T10:00:00Z");
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** A mutable fake clock. */
export function fakeClock(start: Date = T0): { now: () => Date; set: (d: Date) => void } {
  let t = start;
  return { now: () => t, set: (d) => (t = d) };
}

export type Built = { pack: ContextPack; envelope: string; transcript: Transcript };

/**
 * Sanitise a fixture and compile it (verbatim) into a pack with the given id, creation time and
 * attachment shas. Expiry is 7 days after `createdAt`.
 */
export async function buildPack(
  id: string,
  opts: { fixture?: string; createdAt?: Date; fileShas?: string[] } = {},
): Promise<Built> {
  const raw = loadFixture(opts.fixture ?? "small-chat");
  const attachments: Attachment[] = (opts.fileShas ?? []).map((sha, i) => ({
    id: `a${String(i + 1).padStart(3, "0")}`,
    turnId: raw.turns[0]!.id,
    origin: "user_upload",
    name: `synthetic-${i + 1}.pdf`,
    mime: "application/pdf",
    sha256: sha,
    status: "extracted",
    flags: [],
  }));
  const { transcript } = await sanitizeTranscript({ ...raw, attachments }, createContext());
  const created = opts.createdAt ?? T0;
  const result = await compile({
    transcript,
    selection: transcript.turns.map((t) => t.id),
    items: [],
    profile: "rescue",
    blind: false,
    mode: "verbatim",
    destination: { ...destinationProfile("clipboard", "rescue"), pushBudgetTokens: 4000 },
    excluded: [],
    forcedPush: [],
    meta: {
      id,
      title: "Task tracker planning (synthetic)",
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + 7 * DAY).toISOString(),
      pull: { transcriptRef: `transcripts/${id}.json`, indexRef: `index/${id}.json` },
    },
    fence: newFence(JSON.stringify(transcript)),
  });
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.error)}`);
  return { pack: result.pack, envelope: result.envelope, transcript };
}

/** Opaque stand-in for a BM25 index (T10 defines the format). */
export const INDEX = { version: 1, docs: [{ id: "t001", len: 12 }] };

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
  let text: string;
  try {
    text = readFileSync(join(root, "audit.jsonl"), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
