import { describe, expect, it } from "vitest";
import { canonicalJson, sha256HexWeb } from "../src/index.js";
import { sha256Hex } from "../src/node.js";

describe("@cb/schema hash", () => {
  it("T01 canonical hashing", async () => {
    const a = { b: 1, a: [{ y: 2, x: 1 }, "s"], c: { z: null, d: "é" } };
    const b = { c: { d: "é", z: null }, a: [{ x: 1, y: 2 }, "s"], b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":[{"x":1,"y":2},"s"],"b":1,"c":{"d":"é","z":null}}');
    // array order matters
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));

    // known vector
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    for (const input of ["", "abc", canonicalJson(a), "ünïcödé ✓"]) {
      expect(await sha256HexWeb(input)).toBe(sha256Hex(input));
    }
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(await sha256HexWeb(bytes)).toBe(sha256Hex(bytes));
    expect(sha256Hex(canonicalJson(a))).toBe(sha256Hex(canonicalJson(b)));
  });
});
