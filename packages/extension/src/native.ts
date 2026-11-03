// Port wrapper for the native host (plan/extension.md §Files, protocol.md §Framing, §Session model).
// Used by the side panel, which opens the port itself with chrome.runtime.connectNative.
import {
  HostToExt,
  reassemble,
  type Chunk,
  type ExtToHost,
} from "@cb/schema";

export const HOST_NAME = "com.contextbridge.host";
/** A request fails this long after the last message for it (each `progress` resets the timer). */
export const REQUEST_TIMEOUT_MS = 180_000;
export const DISCONNECT_MESSAGE = "Connection to the host was lost; sessions were reset.";

/** The parts of chrome.runtime.Port the wrapper uses. */
export interface PortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A request without its `requestId`; the wrapper assigns one. */
export type RequestBody = DistributiveOmit<ExtToHost, "requestId">;
export type Progress = Extract<HostToExt, { type: "progress" }>;
/** A final reply: anything the host sends except progress and chunks (`error` included). */
export type HostReply = Exclude<HostToExt, { type: "progress" } | { type: "chunk" }>;

export interface RequestFailure {
  code: "timeout" | "disconnected" | "cancelled" | "invalid_reply";
  message: string;
}
export type RequestResult = { ok: true; reply: HostReply } | { ok: false; error: RequestFailure };

export interface RequestOptions {
  onProgress?: (progress: Progress) => void;
  /** Aborting cancels the request: it resolves `cancelled` and later traffic for it is dropped. */
  signal?: AbortSignal;
}

export interface HostClient {
  request(body: RequestBody, options?: RequestOptions): Promise<RequestResult>;
  /** Called with a user-facing message whenever the port drops. Returns an unsubscribe function. */
  onDisconnect(listener: (message: string) => void): () => void;
}

export interface NativeClientOptions {
  connect: () => PortLike;
  /** Chrome's error for the last disconnect (`chrome.runtime.lastError?.message`). */
  lastError?: () => string | undefined;
  timeoutMs?: number;
  newRequestId?: () => string;
}

interface Pending {
  options: RequestOptions | undefined;
  settle: (result: RequestResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** A host client over one lazily opened port; a dropped port is reopened by the next request. */
export function createNativeClient(opts: NativeClientOptions): HostClient {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const newId = opts.newRequestId ?? ((): string => crypto.randomUUID());
  const pending = new Map<string, Pending>();
  const chunks = new Map<string, Chunk[]>();
  const listeners = new Set<(message: string) => void>();
  let port: PortLike | undefined;

  const finish = (requestId: string, result: RequestResult): void => {
    const p = pending.get(requestId);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(requestId);
    p.settle(result);
  };

  const armTimer = (requestId: string): ReturnType<typeof setTimeout> =>
    setTimeout(
      () => finish(requestId, { ok: false, error: { code: "timeout", message: "The host did not answer in time." } }),
      timeoutMs,
    );

  const deliver = (raw: unknown): void => {
    const requestId =
      typeof raw === "object" && raw !== null && "requestId" in raw && typeof raw.requestId === "string"
        ? raw.requestId
        : undefined;
    const parsed = HostToExt.safeParse(raw);
    if (!parsed.success) {
      console.error("context-bridge: invalid message from host", parsed.error.issues);
      if (requestId !== undefined) {
        finish(requestId, { ok: false, error: { code: "invalid_reply", message: "The host sent an invalid reply." } });
      }
      return;
    }
    const msg = parsed.data;
    if (msg.type === "chunk") {
      const list = chunks.get(msg.messageId) ?? [];
      list.push(msg);
      if (list.length < msg.count) {
        chunks.set(msg.messageId, list);
        const p = msg.requestId !== undefined ? pending.get(msg.requestId) : undefined;
        if (p && msg.requestId !== undefined) {
          clearTimeout(p.timer);
          p.timer = armTimer(msg.requestId);
        }
        return;
      }
      chunks.delete(msg.messageId);
      const joined = reassemble(list);
      if (!joined.ok) {
        console.error("context-bridge: chunk reassembly failed", joined.error.code);
        if (msg.requestId !== undefined) {
          finish(msg.requestId, { ok: false, error: { code: "invalid_reply", message: "The host sent a broken reply." } });
        }
        return;
      }
      deliver(joined.message);
      return;
    }
    const p = pending.get(msg.requestId);
    if (!p) return; // unknown, timed out or cancelled: dropped
    if (msg.type === "progress") {
      clearTimeout(p.timer);
      p.timer = armTimer(msg.requestId);
      p.options?.onProgress?.(msg);
      return;
    }
    finish(msg.requestId, { ok: true, reply: msg });
  };

  const open = (): PortLike => {
    if (port) return port;
    const p = opts.connect();
    port = p;
    p.onMessage.addListener((m) => {
      if (port === p) deliver(m);
    });
    p.onDisconnect.addListener(() => {
      if (port !== p) return;
      port = undefined;
      chunks.clear();
      const detail = opts.lastError?.();
      const message = detail ? `${DISCONNECT_MESSAGE} (${detail})` : DISCONNECT_MESSAGE;
      for (const id of [...pending.keys()]) finish(id, { ok: false, error: { code: "disconnected", message } });
      for (const l of listeners) l(message);
    });
    return p;
  };

  return {
    request(body: RequestBody, options?: RequestOptions): Promise<RequestResult> {
      const requestId = newId();
      return new Promise<RequestResult>((resolve) => {
        if (options?.signal?.aborted) {
          resolve({ ok: false, error: { code: "cancelled", message: "Cancelled." } });
          return;
        }
        pending.set(requestId, { options, settle: resolve, timer: armTimer(requestId) });
        options?.signal?.addEventListener(
          "abort",
          () => finish(requestId, { ok: false, error: { code: "cancelled", message: "Cancelled." } }),
          { once: true },
        );
        try {
          open().postMessage({ ...body, requestId });
        } catch (e) {
          port = undefined;
          const detail = e instanceof Error ? ` (${e.message})` : "";
          finish(requestId, { ok: false, error: { code: "disconnected", message: DISCONNECT_MESSAGE + detail } });
        }
      });
    },
    onDisconnect(listener: (message: string) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The real client: `chrome.runtime.connectNative` to the Context Bridge host. */
export function chromeNativeClient(): HostClient {
  return createNativeClient({
    connect: () => chrome.runtime.connectNative(HOST_NAME),
    lastError: () => chrome.runtime.lastError?.message,
  });
}
