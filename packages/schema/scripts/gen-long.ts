// Generates test-fixtures/long-chat.json: 60 short synthetic turns, alternating roles, code in
// turns 10, 30 and 55. Deterministic (no randomness, no clock): same output on every run.
// Run: pnpm --filter @cb/schema gen:long
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canonicalJson,
  turnId,
  Transcript,
  type Part,
  type Turn,
} from "../src/index.js";
import { sha256Hex } from "../src/node.js";

const TURNS = 60;
const CODE_TURNS: ReadonlySet<number> = new Set([10, 30, 55]);
const TOPICS = ["logging", "retries", "config", "metrics", "caching", "timeouts"] as const;

function partsFor(n: number): Part[] {
  const topic = TOPICS[Math.floor((n - 1) / 2) % TOPICS.length] ?? "logging";
  const parts: Part[] = [];
  if (n % 2 === 1) {
    parts.push({ kind: "text", text: `Turn ${n}: what should the job runner do about ${topic}?` });
  } else {
    parts.push({ kind: "text", text: `Turn ${n}: keep ${topic} simple and document the default.` });
  }
  if (CODE_TURNS.has(n)) {
    parts.push({
      kind: "code",
      lang: "ts",
      content: `export const ${topic}Step${n} = (attempt: number): number =>\n  Math.min(1000 * 2 ** attempt, 30_000);\n`,
    });
  }
  return parts;
}

export function buildLongChat(): Transcript {
  const turns: Turn[] = [];
  for (let n = 1; n <= TURNS; n++) {
    const parts = partsFor(n);
    turns.push({
      id: turnId(n),
      role: n % 2 === 1 ? "user" : "assistant",
      parts,
      sha256: sha256Hex(canonicalJson(parts)),
    });
  }
  return Transcript.parse({
    schema: "transcript/0.2",
    source: {
      assistant: "claude",
      adapter: "fixture@0.1",
      title: "Job runner design (synthetic, generated)",
      confidence: "structured",
    },
    capturedAt: "2026-11-02T10:00:00.000Z",
    turns,
    attachments: [],
    extras: {},
    warnings: [],
  });
}

/** The exact file contents of long-chat.json. */
export function renderLongChat(): string {
  return JSON.stringify(buildLongChat(), null, 2) + "\n";
}

const OUT = fileURLToPath(new URL("../test-fixtures/long-chat.json", import.meta.url));

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, renderLongChat());
  console.error(`wrote ${OUT}`);
}
