// Session context: stable placeholders per value, numbered per kind (sanitizer.md §Placeholders).
// Values live only in memory; nothing here is serialised.

export type RedactionKind = "secret" | "email" | "phone" | "iban" | "card";
/** `value` lives in memory only; never serialised or written to disk. */
export type Redaction = { placeholder: string; kind: RedactionKind; value: string };
/** One per session. Keyed by the original value. */
export type SanitizeContext = { redactions: Map<string, Redaction> };

const LABEL: Record<RedactionKind, string> = {
  secret: "SECRET",
  email: "EMAIL",
  phone: "PHONE",
  iban: "IBAN",
  card: "CARD",
};

/** Matches any placeholder this package produces, e.g. `[EMAIL_3]`. */
export const PLACEHOLDER = /^\[(?:SECRET|EMAIL|PHONE|IBAN|CARD)_\d+\]/;

export function createContext(): SanitizeContext {
  return { redactions: new Map() };
}

/** The placeholder for `value`: the existing one, or the next number for its kind. */
export function placeholderFor(ctx: SanitizeContext, kind: RedactionKind, value: string): string {
  const known = ctx.redactions.get(value);
  if (known) return known.placeholder;
  let n = 1;
  for (const r of ctx.redactions.values()) if (r.kind === kind) n++;
  const placeholder = `[${LABEL[kind]}_${n}]`;
  ctx.redactions.set(value, { placeholder, kind, value });
  return placeholder;
}

/** Restore the original values of the given placeholders only. Unknown placeholders are ignored. */
export function unredact(text: string, placeholders: string[], ctx: SanitizeContext): string {
  const wanted = new Set(placeholders);
  let out = text;
  for (const r of ctx.redactions.values()) {
    if (wanted.has(r.placeholder)) out = out.split(r.placeholder).join(r.value);
  }
  return out;
}
