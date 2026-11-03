// Create the extension's RSA key pair and fix its ID (plan/extension.md §Manifest, "Why key").
//   pnpm gen:key [--force]
// Writes packages/extension/key.pem (private, git-ignored; reused unless --force), puts the
// base64 DER public key into packages/extension/manifest.json "key", and prints the extension ID
// (the value for scripts/install-host.* and the native host manifest's allowed_origins).
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "extension");
const KEY_FILE = join(EXT, "key.pem");
const MANIFEST = join(EXT, "manifest.json");

/** Chrome's extension ID: first 32 hex digits of sha256(DER public key), 0–f mapped to a–p. */
export function extensionId(publicKeyDer: Buffer): string {
  const hex = createHash("sha256").update(publicKeyDer).digest("hex").slice(0, 32);
  return [...hex].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");
}

function main(): void {
  const force = process.argv.includes("--force");
  let pem: string;
  if (existsSync(KEY_FILE) && !force) {
    pem = readFileSync(KEY_FILE, "utf8");
    console.error(`reusing ${KEY_FILE}`);
  } else {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    writeFileSync(KEY_FILE, pem, { mode: 0o600 });
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      // Windows: file modes are not applicable.
    }
    console.error(`wrote ${KEY_FILE} (private; git-ignored)`);
  }
  const der = createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "der" });
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, unknown>;
  manifest.key = der.toString("base64");
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`updated "key" in ${MANIFEST}`);
  console.log(extensionId(der));
}

main();
