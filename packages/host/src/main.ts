// Host entry: origin check (AC-20), expiry sweep, then the framed protocol on stdin/stdout.
// stdout carries framed protocol messages only; every log line goes to stderr.
import { realpathSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { HostToExt } from "@cb/schema";
import { openVault } from "@cb/vault";
import type { Vault } from "@cb/vault";
import { chunkMessage } from "./chunking.js";
import { createDecoder, encode } from "./framing.js";
import type { DecodeError } from "./framing.js";
import { createHost } from "./session.js";

export type RunOptions = {
  /** Command-line arguments after the script: `[origin, ...]` (Windows may add `--parent-window`). */
  args: string[];
  stdin: Readable;
  stdout: Writable;
  /** Defaults to `openVault()` (CB_VAULT or ~/.context-bridge). */
  vault?: Vault;
};

function expectedOrigin(vault: Vault): string | undefined {
  try {
    const id = vault.readConfig().extensionId;
    return id ? `chrome-extension://${id}/` : undefined;
  } catch (e) {
    console.error("cannot read vault config:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

function decodeErrorMessage(e: DecodeError): string {
  return e.kind === "too_large"
    ? `message of ${e.bytes} bytes exceeds the 64 MiB limit`
    : "message is not valid JSON";
}

/**
 * Resolves with the exit code: 1 at once if the origin does not match `config.extensionId`
 * (stdin is never read), 0 once stdin closes and pending replies are written.
 */
export async function runHost(options: RunOptions): Promise<number> {
  const vault = options.vault ?? openVault();
  const origin = options.args[0];
  const expected = expectedOrigin(vault);
  if (expected === undefined || origin !== expected) {
    console.error("refusing caller origin (not the configured extension)");
    return 1;
  }

  try {
    vault.sweepExpired();
  } catch (e) {
    console.error("expiry sweep failed:", e instanceof Error ? e.message : e);
  }

  const send = (msg: HostToExt): void => {
    for (const part of chunkMessage(msg)) options.stdout.write(encode(part));
  };
  const host = createHost({ vault, send });

  // Handle messages one at a time, in arrival order.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void> | void): void => {
    queue = queue.then(job).catch((e: unknown) => {
      console.error("unhandled host error:", e instanceof Error ? e.stack : e);
    });
  };
  const decoder = createDecoder(
    (msg) => enqueue(() => host.handle(msg)),
    (err) =>
      enqueue(() =>
        send({
          type: "error",
          requestId: "unknown",
          code: "invalid_message",
          message: decodeErrorMessage(err),
          recoverable: true,
        }),
      ),
  );

  return new Promise<number>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      enqueue(() => undefined);
      void queue.then(() => {
        host.close(); // drops every session and its redaction values
        resolve(0);
      });
    };
    options.stdin.on("data", (chunk: Buffer) => decoder.push(chunk));
    options.stdin.on("end", finish);
    options.stdin.on("close", finish);
    options.stdin.on("error", (e) => {
      console.error("stdin error:", e.message);
      finish();
    });
  });
}

function isEntry(): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  void runHost({ args: process.argv.slice(2), stdin: process.stdin, stdout: process.stdout }).then(
    (code) => {
      if (code !== 0) process.exit(code); // nothing was written; exit before reading stdin
      process.exitCode = 0; // let pending stdout writes flush, then exit naturally
    },
  );
}
