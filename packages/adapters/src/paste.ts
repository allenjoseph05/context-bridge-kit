// Paste parser (plan/adapters.md §Paste parser, AC-03, AC-04): pasted chat text → Transcript.
// Runs in the extension panel, so no node: imports; turn hashes use WebCrypto.
import {
  canonicalJson,
  sha256HexWeb,
  turnId,
  type CaptureError,
  type Part,
  type Transcript,
  type Turn,
} from "@cb/schema";
import { fenceCloses, fenceOpen, splitMarkdown, type Fence } from "./markdown.js";

export const PASTE_ADAPTER = "paste@0.1";
const MAX_TURNS = 999; // turn ids are t001–t999

type Role = Turn["role"];

const MARKER = /^(user|you|me|assistant|chatgpt|gemini|claude|model|ai):[ \t]*(.*)$/i;
const USER_MARKERS = new Set(["user", "you", "me"]);
const PRODUCT_MARKERS = new Set(["chatgpt", "gemini", "claude"]);

interface Segment {
  role: Role;
  lines: string[];
}

/** Parse pasted chat text into a Transcript, or a CaptureError when nothing usable is found. */
export async function parsePaste(
  text: string,
  opts?: { title?: string },
): Promise<Transcript | CaptureError> {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized.trim() === "") {
    return { code: "capture_empty", message: "The pasted text is empty." };
  }

  const preamble: string[] = [];
  const segments: Segment[] = [];
  const products = new Set<string>();
  let fence: Fence | undefined;

  for (const line of normalized.split("\n")) {
    const current = segments[segments.length - 1];
    if (fence) {
      if (fenceCloses(line, fence)) fence = undefined;
      (current?.lines ?? preamble).push(line);
      continue;
    }
    const m = MARKER.exec(line);
    if (m?.[1] !== undefined) {
      const marker = m[1].toLowerCase();
      const role: Role = USER_MARKERS.has(marker) ? "user" : "assistant";
      if (PRODUCT_MARKERS.has(marker)) products.add(marker);
      const rest = m[2] ?? "";
      segments.push({ role, lines: [rest] });
      fence = fenceOpen(rest);
      continue;
    }
    fence = fenceOpen(line);
    (current?.lines ?? preamble).push(line);
  }

  const warnings: string[] = [];
  const bodies: { role: Role; parts: Part[] }[] = [];

  if (segments.length === 0) {
    warnings.push("no roles found");
    bodies.push({ role: "user", parts: splitMarkdown(normalized) });
  } else {
    const preParts = splitMarkdown(preamble.join("\n"));
    if (preParts.length > 0) {
      warnings.push("text before the first role marker was kept as a user turn");
      bodies.push({ role: "user", parts: preParts });
    }
    let skipped = 0;
    for (const seg of segments) {
      const parts = splitMarkdown(seg.lines.join("\n"));
      if (parts.length === 0) skipped++;
      else bodies.push({ role: seg.role, parts });
    }
    if (skipped > 0) warnings.push(`${skipped} empty turn${skipped === 1 ? "" : "s"} skipped`);
  }

  if (bodies.length === 0) {
    return { code: "capture_empty", message: "The pasted text has role markers but no content." };
  }
  if (bodies.length > MAX_TURNS) {
    return {
      code: "parse_failed",
      message: `The pasted text has ${bodies.length} turns; at most ${MAX_TURNS} are supported.`,
    };
  }

  const turns: Turn[] = await Promise.all(
    bodies.map(async (b, i): Promise<Turn> => ({
      id: turnId(i + 1),
      role: b.role,
      parts: b.parts,
      sha256: await sha256HexWeb(canonicalJson(b.parts)),
    })),
  );

  const [only] = products;
  return {
    schema: "transcript/0.2",
    source: {
      assistant: products.size === 1 && only !== undefined ? only : "unknown",
      adapter: PASTE_ADAPTER,
      ...(opts?.title !== undefined ? { title: opts.title } : {}),
      confidence: "inferred",
    },
    capturedAt: new Date().toISOString(),
    turns,
    attachments: [],
    extras: {},
    warnings,
  };
}
