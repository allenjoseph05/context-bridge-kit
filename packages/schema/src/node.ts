// @cb/schema/node — Node-only helpers. Never import this from a package that runs in the browser
// (adapters, sanitizer, extension); use `sha256HexWeb` from the main entry there.
import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 using node:crypto (sync). Strings are hashed as UTF-8. */
export function sha256Hex(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return createHash("sha256").update(bytes).digest("hex");
}
