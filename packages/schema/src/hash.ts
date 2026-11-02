// Canonical JSON and SHA-256 (Node and WebCrypto variants).
import { createHash } from "node:crypto";

/**
 * JSON with object keys sorted (recursively) and no whitespace. Arrays keep their order.
 * `undefined` object values are dropped, as in JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeys(src[key]);
    return out;
  }
  return value;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lowercase hex SHA-256 using node:crypto. Strings are hashed as UTF-8. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(toBytes(data)).digest("hex");
}

/** Lowercase hex SHA-256 using WebCrypto (for the extension). Same output as `sha256Hex`. */
export async function sha256HexWeb(data: string | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(data));
  return hex(new Uint8Array(digest));
}
