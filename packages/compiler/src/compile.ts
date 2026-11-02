// Compiler: verbatim mode (T05). See specs/plan/compiler.md §API, §Verbatim mode.
import type { ContextPack, DestinationProfile, Item, Profile, Transcript } from "@cb/schema";

/** Thrown for modes that a later task implements. */
export class NotImplementedError extends Error {
  constructor(task: string) {
    super(`not implemented yet (${task})`);
    this.name = "NotImplementedError";
  }
}

export type CompileInput = {
  transcript: Transcript;
  selection: string[];
  items: Item[];
  profile: Profile;
  blind: boolean;
  mode: "condensed" | "verbatim";
  destination: DestinationProfile;
  excluded: string[];
  forcedPush: string[];
  meta: Pick<ContextPack, "id" | "title" | "createdAt" | "expiresAt" | "pull">;
  fence: string;
};

export type CompileError = { code: "over_budget"; needed: number; budget: number };

export type CompileResult =
  { ok: true; pack: ContextPack; envelope: string } | { ok: false; error: CompileError };

export function compile(_input: CompileInput): Promise<CompileResult> {
  void _input;
  return Promise.reject(new Error("T05 stub"));
}
