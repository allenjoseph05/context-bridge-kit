import { describe, expect, it } from "vitest";
import { tokenize } from "../src/index.js";

describe("tokenize", () => {
  it("T10 identifiers and numbers", () => {
    expect(tokenize("getUserById")).toEqual(["get", "user", "by", "id", "getuserbyid"]);
    expect(tokenize("max_retry_count")).toEqual(["max", "retry", "count", "max_retry_count"]);
    expect(tokenize("Retry 30 times, then wait 3.5 seconds.")).toEqual([
      "retry",
      "30",
      "times",
      "then",
      "wait",
      "3.5",
      "seconds",
    ]);
    expect(tokenize("Call getUserById(30) with MAX_RETRY_COUNT")).toEqual([
      "call",
      "get",
      "user",
      "by",
      "id",
      "getuserbyid",
      "30",
      "with",
      "max",
      "retry",
      "count",
      "max_retry_count",
    ]);
  });
});
