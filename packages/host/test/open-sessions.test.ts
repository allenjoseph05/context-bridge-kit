// fix(host): at approve, the bytes of an excluded attachment stay while another open session
// references them (host.md §Pipeline, approve).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Part } from "@cb/schema";
import { describe, expect, it } from "vitest";
import { harness, makeTranscript, only, text } from "./helpers.js";
import type { Harness } from "./helpers.js";

/** Ingest a transcript whose t001 carries the stored file `sha` as a001; returns the session id. */
async function ingestWithFile(h: Harness, sha: string, body: string): Promise<string> {
  const attach: Part = { kind: "attachment", attachmentId: "a001" };
  const transcript = makeTranscript(
    [[text("Here are my notes."), attach], [text("Noted.")], [text("Next step?")], [text("Ship it.")]],
    [
      {
        id: "a001", turnId: "t001", origin: "user_upload", name: "notes.txt", mime: "text/plain",
        bytes: body.length, sha256: sha, status: "extracted", extractRef: `files/${sha}.txt`, flags: [],
      },
    ],
  );
  return only(await h.send({ type: "ingest", transcript }), "ingested").sessionId;
}

/** Compile without t001 (so a001 is excluded) and approve. */
async function approveWithoutFirstTurn(h: Harness, sessionId: string): Promise<void> {
  const preview = only(
    await h.send({
      type: "compile",
      sessionId,
      selection: ["t002", "t003", "t004"],
      profile: "continue",
      route: "mcp",
      mode: "verbatim",
    }),
    "preview",
  );
  only(await h.send({ type: "approve", sessionId, previewId: preview.previewId, hash: preview.hash }), "committed");
}

describe("@cb/host approve keeps files of open sessions", () => {
  it("fix excluded attachment bytes stay while another open session uses them", async () => {
    const h = harness();
    const body = "Shared synthetic notes for two sessions.";
    const sha = h.vault.putFile(Buffer.from(body, "utf8"));
    expect(h.vault.putText(sha, body).ok).toBe(true);
    const files = [join(h.root, "files", sha), join(h.root, "files", `${sha}.txt`)];

    const first = await ingestWithFile(h, sha, body);
    const second = await ingestWithFile(h, sha, body); // still open, not approved

    await approveWithoutFirstTurn(h, first);
    for (const f of files) expect(existsSync(f), f).toBe(true);

    // Once no other open session uses it, an excluding approve deletes it.
    h.host.close();
    const third = await ingestWithFile(h, sha, body);
    await approveWithoutFirstTurn(h, third);
    for (const f of files) expect(existsSync(f), f).toBe(false);
    expect(second).not.toBe(first);
  });
});
