// Step 4: personal data (sanitizer.md §Steps 4). IBANs and cards only when the checksum holds.
import { placeholderFor, type SanitizeContext } from "./context.js";

const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g;
// Compact or in groups of four separated by single spaces.
const IBAN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?(?![A-Za-z0-9])/g;
// Digit runs with optional single space/dot/dash separators (card or phone). The neighbours exclude
// word characters, `-`, `.` and `/` so UUIDs, dates and paths are not read as numbers.
const NUMBER = /(?<![\w+./-])\+?\d(?:[ .-]?\d)+(?![\w/-])/g;

// One scan, leftmost match first: an IBAN-shaped run that fails its checksum is consumed whole, so
// its digits are never re-read as a card or phone number.
const PII = new RegExp(`(${EMAIL.source})|(${IBAN.source})|(${NUMBER.source})`, "g");

const digits = (s: string): string => s.replace(/\D/g, "");

export function isValidIban(candidate: string): boolean {
  const s = candidate.replace(/ /g, "");
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); // A=10 … Z=35
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export function isLuhnValid(number: string): boolean {
  let sum = 0;
  for (let i = 0; i < number.length; i++) {
    let d = Number(number[number.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return number.length > 0 && sum % 10 === 0;
}

function isCard(m: string): boolean {
  if (m.startsWith("+") || m.includes(".")) return false;
  const d = digits(m);
  return d.length >= 13 && d.length <= 19 && isLuhnValid(d);
}

function isPhone(m: string): boolean {
  const n = digits(m).length;
  return m.startsWith("+") ? n >= 8 && n <= 15 : n >= 9 && n <= 15;
}

/** Replace emails, valid IBANs, Luhn-valid card numbers and phone numbers with placeholders. */
export function redactPii(text: string, ctx: SanitizeContext): string {
  return text.replace(PII, (m, email?: string, iban?: string) => {
    if (email) return placeholderFor(ctx, "email", m);
    if (iban) return isValidIban(m) ? placeholderFor(ctx, "iban", m) : m;
    if (isCard(m)) return placeholderFor(ctx, "card", m);
    if (isPhone(m)) return placeholderFor(ctx, "phone", m);
    return m;
  });
}
