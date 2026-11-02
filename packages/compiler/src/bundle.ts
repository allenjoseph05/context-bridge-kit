// Bundle zip (compiler.md §Bundle, AC-17).
import type { ContextPack } from "@cb/schema";

export function buildBundle(
  _pack: ContextPack,
  _envelope: string,
  _files: Map<string, Uint8Array>,
): Uint8Array {
  void [_pack, _envelope, _files];
  throw new Error("T05 stub");
}
