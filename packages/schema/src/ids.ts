// ID formats from specs/plan/data-model.md §IDs.

export const TURN_ID: RegExp = /^t\d{3}$/;
export const ATTACHMENT_ID: RegExp = /^a\d{3}$/;
export const ITEM_ID: RegExp = /^i\d{3}$/;
export const PACK_ID: RegExp = /^cp_[0-9a-f]{8}$/;
export const SESSION_ID: RegExp = /^s_[0-9a-f]{8}$/;
export const PREVIEW_ID: RegExp = /^p_[0-9a-f]{8}$/;
/** Turn range used in manifest refs, e.g. `t001-t040`. */
export const TURN_RANGE: RegExp = /^t\d{3}-t\d{3}$/;
/** Lowercase hex SHA-256. */
export const SHA256_HEX: RegExp = /^[0-9a-f]{64}$/;

function positional(prefix: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    throw new RangeError(`${prefix} id position out of range 1–999: ${n}`);
  }
  return prefix + String(n).padStart(3, "0");
}

/** `turnId(7)` → `"t007"`. Position is 1-based. */
export function turnId(n: number): string {
  return positional("t", n);
}

/** `attachmentId(2)` → `"a002"`. Position is 1-based. */
export function attachmentId(n: number): string {
  return positional("a", n);
}

/** `itemId(14)` → `"i014"`. Position is 1-based. */
export function itemId(n: number): string {
  return positional("i", n);
}

/** Source of `n` random bytes for ids. Injectable so tests are deterministic; default: Web Crypto. */
export type IdRng = (n: number) => Uint8Array;

const cryptoRng: IdRng = (n) => crypto.getRandomValues(new Uint8Array(n));

function randomHex8(rng: IdRng): string {
  const bytes = rng(4);
  if (bytes.length !== 4) throw new RangeError(`IdRng returned ${bytes.length} bytes, expected 4`);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newPackId(rng: IdRng = cryptoRng): string {
  return `cp_${randomHex8(rng)}`;
}

export function newSessionId(rng: IdRng = cryptoRng): string {
  return `s_${randomHex8(rng)}`;
}

export function newPreviewId(rng: IdRng = cryptoRng): string {
  return `p_${randomHex8(rng)}`;
}
