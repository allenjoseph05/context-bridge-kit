import { describe, expect, it } from "vitest";
import { Chunk, ErrorCode, ExtToHost, HostToExt } from "../src/index.js";
import * as ex from "./examples.js";

const ERROR_CODES = [
  "invalid_message",
  "unknown_session",
  "capture_empty",
  "file_refused",
  "model_unavailable",
  "model_invalid_output",
  "over_budget",
  "hash_mismatch",
  "vault_error",
  "internal",
];

describe("@cb/schema protocol", () => {
  it("T01 protocol messages", () => {
    for (const [name, msg] of Object.entries(ex.extToHost)) {
      expect(ExtToHost.safeParse(msg).success, `ExtToHost ${name}`).toBe(true);
    }
    for (const [name, msg] of Object.entries(ex.hostToExt)) {
      expect(HostToExt.safeParse(msg).success, `HostToExt ${name}`).toBe(true);
    }
    expect(Chunk.safeParse(ex.hostToExt.chunk).success).toBe(true);
    for (const code of ERROR_CODES) expect(ErrorCode.safeParse(code).success).toBe(true);
    expect(ErrorCode.options.length).toBe(ERROR_CODES.length);

    // unknown type is rejected in both directions
    expect(ExtToHost.safeParse({ type: "shutdown", requestId: "x" }).success).toBe(false);
    expect(HostToExt.safeParse({ type: "shutdown", requestId: "x" }).success).toBe(false);
    // a host message is not an extension message
    expect(ExtToHost.safeParse(ex.hostToExt.hello_ok).success).toBe(false);
    // invalid shapes
    expect(ExtToHost.safeParse({ ...ex.extToHost.hello, protocol: 2 }).success).toBe(false);
    expect(ExtToHost.safeParse({ ...ex.extToHost.compile, mode: "fast" }).success).toBe(false);
    expect(ExtToHost.safeParse({ ...ex.extToHost.approve, hash: "zz" }).success).toBe(false);
    expect(
      ExtToHost.safeParse({ ...ex.extToHost.revise, edits: { removeItemIds: [] } }).success,
    ).toBe(false);
    expect(HostToExt.safeParse({ ...ex.hostToExt.progress, stage: "thinking" }).success).toBe(
      false,
    );
    expect(HostToExt.safeParse({ ...ex.hostToExt.error, code: "oops" }).success).toBe(false);
    expect(
      HostToExt.safeParse({ ...ex.hostToExt.ingested, suggestedSelection: ["a001"] }).success,
    ).toBe(false);
    expect(
      HostToExt.safeParse({ ...ex.hostToExt.preview, flags: [{ ref: "t001", kind: "weird" }] })
        .success,
    ).toBe(false);
  });
});
