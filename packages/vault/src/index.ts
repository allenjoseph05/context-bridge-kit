// @cb/vault — local storage for packs, envelopes, transcripts, indexes, files, extractor cache,
// audit log and config (specs/plan/host.md §Vault layout, §Audit). Node only.
//
// Every id, sha and cache key is checked by regex before it reaches a path. Folders are 0700 and
// files 0600; on Windows the mode bits are not enforced by the OS (tests skip that assertion).
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ContextPack, PACK_ID, PackMeta, Route, SESSION_ID, SHA256_HEX, Transcript } from "@cb/schema";
import { sha256Hex } from "@cb/schema/node";
import { z } from "zod";

/** `exists`: `writePack` refused because the pack id is taken (packs are never overwritten). */
export type VaultErrorCode = "not_found" | "invalid_id" | "invalid" | "exists";
export type VaultResult<T> = { ok: true; value: T } | { ok: false; error: { code: VaultErrorCode } };

export const AuditEventName = z.enum([
  "captured",
  "previewed",
  "approved",
  "delivered",
  "served",
  "deleted",
  "expired",
  "refused",
]);
export type AuditEventName = z.infer<typeof AuditEventName>;

/** Everything an audit line may hold besides `ts`. No text, no user file names, no redaction values. */
export type AuditInput = {
  event: AuditEventName;
  sessionId?: string;
  packId?: string;
  counts?: Record<string, number>;
  sha256?: string;
  tool?: string;
  route?: Route;
};
export type AuditEvent = AuditInput & { ts: string };

const AuditInputSchema = z
  .object({
    event: AuditEventName,
    sessionId: z.string().regex(SESSION_ID).optional(),
    packId: z.string().regex(PACK_ID).optional(),
    counts: z.record(z.string().regex(/^[A-Za-z]{1,32}$/), z.number().int().nonnegative()).optional(),
    sha256: z.string().regex(SHA256_HEX).optional(),
    tool: z.string().regex(/^[a-z_]{1,64}$/).optional(),
    route: Route.optional(),
  })
  .strict();

export type VaultConfig = {
  extensionId?: string;
  model?: string;
  defaults: { expiryDays: number };
};

const VaultConfigSchema = z.object({
  extensionId: z.string().optional(),
  model: z.string().optional(),
  defaults: z.object({ expiryDays: z.number().positive() }),
});

const DEFAULT_CONFIG: VaultConfig = { defaults: { expiryDays: 7 } };

export type SweepReport = { packs: string[]; files: number; cache: number };

export type VaultOptions = {
  /** Defaults to `CB_VAULT`, then `~/.context-bridge`. */
  root?: string;
  /** Injectable clock for expiry, file ages and audit timestamps. */
  now?: () => Date;
};

/** Not part of the documented API: tests only. Host and MCP server never pass it. */
type TestHooks = { beforeRename?: (target: string) => void };

export type Vault = {
  readonly root: string;
  /** Refuses with `exists` when `hasPack(pack.id)`; never overwrites. */
  writePack(pack: ContextPack, envelope: string, transcript: Transcript, index: unknown): VaultResult<void>;
  /** True when any of the pack's files exist (expired or partly written packs count); false for invalid ids. */
  hasPack(id: string): boolean;
  readPack(id: string): VaultResult<ContextPack>;
  readEnvelope(id: string): VaultResult<string>;
  readTranscript(id: string): VaultResult<Transcript>;
  readIndex(id: string): VaultResult<unknown>;
  /** Unexpired packs, newest first. */
  listPacks(): PackMeta[];
  deletePack(id: string): VaultResult<void>;
  /**
   * Delete `files/<sha>` and `files/<sha>.txt` unless a stored pack references the sha. Returns
   * the number of entries removed (0 when still referenced or absent).
   */
  releaseFile(sha: string): VaultResult<number>;
  sweepExpired(): SweepReport;
  putFile(bytes: Uint8Array): string;
  getFile(sha: string): VaultResult<Uint8Array>;
  putText(sha: string, text: string): VaultResult<void>;
  getText(sha: string): VaultResult<string>;
  cacheGet(key: string): VaultResult<unknown>;
  cachePut(key: string, value: unknown): VaultResult<void>;
  /** Throws on fields or values outside the allowed set (a programming error). */
  audit(event: AuditInput): void;
  readConfig(): VaultConfig;
  writeConfig(config: VaultConfig): void;
};

const CACHE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const PACK_FILE = /^(cp_[0-9a-f]{8})\.json$/;
const FILE_ENTRY = /^([0-9a-f]{64})(\.txt)?$/;
const ORPHAN_GRACE_MS = 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

const ok = <T>(value: T): VaultResult<T> => ({ ok: true, value });
const fail = <T>(code: VaultErrorCode): VaultResult<T> => ({ ok: false, error: { code } });

function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "ENOENT";
}

export function openVault(options: VaultOptions = {}): Vault {
  const root = options.root ?? process.env.CB_VAULT ?? join(homedir(), ".context-bridge");
  const now = options.now ?? ((): Date => new Date());
  const hooks: TestHooks = (options as { _testHooks?: TestHooks })._testHooks ?? {};

  const dirs = {
    packs: join(root, "packs"),
    transcripts: join(root, "transcripts"),
    index: join(root, "index"),
    files: join(root, "files"),
    cache: join(root, "cache"),
    extract: join(root, "cache", "extract"),
  };
  for (const d of [root, ...Object.values(dirs)]) {
    mkdirSync(d, { recursive: true, mode: DIR_MODE });
    chmodSync(d, DIR_MODE); // mkdir mode is masked by umask and ignored for existing dirs
  }
  const auditPath = join(root, "audit.jsonl");
  const configPath = join(root, "config.json");

  const paths = {
    pack: (id: string): string => join(dirs.packs, `${id}.json`),
    envelope: (id: string): string => join(dirs.packs, `${id}.envelope.txt`),
    transcript: (id: string): string => join(dirs.transcripts, `${id}.json`),
    index: (id: string): string => join(dirs.index, `${id}.json`),
    file: (sha: string): string => join(dirs.files, sha),
    text: (sha: string): string => join(dirs.files, `${sha}.txt`),
    cache: (key: string): string => join(dirs.extract, `${key}.json`),
  };

  /** Write to a temp file in the same folder, fsync, then rename over the target. */
  function atomicWrite(target: string, data: string | Uint8Array): void {
    const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      const fd = openSync(tmp, "wx", FILE_MODE);
      try {
        writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      chmodSync(tmp, FILE_MODE);
      hooks.beforeRename?.(target);
      renameSync(tmp, target);
    } catch (e) {
      rmSync(tmp, { force: true });
      throw e;
    }
  }

  const writeJson = (target: string, value: unknown): void => atomicWrite(target, JSON.stringify(value));

  function readRaw(path: string): VaultResult<Buffer> {
    try {
      return ok(readFileSync(path));
    } catch (e) {
      if (isNotFound(e)) return fail("not_found");
      throw e;
    }
  }

  function readParsed<T>(path: string, parse: (v: unknown) => z.SafeParseReturnType<unknown, T>): VaultResult<T> {
    const raw = readRaw(path);
    if (!raw.ok) return raw;
    let json: unknown;
    try {
      json = JSON.parse(raw.value.toString("utf8"));
    } catch {
      return fail("invalid");
    }
    const r = parse(json);
    return r.success ? ok(r.data) : fail("invalid");
  }

  function remove(path: string): boolean {
    try {
      unlinkSync(path);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  function audit(event: AuditInput): void {
    const parsed = AuditInputSchema.parse(event); // throws: unknown fields are a bug
    const line: AuditEvent = { ts: now().toISOString(), ...parsed };
    const existed = existsSync(auditPath);
    appendFileSync(auditPath, `${JSON.stringify(line)}\n`, { mode: FILE_MODE });
    if (!existed) chmodSync(auditPath, FILE_MODE);
  }

  /** Stored packs (expired or not), skipping unreadable ones. */
  function storedPacks(): ContextPack[] {
    const out: ContextPack[] = [];
    for (const name of readdirSync(dirs.packs)) {
      const m = PACK_FILE.exec(name);
      if (!m) continue;
      const r = readParsed(paths.pack(m[1]!), (v) => ContextPack.safeParse(v));
      if (r.ok) out.push(r.value);
    }
    return out;
  }

  /** Attachment shas in the stored transcript of a pack. */
  function fileRefs(id: string): Set<string> {
    const t = readParsed(paths.transcript(id), (v) => Transcript.safeParse(v));
    const shas = new Set<string>();
    if (t.ok) for (const a of t.value.attachments) if (a.sha256) shas.add(a.sha256);
    return shas;
  }

  const isExpired = (p: ContextPack): boolean => Date.parse(p.expiresAt) <= now().getTime();

  /**
   * Remove a pack's four files, then the files it referenced that no remaining pack references.
   * Returns the number of entries removed from `files/`.
   */
  function hasPack(id: string): boolean {
    if (!PACK_ID.test(id)) return false;
    return [paths.pack(id), paths.envelope(id), paths.transcript(id), paths.index(id)].some((p) => existsSync(p));
  }

  function removePack(id: string): number {
    const refs = fileRefs(id);
    for (const p of [paths.pack(id), paths.envelope(id), paths.transcript(id), paths.index(id)]) remove(p);
    const stillUsed = new Set<string>();
    for (const other of storedPacks()) for (const sha of fileRefs(other.id)) stillUsed.add(sha);
    let removed = 0;
    for (const sha of refs) {
      if (stillUsed.has(sha)) continue;
      if (remove(paths.file(sha))) removed++;
      if (remove(paths.text(sha))) removed++;
    }
    return removed;
  }

  function readConfig(): VaultConfig {
    const r = readParsed(configPath, (v) => VaultConfigSchema.safeParse(v));
    return r.ok ? r.value : structuredClone(DEFAULT_CONFIG);
  }

  const mtimeAge = (path: string): number => now().getTime() - statSync(path).mtimeMs;
  const stamp = (path: string): void => {
    const t = now();
    utimesSync(path, t, t);
  };

  return {
    root,

    hasPack,

    writePack(pack, envelope, transcript, index) {
      if (!PACK_ID.test(pack.id)) return fail("invalid_id");
      const p = ContextPack.safeParse(pack);
      const t = Transcript.safeParse(transcript);
      if (!p.success || !t.success) return fail("invalid");
      if (hasPack(pack.id)) return fail("exists");
      // The pack file goes last: listPacks only sees packs whose other files are in place.
      writeJson(paths.transcript(pack.id), t.data);
      writeJson(paths.index(pack.id), index);
      atomicWrite(paths.envelope(pack.id), envelope);
      writeJson(paths.pack(pack.id), p.data);
      return ok(undefined);
    },

    readPack(id) {
      if (!PACK_ID.test(id)) return fail("invalid_id");
      return readParsed(paths.pack(id), (v) => ContextPack.safeParse(v));
    },

    readEnvelope(id) {
      if (!PACK_ID.test(id)) return fail("invalid_id");
      const r = readRaw(paths.envelope(id));
      return r.ok ? ok(r.value.toString("utf8")) : r;
    },

    readTranscript(id) {
      if (!PACK_ID.test(id)) return fail("invalid_id");
      return readParsed(paths.transcript(id), (v) => Transcript.safeParse(v));
    },

    readIndex(id) {
      if (!PACK_ID.test(id)) return fail("invalid_id");
      return readParsed(paths.index(id), (v) => z.unknown().safeParse(v));
    },

    listPacks() {
      return storedPacks()
        .filter((p) => !isExpired(p))
        .map((p) => PackMeta.parse(p))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    deletePack(id) {
      if (!PACK_ID.test(id)) return fail("invalid_id");
      if (!existsSync(paths.pack(id))) return fail("not_found");
      const files = removePack(id);
      audit({ event: "deleted", packId: id, counts: { files } });
      return ok(undefined);
    },

    releaseFile(sha) {
      if (!SHA256_HEX.test(sha)) return fail("invalid_id");
      for (const p of storedPacks()) if (fileRefs(p.id).has(sha)) return ok(0);
      let removed = 0;
      for (const path of [paths.file(sha), paths.text(sha)]) {
        if (remove(path)) {
          removed++;
          audit({ event: "deleted", sha256: sha });
        }
      }
      return ok(removed);
    },

    sweepExpired() {
      const report: SweepReport = { packs: [], files: 0, cache: 0 };
      for (const p of storedPacks().filter(isExpired)) {
        const files = removePack(p.id);
        audit({ event: "expired", packId: p.id, counts: { files } });
        report.packs.push(p.id);
        report.files += files;
      }

      // Orphans: files no pack references, older than the grace period.
      const referenced = new Set<string>();
      for (const p of storedPacks()) for (const sha of fileRefs(p.id)) referenced.add(sha);
      for (const name of readdirSync(dirs.files)) {
        const m = FILE_ENTRY.exec(name);
        if (!m || referenced.has(m[1]!)) continue;
        const path = join(dirs.files, name);
        if (mtimeAge(path) > ORPHAN_GRACE_MS && remove(path)) {
          audit({ event: "expired", sha256: m[1]! });
          report.files++;
        }
      }

      // Extractor cache entries older than the pack expiry.
      const maxAge = readConfig().defaults.expiryDays * DAY_MS;
      for (const name of readdirSync(dirs.extract)) {
        if (!name.endsWith(".json") || !CACHE_KEY.test(name.slice(0, -5))) continue;
        const path = join(dirs.extract, name);
        if (mtimeAge(path) > maxAge && remove(path)) {
          audit({ event: "expired", counts: { cache: 1 } });
          report.cache++;
        }
      }
      return report;
    },

    putFile(bytes) {
      const sha = sha256Hex(bytes);
      const path = paths.file(sha);
      if (!existsSync(path)) atomicWrite(path, bytes);
      stamp(path); // re-putting refreshes the orphan grace period
      return sha;
    },

    getFile(sha) {
      if (!SHA256_HEX.test(sha)) return fail("invalid_id");
      const r = readRaw(paths.file(sha));
      return r.ok ? ok(new Uint8Array(r.value)) : r;
    },

    putText(sha, text) {
      if (!SHA256_HEX.test(sha)) return fail("invalid_id");
      atomicWrite(paths.text(sha), text);
      stamp(paths.text(sha));
      return ok(undefined);
    },

    getText(sha) {
      if (!SHA256_HEX.test(sha)) return fail("invalid_id");
      const r = readRaw(paths.text(sha));
      return r.ok ? ok(r.value.toString("utf8")) : r;
    },

    cacheGet(key) {
      if (!CACHE_KEY.test(key)) return fail("invalid_id");
      return readParsed(paths.cache(key), (v) => z.unknown().safeParse(v));
    },

    cachePut(key, value) {
      if (!CACHE_KEY.test(key)) return fail("invalid_id");
      writeJson(paths.cache(key), value);
      stamp(paths.cache(key));
      return ok(undefined);
    },

    audit,

    readConfig,

    writeConfig(config) {
      writeJson(configPath, VaultConfigSchema.parse(config));
    },
  };
}
