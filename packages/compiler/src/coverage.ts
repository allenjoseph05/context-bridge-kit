// Coverage invariant (data-model.md §Invariants 3, AC-09).
import type { ContextPack, Transcript } from "@cb/schema";

export function checkCoverage(_transcript: Transcript, _pack: ContextPack): string[] {
  void [_transcript, _pack];
  throw new Error("T05 stub");
}
