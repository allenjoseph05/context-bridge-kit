// The install scripts put the generated launcher and host manifest in <vault>/host/ (decision
// 2026-11-03, T07). Vault housekeeping must never touch that folder.
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HostToExt } from "@cb/schema";
import { openVault } from "@cb/vault";
import { describe, expect, it } from "vitest";
import { createHost } from "../src/session.js";
import { loadFixture, T0, tempDir, walk } from "./helpers.js";

const DAY = 24 * 3_600_000;

describe("install folder", () => {
  it("T07 sweepExpired and deletePack never touch the host folder", async () => {
    const root = tempDir();
    let now = T0;
    const vault = openVault({ root, now: () => now });

    // What the installer writes, made old enough to look expired and orphaned.
    const hostDir = join(root, "host");
    mkdirSync(hostDir, { recursive: true });
    const hostFiles: Record<string, string> = {
      "context-bridge-host": '#!/bin/sh\nexec "/usr/bin/node" "/x/dist/main.js" "$@"\n',
      "context-bridge-host.cmd": '@echo off\r\n"C:\\node\\node.exe" "C:\\x\\dist\\main.js" %*\r\n',
      "com.contextbridge.host.json": '{"name":"com.contextbridge.host"}\n',
    };
    const old = new Date(T0.getTime() - 365 * DAY);
    for (const [name, content] of Object.entries(hostFiles)) {
      writeFileSync(join(hostDir, name), content);
      utimesSync(join(hostDir, name), old, old);
    }

    // Two approved packs through the host.
    const replies: HostToExt[] = [];
    const host = createHost({ vault, send: (m) => replies.push(m), now: () => now });
    const packIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      await host.handle({ type: "ingest", requestId: `i${i}`, transcript: loadFixture("small-chat") });
      const ing = replies.at(-1)!;
      if (ing.type !== "ingested") throw new Error(JSON.stringify(ing));
      await host.handle({
        type: "compile",
        requestId: `c${i}`,
        sessionId: ing.sessionId,
        selection: ing.suggestedSelection,
        profile: "continue",
        route: "clipboard",
        mode: "verbatim",
      });
      const prev = replies.at(-1)!;
      if (prev.type !== "preview") throw new Error(JSON.stringify(prev));
      await host.handle({
        type: "approve",
        requestId: `a${i}`,
        sessionId: ing.sessionId,
        previewId: prev.previewId,
        hash: prev.hash,
      });
      const com = replies.at(-1)!;
      if (com.type !== "committed") throw new Error(JSON.stringify(com));
      packIds.push(com.packId);
    }

    // Delete one on demand (directly and through the protocol), let the other expire.
    expect(vault.deletePack(packIds[0]!).ok).toBe(true);
    await host.handle({ type: "delete_pack", requestId: "d1", packId: packIds[0]! });
    now = new Date(T0.getTime() + 60 * DAY);
    const report = vault.sweepExpired();
    expect(report.packs).toEqual([packIds[1]]);
    await host.handle({ type: "list_packs", requestId: "l1" });

    const left = walk(hostDir).map((p) => p.slice(hostDir.length + 1)).sort();
    expect(left).toEqual(Object.keys(hostFiles).sort());
    for (const [name, content] of Object.entries(hostFiles)) {
      expect(readFileSync(join(hostDir, name), "utf8")).toBe(content);
    }
  });
});
