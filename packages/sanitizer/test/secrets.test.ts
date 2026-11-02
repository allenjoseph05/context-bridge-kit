// T03 rows 4–6: secrets (sanitizer.md §Steps 3). Every value here is fake.
import { describe, expect, it } from "vitest";
import { createContext, sanitizeText } from "../src/index.js";

const PRIVATE_KEY = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu",
  "KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==",
  "-----END RSA PRIVATE KEY-----",
].join("\n");

const KNOWN: Record<string, string> = {
  aws: "AKIAZZZZEXAMPLE12345",
  github: "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
  githubPat:
    "github_pat_11FAKE0000000000000000_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  openai: "sk-proj-FAKEFAKEFAKEFAKEFAKE1234",
  anthropic: "sk-ant-api03-FAKEfakeFAKEfakeFAKEfake",
  google: "AIzaSyFAKE0123456789abcdefghijklmnopqrs",
  slack: "xoxb-0000000000-FAKEFAKEFAKE",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJlLWZha2U",
  privateKey: PRIVATE_KEY,
  privateKeyNoType:
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----",
};

describe("secrets", () => {
  it("AC-05 known secret formats", () => {
    for (const [name, secret] of Object.entries(KNOWN)) {
      // In text.
      const ctx = createContext();
      const out = sanitizeText(`Here: ${secret} (end)`, ctx).text;
      expect(out, name).toBe("Here: [SECRET_1] (end)");
      expect([...ctx.redactions.values()], name).toEqual([
        { placeholder: "[SECRET_1]", kind: "secret", value: secret },
      ]);
      // Inside code parts too.
      const code = sanitizeText(`const k = "${secret}";\nrun(k);`, createContext(), {
        isCode: true,
      }).text;
      expect(code, name).toBe('const k = "[SECRET_1]";\nrun(k);');
    }
  });

  it("AC-05 entropy rule and false positives", () => {
    // 40 chars of random base64: entropy ≈ 5.3 bits/char, several classes → redacted.
    const random = "Xq7Lp2Vz9Rk4Tm8Wn3Bc6Hd1Fg5Js0Ya+Ue/OiQw";
    const ctx = createContext();
    expect(sanitizeText(`Blob: ${random} end`, ctx).text).toBe("Blob: [SECRET_1] end");
    expect(sanitizeText(`x = "${random}"`, createContext(), { isCode: true }).text).toBe(
      'x = "[SECRET_1]"',
    );

    const notSecrets = [
      "3f786850e387550fdab836ed7e6dc881de23001b", // 40-char git SHA
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", // SHA-256 hex
      "123e4567-e89b-12d3-a456-426614174000", // UUID
      "getUserAccountSettingsFromRemoteServiceProvider", // long camelCase identifier
      "createCompiledContextPackFromSanitisedTranscriptTurns", // 53 chars, ≈ 4.16 bits/char, no digit
    ];
    for (const s of notSecrets) {
      const c = createContext();
      const text = `Fixed in ${s} today.`;
      expect(sanitizeText(text, c).text, s).toBe(text);
      expect(sanitizeText(`call(${s});`, c, { isCode: true }).text, s).toBe(`call(${s});`);
      expect(c.redactions.size, s).toBe(0);
    }
  });

  it("AC-05 assignment values", () => {
    const ctx = createContext();
    expect(sanitizeText("password = hunter2hunter", ctx).text).toBe("password = [SECRET_1]");
    expect([...ctx.redactions.values()]).toEqual([
      { placeholder: "[SECRET_1]", kind: "secret", value: "hunter2hunter" },
    ]);

    // Other keywords and separators; key names stay, only values go.
    expect(sanitizeText("PASSWD: s3cretValue", createContext()).text).toBe("PASSWD: [SECRET_1]");
    expect(sanitizeText("api_key=abcdef123456", createContext()).text).toBe("api_key=[SECRET_1]");
    expect(sanitizeText("my token: zz9-plural-z", createContext()).text).toBe(
      "my token: [SECRET_1]",
    );
    // In code, quotes and trailing punctuation around the value stay so the code still parses.
    expect(
      sanitizeText('const cfg = { apiKey: "hunter2hunter", secret: \'swordfish1\' };', createContext(), {
        isCode: true,
      }).text,
    ).toBe('const cfg = { apiKey: "[SECRET_1]", secret: \'[SECRET_2]\' };');
    // Values shorter than 6 characters are not matched.
    expect(sanitizeText("password = abc", createContext()).text).toBe("password = abc");
  });
});
