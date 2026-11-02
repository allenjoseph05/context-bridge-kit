// Shared test helpers for T05. Synthetic data only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Transcript } from "@cb/schema";
import type { ContextPack, DestinationProfile, ManifestEntry, Profile, Route } from "@cb/schema";
import { destinationProfile } from "@cb/tokens";
import type { CompileInput } from "../src/compile.js";

const FIXTURES = fileURLToPath(new URL("../../schema/test-fixtures/", import.meta.url));

export function loadFixture(name: string): Transcript {
  return Transcript.parse(JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")));
}

export const LONG = loadFixture("long-chat");
export const ALL_IDS = LONG.turns.map((t) => t.id);

/** Fixed fence that does not occur in any fixture (checked in `input`). */
export const FENCE = "c0ffee";

export const META: CompileInput["meta"] = {
  id: "cp_1a2b3c4d",
  title: "Job runner design",
  createdAt: "2026-11-02T10:00:00Z",
  expiresAt: "2026-11-09T10:00:00Z",
  pull: { transcriptRef: "vault/s_0b7e11c3/transcript.json", indexRef: "vault/s_0b7e11c3/index" },
};

export function destination(
  budget: number,
  route: Route = "clipboard",
  profile: Profile = "rescue",
): DestinationProfile {
  return { ...destinationProfile(route, profile), pushBudgetTokens: budget };
}

/** A verbatim compile input; override any field. */
export function input(over: Partial<CompileInput> = {}): CompileInput {
  const transcript = over.transcript ?? LONG;
  if (JSON.stringify(transcript).includes(FENCE)) throw new Error("test fence occurs in fixture");
  return {
    transcript,
    selection: transcript.turns.map((t) => t.id),
    items: [],
    profile: "rescue",
    blind: false,
    mode: "verbatim",
    destination: destination(2000),
    excluded: [],
    forcedPush: [],
    meta: META,
    fence: FENCE,
    ...over,
  };
}

/** Turn number of `t007` → 7. */
export function turnNo(id: string): number {
  return Number(id.slice(1));
}

/** Expand a manifest turn ref (`t005` or `t003-t007`) to its turn ids; [] for non-turn refs. */
export function expandTurnRef(ref: string): string[] {
  const m = /^t(\d{3})(?:-t(\d{3}))?$/.exec(ref);
  if (m === null) return [];
  const from = Number(m[1]);
  const to = m[2] !== undefined ? Number(m[2]) : from;
  return Array.from({ length: to - from + 1 }, (_, i) => `t${String(from + i).padStart(3, "0")}`);
}

/** Map each turn id in the manifest to its entry. */
export function manifestByTurn(pack: ContextPack): Map<string, ManifestEntry> {
  const map = new Map<string, ManifestEntry>();
  for (const e of pack.push.manifest) for (const id of expandTurnRef(e.ref)) map.set(id, e);
  return map;
}
