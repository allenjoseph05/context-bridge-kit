// Spawns the real host entry (src/main.ts via tsx) as Chrome would: origin argument, framed stdio.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { endianness } from "node:os";
import { fileURLToPath } from "node:url";
import { HostToExt } from "@cb/schema";
import { openVault } from "@cb/vault";
import { describe, expect, it } from "vitest";
import { createDecoder, encode, MAX_INCOMING_BYTES } from "../src/framing.js";
import { tempDir } from "./helpers.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${EXT_ID}/`;

type Run = {
  child: ChildProcess;
  messages: unknown[];
  stdoutBytes: () => number;
  /** Resolves with the exit code. */
  exited: Promise<number | null>;
  /** Resolves once `n` messages have been decoded from stdout. */
  waitFor: (n: number) => Promise<void>;
};

function startHost(args: string[]): Run {
  const root = tempDir();
  const vault = openVault({ root });
  vault.writeConfig({ ...vault.readConfig(), extensionId: EXT_ID });

  const child = spawn(process.execPath, ["--import", "tsx", MAIN, ...args], {
    cwd: REPO,
    env: { ...process.env, CB_VAULT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages: unknown[] = [];
  let bytes = 0;
  const waiters: Array<{ n: number; resolve: () => void }> = [];
  const decoder = createDecoder((m) => {
    messages.push(m);
    for (const w of waiters.filter((x) => messages.length >= x.n)) w.resolve();
  });
  child.stdout!.on("data", (b: Buffer) => {
    bytes += b.length;
    decoder.push(b);
  });
  child.stderr!.on("data", () => undefined);
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return {
    child,
    messages,
    stdoutBytes: () => bytes,
    exited,
    waitFor: (n) =>
      messages.length >= n ? Promise.resolve() : new Promise((resolve) => waiters.push({ n, resolve })),
  };
}

describe("main", () => {
  it("AC-20 caller origin enforced", async () => {
    const run = startHost(["chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/"]);
    run.child.stdin!.on("error", () => undefined); // the host may exit before we write
    run.child.stdin!.write(encode({ type: "hello", requestId: "r1", protocol: 1 }));
    expect(await run.exited).toBe(1);
    expect(run.stdoutBytes()).toBe(0);
  }, 30_000);

  it("AC-20 missing origin argument exits with code 1", async () => {
    const run = startHost([]);
    run.child.stdin!.on("error", () => undefined);
    run.child.stdin!.end();
    expect(await run.exited).toBe(1);
    expect(run.stdoutBytes()).toBe(0);
  }, 30_000);

  it("T07 right origin answers hello and exits 0 when stdin closes", async () => {
    // Windows passes --parent-window after the origin.
    const run = startHost([ORIGIN, "--parent-window=0"]);
    run.child.stdin!.write(encode({ type: "hello", requestId: "r1", protocol: 1 }));
    await run.waitFor(1);
    const reply = HostToExt.parse(run.messages[0]);
    expect(reply).toMatchObject({ type: "hello_ok", requestId: "r1", protocol: 1 });
    run.child.stdin!.end();
    expect(await run.exited).toBe(0);
  }, 30_000);

  it("T07 frame over 64 MB gets invalid_message without being buffered", async () => {
    const run = startHost([ORIGIN]);
    const header = Buffer.alloc(4);
    if (endianness() === "LE") header.writeUInt32LE(MAX_INCOMING_BYTES + 1);
    else header.writeUInt32BE(MAX_INCOMING_BYTES + 1);
    // Only the header and a little of the body: the host must answer without waiting for 64 MB.
    run.child.stdin!.write(Buffer.concat([header, Buffer.alloc(1024, 0x61)]));
    await run.waitFor(1);
    const reply = HostToExt.parse(run.messages[0]);
    expect(reply).toMatchObject({ type: "error", code: "invalid_message", requestId: "unknown" });
    run.child.stdin!.end();
    expect(await run.exited).toBe(0);
  }, 30_000);
});
