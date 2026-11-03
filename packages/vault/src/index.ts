// @cb/vault — local storage for packs, envelopes, transcripts, indexes, files, extractor cache,
// audit log and config (specs/plan/host.md §Vault layout, §Audit). Node only.
import type { ContextPack, PackMeta, Route, Transcript } from "@cb/schema";

export type VaultErrorCode = "not_found" | "invalid_id" | "invalid";
export type VaultResult<T> = { ok: true; value: T } | { ok: false; error: { code: VaultErrorCode } };

export type AuditEventName =
  "captured" | "previewed" | "approved" | "delivered" | "served" | "deleted" | "expired" | "refused";

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

export type VaultConfig = {
  extensionId?: string;
  model?: string;
  defaults: { expiryDays: number };
};

export type SweepReport = { packs: string[]; files: number; cache: number };

export type VaultOptions = {
  /** Defaults to `CB_VAULT`, then `~/.context-bridge`. */
  root?: string;
  /** Injectable clock for expiry and audit timestamps. */
  now?: () => Date;
};

export type Vault = {
  readonly root: string;
  writePack(pack: ContextPack, envelope: string, transcript: Transcript, index: unknown): VaultResult<void>;
  readPack(id: string): VaultResult<ContextPack>;
  readEnvelope(id: string): VaultResult<string>;
  readTranscript(id: string): VaultResult<Transcript>;
  readIndex(id: string): VaultResult<unknown>;
  listPacks(): PackMeta[];
  deletePack(id: string): VaultResult<void>;
  sweepExpired(): SweepReport;
  putFile(bytes: Uint8Array): string;
  getFile(sha: string): VaultResult<Uint8Array>;
  putText(sha: string, text: string): VaultResult<void>;
  getText(sha: string): VaultResult<string>;
  cacheGet(key: string): VaultResult<unknown>;
  cachePut(key: string, value: unknown): VaultResult<void>;
  audit(event: AuditInput): void;
  readConfig(): VaultConfig;
  writeConfig(config: VaultConfig): void;
};

export function openVault(_options: VaultOptions = {}): Vault {
  throw new Error("not implemented (T06)");
}
