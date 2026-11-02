import { describe, expect, it } from "vitest";
import { itemDraftsJsonSchema } from "../src/index.js";

type JsonObj = Record<string, unknown>;

describe("@cb/schema items", () => {
  it("T01 json schema for model output", () => {
    const schema = itemDraftsJsonSchema() as JsonObj;
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("items");
    const props = schema.properties as JsonObj;
    const items = props.items as JsonObj;
    expect(items.type).toBe("array");
    const draft = items.items as JsonObj;
    expect(draft.type).toBe("object");
    expect(draft.required).toEqual(
      expect.arrayContaining([
        "kind",
        "text",
        "sourceTurns",
        "evidence",
        "attachmentRefs",
        "origin",
      ]),
    );
    const draftProps = draft.properties as JsonObj;
    expect((draftProps.kind as JsonObj).enum).toEqual(
      expect.arrayContaining(["goal", "decision", "constraint", "fact"]),
    );
    // plain JSON (serialisable for the model request)
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});
