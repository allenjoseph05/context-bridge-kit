// Sessions and message handlers (protocol.md, host.md §Pipeline per session).
import type { HostToExt, Transcript } from "@cb/schema";
import type { Vault } from "@cb/vault";

export type HostOptions = {
  vault: Vault;
  /** Sends one reply; the transport chunks and frames it. */
  send: (msg: HostToExt) => void;
  hostVersion?: string;
  /** Injectable clock for pack dates. */
  now?: () => Date;
};

export type Host = {
  /** Handle one decoded incoming message (any JSON value). Replies go through `send`. */
  handle(raw: unknown): Promise<void>;
  /** Port closed: drop every session and its redaction values. */
  close(): void;
  /** Number of live sessions. */
  sessionCount(): number;
};

/** `sha256(envelope + "\n" + JSON.stringify(imageIds))`, lowercase hex (AC-15). */
export function previewHash(envelope: string, imageIds: string[]): string {
  void envelope;
  void imageIds;
  throw new Error("not implemented (T07)");
}

/**
 * host.md §Suggested selection: the last 10 turns plus any earlier turn with a code part, a table,
 * an attachment, or a number with a unit. Turn ids in transcript order.
 */
export function suggestSelection(transcript: Transcript): string[] {
  void transcript;
  throw new Error("not implemented (T07)");
}

export function createHost(options: HostOptions): Host {
  void options;
  throw new Error("not implemented (T07)");
}
