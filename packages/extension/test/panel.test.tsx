// @vitest-environment jsdom
// Side panel screens (specs/plan/extension.md §Side panel screens) against a fake host client.
import type { ExtToHost, HostToExt, Turn } from "@cb/schema";
import { countTokens, effectiveBudget } from "@cb/tokens";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { HostClient, RequestBody, RequestOptions, RequestResult } from "../src/native.js";
import { Panel } from "../src/panel/Panel.js";

const SESSION = "s_0b7e11c3";
const HASH = "b".repeat(64);

type Progress = Extract<HostToExt, { type: "progress" }>;

interface Pending {
  body: RequestBody;
  opts: RequestOptions | undefined;
  resolve: (r: RequestResult) => void;
}

/** A host client whose replies the test sends by hand. */
class FakeClient implements HostClient {
  pending: Pending[] = [];
  private listeners: ((m: string) => void)[] = [];
  request(body: RequestBody, opts?: RequestOptions): Promise<RequestResult> {
    if (body.type === "hello") {
      return Promise.resolve({
        ok: true,
        reply: { type: "hello_ok", requestId: "r", protocol: 1, hostVersion: "0.0.0", model: { available: false } },
      });
    }
    return new Promise((resolve) => {
      this.pending.push({ body, opts, resolve });
      opts?.signal?.addEventListener("abort", () =>
        resolve({ ok: false, error: { code: "cancelled", message: "cancelled" } }),
      );
    });
  }
  onDisconnect(listener: (m: string) => void): () => void {
    this.listeners.push(listener);
    return () => (this.listeners = this.listeners.filter((l) => l !== listener));
  }
  dropConnection(message: string): void {
    for (const p of this.pending.splice(0)) p.resolve({ ok: false, error: { code: "disconnected", message } });
    for (const l of this.listeners) l(message);
  }
  /** The oldest unanswered request of `type`. */
  take<T extends ExtToHost["type"]>(type: T): Pending & { body: Extract<RequestBody, { type: T }> } {
    const i = this.pending.findIndex((p) => p.body.type === type);
    if (i < 0) throw new Error(`no pending ${type}; have ${this.pending.map((p) => p.body.type).join(",")}`);
    const [p] = this.pending.splice(i, 1);
    return p as Pending & { body: Extract<RequestBody, { type: T }> };
  }
  has(type: ExtToHost["type"]): boolean {
    return this.pending.some((p) => p.body.type === type);
  }
}

function turn(id: string, role: Turn["role"], text: string): Turn {
  return { id, role, parts: [{ kind: "text", text }], sha256: HASH };
}

function ingested(turns: Turn[], extra: Partial<Extract<HostToExt, { type: "ingested" }>> = {}): RequestResult {
  return {
    ok: true,
    reply: {
      type: "ingested",
      requestId: "r",
      sessionId: SESSION,
      turns,
      attachments: [],
      flags: [],
      redactions: [],
      missingFiles: [],
      suggestedProfile: "continue",
      suggestedSelection: turns.map((t) => t.id),
      ...extra,
    },
  };
}

function previewReply(envelope: string): RequestResult {
  return {
    ok: true,
    reply: {
      type: "preview",
      requestId: "r",
      sessionId: SESSION,
      previewId: "p_44aa0912",
      hash: HASH,
      envelope,
      images: [],
      flags: [],
      cutList: [],
      notices: [],
      stats: { capturedTokens: 10, pushedTokens: 10, budget: 6800, cutCount: 0 },
    },
  };
}

function errorReply(
  code: Extract<HostToExt, { type: "error" }>["code"],
  message: string,
  fallback?: "paste" | "verbatim" | "clipboard",
): RequestResult {
  return {
    ok: true,
    reply: { type: "error", requestId: "r", code, message, recoverable: true, ...(fallback ? { fallback } : {}) },
  };
}

const PASTED = "User: Help me plan a small task tracker.\nAssistant: Start with a list of tasks.";
const TURNS = [turn("t001", "user", "Help me plan a small task tracker."), turn("t002", "assistant", "Start with a list of tasks.")];

/** Render the panel, paste text and answer the ingest with `reply`. */
async function toSelect(client: FakeClient, reply: RequestResult = ingested(TURNS)): Promise<void> {
  render(<Panel client={client} />);
  fireEvent.input(screen.getByLabelText("Pasted chat"), { target: { value: PASTED } });
  fireEvent.click(screen.getByRole("button", { name: "Use pasted text" }));
  await waitFor(() => expect(client.has("ingest")).toBe(true));
  client.take("ingest").resolve(reply);
  await screen.findByRole("heading", { name: "Select" });
}

afterEach(() => {
  cleanup();
});

describe("T08 state machine", () => {
  it("T08 state machine: Capture shows the paste box and a disabled capture button", () => {
    render(<Panel client={new FakeClient()} />);
    expect(screen.getByRole("heading", { name: "Capture" })).toBeTruthy();
    const capture = screen.getByRole("button", { name: "Capture this chat" }) as HTMLButtonElement;
    expect(capture.disabled).toBe(true);
    expect(capture.title).toBe("adapters arrive in T12");
    expect(screen.getByLabelText("Pasted chat")).toBeTruthy();
  });

  it("T08 state machine: Capture → Select on ingested (pasted text is parsed in the panel)", async () => {
    const client = new FakeClient();
    render(<Panel client={client} />);
    fireEvent.input(screen.getByLabelText("Pasted chat"), { target: { value: PASTED } });
    fireEvent.click(screen.getByRole("button", { name: "Use pasted text" }));
    await waitFor(() => expect(client.has("ingest")).toBe(true));
    const { body, resolve } = client.take("ingest");
    expect(body.transcript.turns.map((t) => [t.id, t.role])).toEqual([["t001", "user"], ["t002", "assistant"]]);
    expect(body.transcript.source.adapter).toMatch(/^paste@/);
    resolve(ingested(TURNS));
    await screen.findByRole("heading", { name: "Select" });
    expect(screen.queryByRole("heading", { name: "Capture" })).toBeNull();
  });

  it("T08 state machine: Select → Working on Prepare, which sends compile with the choices", async () => {
    const client = new FakeClient();
    await toSelect(client, ingested(TURNS, { suggestedProfile: "rescue", suggestedSelection: ["t002"] }));
    expect((screen.getByLabelText("Profile") as HTMLSelectElement).value).toBe("rescue");
    expect((screen.getByLabelText("Route") as HTMLSelectElement).value).toBe("clipboard");
    expect((screen.getByLabelText("Mode") as HTMLSelectElement).value).toBe("verbatim");
    expect((screen.getByLabelText("Include t001") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Include t002") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Blind")).toBeNull();

    fireEvent.change(screen.getByLabelText("Profile"), { target: { value: "second_opinion" } });
    fireEvent.click(screen.getByLabelText("Blind"));
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "bundle" } });
    fireEvent.click(screen.getByLabelText("Include t001"));
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));

    await screen.findByRole("heading", { name: "Working" });
    const { body } = client.take("compile");
    expect(body).toMatchObject({
      type: "compile",
      sessionId: SESSION,
      profile: "second_opinion",
      blind: true,
      route: "bundle",
      mode: "verbatim",
    });
    expect([...body.selection].sort()).toEqual(["t001", "t002"]);
  });

  it("T08 state machine: blind is sent only for Second opinion", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    expect(client.take("compile").body).not.toHaveProperty("blind");
  });

  it("T08 state machine: Working shows progress, then Review on preview with the raw envelope", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    const compile = client.take("compile");
    const progress: Progress = { type: "progress", requestId: "r", stage: "compile", done: 1, total: 2 };
    compile.opts?.onProgress?.(progress);
    await screen.findByText(/compile 1\/2/);
    compile.resolve(previewReply("<context_pack>\n  line one\n</context_pack>"));
    await screen.findByRole("heading", { name: /Review/ });
    expect(screen.getByTestId("envelope").textContent).toBe("<context_pack>\n  line one\n</context_pack>");
  });

  it("T08 state machine: cancel returns to Select and a late preview is ignored", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    const compile = client.take("compile");
    expect(compile.opts?.signal).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("heading", { name: "Select" });
    expect(compile.opts?.signal?.aborted).toBe(true);
    compile.resolve(previewReply("LATE")); // already settled as cancelled; must not move the UI
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole("heading", { name: /Review/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Select" })).toBeTruthy();
  });

  it("T08 state machine: an ingest error shows the message and the paste fallback", async () => {
    const client = new FakeClient();
    render(<Panel client={client} />);
    fireEvent.input(screen.getByLabelText("Pasted chat"), { target: { value: PASTED } });
    fireEvent.click(screen.getByRole("button", { name: "Use pasted text" }));
    await waitFor(() => expect(client.has("ingest")).toBe(true));
    client.take("ingest").resolve(errorReply("capture_empty", "Nothing to capture.", "paste"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nothing to capture.");
    fireEvent.click(within(alert).getByRole("button", { name: "Paste instead" }));
    expect(screen.getByLabelText("Pasted chat")).toBeTruthy();
  });

  it("T08 state machine: empty paste shows the parser's error and the paste fallback, sends nothing", async () => {
    const client = new FakeClient();
    render(<Panel client={client} />);
    fireEvent.input(screen.getByLabelText("Pasted chat"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Use pasted text" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/empty/i);
    expect(within(alert).getByRole("button", { name: "Paste instead" })).toBeTruthy();
    expect(client.has("ingest")).toBe(false);
  });

  it("T08 state machine: a compile error shows the message and its fallback button", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "condensed" } });
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "mcp" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    client.take("compile").resolve(errorReply("model_unavailable", "The local model is not running.", "verbatim"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The local model is not running.");
    fireEvent.click(within(alert).getByRole("button", { name: "Use verbatim mode" }));
    await screen.findByRole("heading", { name: "Select" });
    expect((screen.getByLabelText("Mode") as HTMLSelectElement).value).toBe("verbatim");
    expect((screen.getByLabelText("Route") as HTMLSelectElement).value).toBe("mcp");
  });

  it("T08 state machine: the clipboard fallback sets the route", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "mcp" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    client.take("compile").resolve(errorReply("internal", "MCP is not available.", "clipboard"));
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Use clipboard" }));
    await screen.findByRole("heading", { name: "Select" });
    expect((screen.getByLabelText("Route") as HTMLSelectElement).value).toBe("clipboard");
  });

  it("T08 state machine: an error without fallback still offers Paste instead", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    client.take("compile").resolve(errorReply("vault_error", "Disk full."));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Disk full.");
    fireEvent.click(within(alert).getByRole("button", { name: "Paste instead" }));
    expect(screen.getByRole("heading", { name: "Capture" })).toBeTruthy();
  });

  it("T08 state machine: a dropped connection returns to Capture with a message", async () => {
    const client = new FakeClient();
    await toSelect(client);
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    client.dropConnection("Connection to the host was lost; sessions were reset. (Native host has exited.)");
    await screen.findByRole("heading", { name: "Capture" });
    expect((await screen.findByRole("alert")).textContent).toContain("Connection to the host was lost");
  });
});

describe("AC-08 token meter", () => {
  it("AC-08 token meter shows the effective budget and turns red when over", async () => {
    const long = turn("t003", "assistant", "planning word ".repeat(1500));
    const turns = [...TURNS, long];
    const client = new FakeClient();
    await toSelect(client, ingested(turns, { suggestedSelection: ["t001", "t002"] }));
    const meter = screen.getByTestId("token-meter");
    const tokens = (ts: Turn[]): number =>
      ts.reduce((n, t) => n + t.parts.reduce((m, p) => m + (p.kind === "text" ? countTokens(p.text) : 0), 0), 0);

    const small = tokens(TURNS);
    expect(meter.textContent).toContain("approx.");
    expect(meter.textContent).toContain(`${small} / ${effectiveBudget("continue", "clipboard")}`);
    expect(meter.getAttribute("data-over")).toBe("false");

    fireEvent.click(screen.getByLabelText("Include t003"));
    const all = tokens(turns);
    expect(all).toBeGreaterThan(effectiveBudget("rescue", "clipboard"));
    expect(all).toBeLessThan(effectiveBudget("continue", "clipboard"));
    expect(meter.textContent).toContain(`${all} / ${effectiveBudget("continue", "clipboard")}`);
    expect(meter.getAttribute("data-over")).toBe("false");

    fireEvent.change(screen.getByLabelText("Profile"), { target: { value: "rescue" } });
    expect(meter.textContent).toContain(`${all} / ${effectiveBudget("rescue", "clipboard")}`);
    expect(meter.getAttribute("data-over")).toBe("true");
    expect(meter.style.color).toBe("red");

    fireEvent.change(screen.getByLabelText("Profile"), { target: { value: "continue" } });
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "mcp" } });
    expect(meter.textContent).toContain(`${all} / ${effectiveBudget("continue", "mcp")}`);
  });

  it("AC-08 token meter counts code, table and math parts too", async () => {
    const mixed: Turn = {
      id: "t001",
      role: "assistant",
      parts: [
        { kind: "text", text: "Here is the code:" },
        { kind: "code", lang: "ts", content: "const answer = 42;" },
        { kind: "table", markdown: "| a | b |\n| - | - |\n| 1 | 2 |" },
        { kind: "math", latex: "e^{i\\pi} + 1 = 0" },
      ],
      sha256: HASH,
    };
    const client = new FakeClient();
    await toSelect(client, ingested([mixed]));
    const expected =
      countTokens("Here is the code:") +
      countTokens("const answer = 42;") +
      countTokens("| a | b |\n| - | - |\n| 1 | 2 |") +
      countTokens("e^{i\\pi} + 1 = 0");
    expect(screen.getByTestId("token-meter").textContent).toContain(`${expected} /`);
  });
});

describe("S14 no html injection", () => {
  it("S14 no html injection: page text is rendered as text", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const client = new FakeClient();
    await toSelect(client, ingested([turn("t001", "user", `look ${evil} here`)]));
    expect(screen.getByText(`look ${evil} here`, { exact: false })).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    await screen.findByRole("heading", { name: "Working" });
    client.take("compile").resolve(previewReply(`<context_pack>${evil}</context_pack>`));
    await screen.findByRole("heading", { name: /Review/ });
    expect(screen.getByTestId("envelope").textContent).toBe(`<context_pack>${evil}</context_pack>`);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("context_pack")).toBeNull();
  });
});
