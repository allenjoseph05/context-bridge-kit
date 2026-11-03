// Row 11: during a full session, every byte on stdout is a framed protocol message.
// (The ESLint `no-console` rule for packages/host covers the static half.)
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { HostToExt } from "@cb/schema";
import { openVault } from "@cb/vault";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDecoder, encode } from "../src/framing.js";
import { runHost } from "../src/main.js";
import { loadFixture, tempDir } from "./helpers.js";

const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";

afterEach(() => vi.restoreAllMocks());

describe("stdout", () => {
  it("T07 stdout is protocol only", async () => {
    const root = tempDir();
    const vault = openVault({ root });
    vault.writeConfig({ ...vault.readConfig(), extensionId: EXT_ID });

    const written: Buffer[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
      return true;
    }) as typeof process.stdout.write);
    const logSpy = vi.spyOn(console, "log");
    const infoSpy = vi.spyOn(console, "info");
    const debugSpy = vi.spyOn(console, "debug");

    const messages: HostToExt[] = [];
    const decoder = createDecoder((m) => messages.push(HostToExt.parse(m)));
    let seen = 0;
    const waitFor = async (n: number): Promise<HostToExt> => {
      for (let i = 0; i < 500 && messages.length < n; i++) {
        while (seen < written.length) decoder.push(written[seen++]!);
        if (messages.length < n) await new Promise((r) => setTimeout(r, 10));
      }
      expect(messages.length).toBeGreaterThanOrEqual(n);
      return messages[n - 1]!;
    };

    const stdin = new PassThrough();
    const done = runHost({ args: [`chrome-extension://${EXT_ID}/`], stdin, stdout: process.stdout, vault });
    const send = (m: Record<string, unknown>): void => {
      stdin.write(encode({ requestId: randomUUID(), ...m }));
    };

    send({ type: "hello", protocol: 1 });
    await waitFor(1);
    send({ type: "ingest", transcript: loadFixture("small-chat") });
    const ing = await waitFor(2);
    if (ing.type !== "ingested") throw new Error(JSON.stringify(ing));
    send({
      type: "compile",
      sessionId: ing.sessionId,
      selection: ing.suggestedSelection,
      profile: "continue",
      route: "bundle",
      mode: "verbatim",
    });
    const prev = await waitFor(3);
    if (prev.type !== "preview") throw new Error(JSON.stringify(prev));
    send({ type: "approve", sessionId: ing.sessionId, previewId: prev.previewId, hash: prev.hash });
    const com = await waitFor(4);
    if (com.type !== "committed") throw new Error(JSON.stringify(com));
    send({ type: "list_packs" });
    await waitFor(5);
    send({ type: "bogus" });
    await waitFor(6);
    send({ type: "delete_pack", packId: com.packId });
    await waitFor(7);
    stdin.end();

    expect(await done).toBe(0);

    // Every write was a Buffer, and all bytes together decode as whole frames with no remainder.
    expect(writeSpy).toHaveBeenCalled();
    for (const call of writeSpy.mock.calls) expect(Buffer.isBuffer(call[0])).toBe(true);
    const check: unknown[] = [];
    const strict = createDecoder(
      (m) => check.push(m),
      (e) => {
        throw new Error(`stray bytes on stdout: ${JSON.stringify(e)}`);
      },
    );
    strict.push(Buffer.concat(written));
    expect(strict.buffered()).toBe(0);
    expect(check.map((m) => (m as { type: string }).type)).toEqual([
      "hello_ok",
      "ingested",
      "preview",
      "committed",
      "packs",
      "error",
      "deleted",
    ]);

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });
});
