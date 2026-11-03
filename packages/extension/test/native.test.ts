// T08 port wrapper (src/native.ts) against a fake chrome.runtime.Port.
import { MAX_OUTGOING_JSON_BYTES, splitIntoChunks, type HostToExt } from "@cb/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeClient, REQUEST_TIMEOUT_MS, type PortLike } from "../src/native.js";

type Listener<T extends unknown[]> = (...args: T) => void;

class FakePort implements PortLike {
  sent: { type: string; requestId: string; [k: string]: unknown }[] = [];
  disconnected = false;
  private messageListeners: Listener<[unknown]>[] = [];
  private disconnectListeners: Listener<[]>[] = [];
  onMessage = { addListener: (f: Listener<[unknown]>): void => void this.messageListeners.push(f) };
  onDisconnect = { addListener: (f: Listener<[]>): void => void this.disconnectListeners.push(f) };
  postMessage(m: unknown): void {
    this.sent.push(m as FakePort["sent"][number]);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(m: unknown): void {
    for (const f of this.messageListeners) f(m);
  }
  drop(): void {
    for (const f of this.disconnectListeners) f();
  }
  last(): FakePort["sent"][number] {
    const m = this.sent[this.sent.length - 1];
    if (!m) throw new Error("nothing sent");
    return m;
  }
}

const SESSION = "s_0b7e11c3";
const PREVIEW = "p_44aa0912";
const HASH = "a".repeat(64);

function preview(requestId: string, envelope: string): HostToExt {
  return {
    type: "preview",
    requestId,
    sessionId: SESSION,
    previewId: PREVIEW,
    hash: HASH,
    envelope,
    images: [],
    flags: [],
    cutList: [],
    notices: [],
    stats: { capturedTokens: 1, pushedTokens: 1, budget: 6800, cutCount: 0 },
  };
}

function setup(): { port: FakePort; ports: FakePort[]; client: ReturnType<typeof createNativeClient> } {
  const ports: FakePort[] = [];
  const client = createNativeClient({
    connect: () => {
      const p = new FakePort();
      ports.push(p);
      return p;
    },
  });
  return {
    get port(): FakePort {
      const p = ports[ports.length - 1];
      if (!p) throw new Error("no port opened yet");
      return p;
    },
    ports,
    client,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("T08 port wrapper", () => {
  it("T08 port wrapper matches replies to requests by id", async () => {
    const t = setup();
    const a = t.client.request({ type: "list_packs" });
    const b = t.client.request({ type: "list_packs" });
    const [ma, mb] = t.port.sent;
    expect(ma?.requestId).toBeTruthy();
    expect(mb?.requestId).toBeTruthy();
    expect(ma?.requestId).not.toBe(mb?.requestId);
    // Replies arrive out of order; each resolves its own request.
    t.port.emit({ type: "packs", requestId: mb!.requestId, packs: [] });
    t.port.emit({ type: "deleted", requestId: ma!.requestId, packId: "cp_0123abcd" });
    await expect(a).resolves.toEqual({
      ok: true,
      reply: { type: "deleted", requestId: ma!.requestId, packId: "cp_0123abcd" },
    });
    await expect(b).resolves.toEqual({
      ok: true,
      reply: { type: "packs", requestId: mb!.requestId, packs: [] },
    });
    expect(t.ports).toHaveLength(1); // one port for both requests
  });

  it("T08 port wrapper passes progress to the caller and resolves on the final reply", async () => {
    const t = setup();
    const progress: unknown[] = [];
    const r = t.client.request(
      { type: "compile", sessionId: SESSION, selection: ["t001"], profile: "continue", route: "clipboard", mode: "verbatim" },
      { onProgress: (p) => progress.push([p.stage, p.done, p.total]) },
    );
    const id = t.port.last().requestId;
    t.port.emit({ type: "progress", requestId: id, stage: "compile", done: 0, total: 1 });
    t.port.emit({ type: "progress", requestId: id, stage: "compile", done: 1, total: 1 });
    t.port.emit(preview(id, "ENV"));
    const res = await r;
    expect(res.ok && res.reply.type).toBe("preview");
    expect(progress).toEqual([["compile", 0, 1], ["compile", 1, 1]]);
  });

  it("T08 port wrapper reassembles chunks", async () => {
    const t = setup();
    const r = t.client.request({ type: "list_packs" });
    const id = t.port.last().requestId;
    const big = preview(id, "é\"x".repeat(400_000) + "🙂".repeat(50_000));
    const chunks = splitIntoChunks(big, "m-1");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(MAX_OUTGOING_JSON_BYTES);
    }
    // Out of order, interleaved with an unrelated small reply.
    const other = t.client.request({ type: "list_packs" });
    const otherId = t.port.last().requestId;
    const [first, ...rest] = chunks;
    for (const c of rest.reverse()) t.port.emit(c);
    t.port.emit({ type: "packs", requestId: otherId, packs: [] });
    t.port.emit(first);
    await expect(r).resolves.toEqual({ ok: true, reply: big });
    await expect(other).resolves.toMatchObject({ ok: true, reply: { type: "packs" } });
  });

  it("T08 port wrapper rejects on timeout", async () => {
    vi.useFakeTimers();
    const t = setup();
    const r = t.client.request({ type: "list_packs" });
    const id = t.port.last().requestId;
    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
    t.port.emit({ type: "progress", requestId: id, stage: "extract", done: 1, total: 9 }); // resets the timer
    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void r.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: "timeout" } });
    expect(REQUEST_TIMEOUT_MS).toBe(180_000);
    // A reply after the timeout is dropped; the next request still works.
    t.port.emit({ type: "packs", requestId: id, packs: [] });
    const next = t.client.request({ type: "list_packs" });
    t.port.emit({ type: "packs", requestId: t.port.last().requestId, packs: [] });
    await expect(next).resolves.toMatchObject({ ok: true });
  });

  it("T08 port wrapper drops late replies and progress for a cancelled request", async () => {
    const t = setup();
    const ctl = new AbortController();
    const onProgress = vi.fn();
    const r = t.client.request(
      { type: "compile", sessionId: SESSION, selection: ["t001"], profile: "continue", route: "clipboard", mode: "verbatim" },
      { onProgress, signal: ctl.signal },
    );
    const id = t.port.last().requestId;
    ctl.abort();
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: "cancelled" } });
    // Late traffic for the cancelled id goes nowhere, chunked or not.
    t.port.emit({ type: "progress", requestId: id, stage: "compile", done: 1, total: 1 });
    t.port.emit(preview(id, "LATE"));
    for (const c of splitIntoChunks(preview(id, "x".repeat(1_000_000)), "m-late")) t.port.emit(c);
    expect(onProgress).not.toHaveBeenCalled();
    // The wrapper keeps working afterwards.
    const next = t.client.request({ type: "list_packs" });
    const nextId = t.port.last().requestId;
    expect(nextId).not.toBe(id);
    t.port.emit({ type: "packs", requestId: nextId, packs: [] });
    await expect(next).resolves.toEqual({ ok: true, reply: { type: "packs", requestId: nextId, packs: [] } });
  });

  it("T08 port wrapper reports a disconnect and reconnects on the next request", async () => {
    const t = setup();
    const notices: string[] = [];
    t.client.onDisconnect((m) => notices.push(m));
    const r = t.client.request({ type: "list_packs" });
    t.port.drop();
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: "disconnected" } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/Connection to the host was lost/);
    expect(t.ports).toHaveLength(1); // lazy: no reconnect until asked
    const next = t.client.request({ type: "list_packs" });
    expect(t.ports).toHaveLength(2);
    t.port.emit({ type: "packs", requestId: t.port.last().requestId, packs: [] });
    await expect(next).resolves.toMatchObject({ ok: true });
  });

  it("T08 port wrapper answers an invalid reply with a typed failure", async () => {
    const t = setup();
    const r = t.client.request({ type: "list_packs" });
    t.port.emit({ type: "packs", requestId: t.port.last().requestId, packs: "nope" });
    await expect(r).resolves.toMatchObject({ ok: false, error: { code: "invalid_reply" } });
  });
});
