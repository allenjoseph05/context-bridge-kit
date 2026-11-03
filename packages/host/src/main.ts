// Host entry: origin check (AC-20), expiry sweep, then the framed protocol on stdin/stdout.
import type { Readable, Writable } from "node:stream";
import type { Vault } from "@cb/vault";

export type RunOptions = {
  /** Command-line arguments after the script: `[origin, ...]` (Windows may add `--parent-window`). */
  args: string[];
  stdin: Readable;
  stdout: Writable;
  /** Defaults to `openVault()` (CB_VAULT or ~/.context-bridge). */
  vault?: Vault;
};

/**
 * Resolves with the exit code: 1 at once if the origin does not match `config.extensionId`
 * (stdin is never read), 0 once stdin closes and pending replies are written.
 */
export function runHost(options: RunOptions): Promise<number> {
  void options;
  throw new Error("not implemented (T07)");
}
