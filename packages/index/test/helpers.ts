import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Transcript } from "@cb/schema";

const FIXTURES = fileURLToPath(new URL("../../schema/test-fixtures/", import.meta.url));

export function loadFixture(name: string): Transcript {
  return Transcript.parse(JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")));
}
