// Side panel screens (plan/extension.md §Side panel screens): Capture → Select → Working → Review → Deliver.
// Nothing is copied or downloaded before `committed` (AC-15); approve binds the displayed preview.
// Page text is rendered as text only: no dangerouslySetInnerHTML anywhere (S14).
import { parsePaste } from "@cb/adapters";
import type { Edits, Flag, ManifestEntry, Part, Profile, Route, Turn } from "@cb/schema";
import { countTokens, effectiveBudget } from "@cb/tokens";
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { HostClient, HostReply, Progress } from "../native.js";

type Mode = "condensed" | "verbatim";
type Fallback = "paste" | "verbatim" | "clipboard";
type Ingested = Extract<HostReply, { type: "ingested" }>;
type Preview = Extract<HostReply, { type: "preview" }>;
type Committed = Extract<HostReply, { type: "committed" }>;

/** Outcome of the automatic delivery step after `committed`. */
type Delivery = { state: "done" } | { state: "failed"; message: string } | { state: "manual" };

type Screen =
  | { name: "capture" }
  | { name: "select" }
  | { name: "working"; progress?: Progress }
  | { name: "review"; preview: Preview; busy: boolean }
  | { name: "deliver"; committed: Committed; delivery: Delivery; deleted: boolean; busy: boolean };

interface PanelError {
  message: string;
  fallback: Fallback;
}

interface Session {
  sessionId: string;
  turns: Turn[];
  tokensByTurn: Map<string, number>;
  attachments: number;
  missingFiles: number;
  flags: number;
  redactions: number;
}

const PROFILES: readonly [Profile, string][] = [
  ["continue", "Continue"],
  ["rescue", "Rescue"],
  ["second_opinion", "Second opinion"],
];
const ROUTES: readonly [Route, string][] = [
  ["mcp", "MCP"],
  ["bundle", "Bundle"],
  ["clipboard", "Clipboard"],
];
const MODES: readonly [Mode, string][] = [
  ["condensed", "Condensed"],
  ["verbatim", "Verbatim"],
];
const FALLBACK_LABEL: Readonly<Record<Fallback, string>> = {
  paste: "Paste instead",
  verbatim: "Use verbatim mode",
  clipboard: "Use clipboard",
};
const PREVIEW_CHARS = 280;
const NO_EDITS: Edits = { removeItemIds: [], keepUngroundedIds: [], unredact: [], moveToManifest: [], moveToPush: [] };
const DATA_NOTE = "The destination's own data policy applies once you send.";
const DESTINATIONS: readonly [string, string][] = [
  ["Open Gemini", "https://gemini.google.com/"],
  ["Open Claude", "https://claude.ai/"],
  ["Open ChatGPT", "https://chatgpt.com/"],
];

/** Token count of one part's text; attachments count 0 until T16 (decisions.md, T08). */
function partTokens(p: Part): number {
  switch (p.kind) {
    case "text":
      return countTokens(p.text);
    case "code":
    case "tool_output":
      return countTokens(p.content);
    case "table":
      return countTokens(p.markdown);
    case "math":
      return countTokens(p.latex);
    case "citation":
      return countTokens(p.url) + countTokens(p.title ?? "");
    case "attachment":
      return 0;
  }
}

function partText(p: Part): string {
  switch (p.kind) {
    case "text":
      return p.text;
    case "code":
    case "tool_output":
      return p.content;
    case "table":
      return p.markdown;
    case "math":
      return p.latex;
    case "citation":
      return p.title ? `${p.title} <${p.url}>` : p.url;
    case "attachment":
      return `[attachment ${p.attachmentId}]`;
  }
}

function turnPreview(t: Turn): string {
  const text = t.parts.map(partText).join("\n");
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

/** Turn ids covered by a manifest ref (`t004` or `t002-t005`); other refs cover none. */
function refTurns(ref: string): string[] {
  if (/^t\d{3}$/.test(ref)) return [ref];
  const m = /^t(\d{3})-t(\d{3})$/.exec(ref);
  if (!m) return [];
  const out: string[] = [];
  for (let n = Number(m[1]); n <= Number(m[2]); n++) out.push(`t${String(n).padStart(3, "0")}`);
  return out;
}

interface Segment {
  text: string;
  kind?: Flag["kind"];
}

/**
 * Split the envelope into plain and marked segments: every occurrence of a flag's `match` is
 * marked with the flag's kind (earliest, then longest, wins on overlap). Rendered as text only (S14).
 */
export function markEnvelope(envelope: string, flags: readonly Flag[]): Segment[] {
  const spans: { start: number; end: number; kind: Flag["kind"] }[] = [];
  const seen = new Set<string>();
  for (const f of flags) {
    const key = `${f.kind}:${f.match ?? ""}`;
    if (!f.match || seen.has(key)) continue;
    seen.add(key);
    for (let i = envelope.indexOf(f.match); i !== -1; i = envelope.indexOf(f.match, i + f.match.length)) {
      spans.push({ start: i, end: i + f.match.length, kind: f.kind });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Segment[] = [];
  let at = 0;
  for (const sp of spans) {
    if (sp.start < at) continue; // overlaps an earlier mark
    if (sp.start > at) out.push({ text: envelope.slice(at, sp.start) });
    out.push({ text: envelope.slice(sp.start, sp.end), kind: sp.kind });
    at = sp.end;
  }
  if (at < envelope.length) out.push({ text: envelope.slice(at) });
  return out;
}

function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function copyText(text: string): Promise<Delivery> {
  try {
    await navigator.clipboard.writeText(text);
    return { state: "done" };
  } catch (e) {
    return { state: "failed", message: errorText(e) };
  }
}

async function downloadZip(fileName: string, zipBase64: string): Promise<Delivery> {
  try {
    const blob = new Blob([decodeBase64(zipBase64)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: fileName, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { state: "done" };
  } catch (e) {
    return { state: "failed", message: errorText(e) };
  }
}

/** Runs only after `committed` (AC-15). MCP needs no automatic step. */
function deliver(c: Committed): Promise<Delivery> {
  const d = c.deliverable;
  switch (d.kind) {
    case "clipboard":
      return copyText(d.text);
    case "bundle":
      return downloadZip(d.fileName, d.zipBase64);
    case "mcp":
      return Promise.resolve({ state: "manual" });
  }
}

export interface PanelProps {
  client: HostClient;
}

export function Panel({ client }: PanelProps): JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: "capture" });
  const [error, setError] = useState<PanelError | undefined>();
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [hostInfo, setHostInfo] = useState<string | undefined>();
  const [session, setSession] = useState<Session | undefined>();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<Profile>("continue");
  const [route, setRoute] = useState<Route>("clipboard");
  const [mode, setMode] = useState<Mode>("verbatim");
  const [blind, setBlind] = useState(false);
  /** The operation in flight; replies for any other (cancelled, superseded) one are ignored. */
  const op = useRef<AbortController | undefined>(undefined);

  const begin = (): AbortController => {
    op.current?.abort();
    const ctl = new AbortController();
    op.current = ctl;
    return ctl;
  };
  const current = (ctl: AbortController): boolean => op.current === ctl && !ctl.signal.aborted;

  useEffect(() => {
    const off = client.onDisconnect((message) => {
      op.current?.abort();
      op.current = undefined;
      setBusy(false);
      setSession(undefined);
      setScreen({ name: "capture" });
      setError({ message, fallback: "paste" });
      setHostInfo(undefined);
    });
    void client.request({ type: "hello", protocol: 1 }).then((r) => {
      if (r.ok && r.reply.type === "hello_ok") {
        setHostInfo(`Host ${r.reply.hostVersion} connected${r.reply.model.available ? `, model ${r.reply.model.name ?? "available"}` : ", no local model"}`);
      }
    });
    return off;
  }, [client]);

  const fail = (message: string, fallback: Fallback | undefined): void => {
    setError({ message, fallback: fallback ?? "paste" });
  };

  const usePasted = async (): Promise<void> => {
    setError(undefined);
    const parsed = await parsePaste(pasted);
    if (!("turns" in parsed)) {
      fail(parsed.message, "paste");
      return;
    }
    const ctl = begin();
    setBusy(true);
    const r = await client.request({ type: "ingest", transcript: parsed }, { signal: ctl.signal });
    if (!current(ctl)) return;
    op.current = undefined;
    setBusy(false);
    if (!r.ok) return fail(r.error.message, "paste");
    if (r.reply.type === "error") return fail(r.reply.message, r.reply.fallback);
    if (r.reply.type !== "ingested") return fail(`Unexpected reply from the host: ${r.reply.type}`, "paste");
    startSelect(r.reply);
  };

  const startSelect = (ing: Ingested): void => {
    setSession({
      sessionId: ing.sessionId,
      turns: ing.turns,
      tokensByTurn: new Map(ing.turns.map((t) => [t.id, t.parts.reduce((n, p) => n + partTokens(p), 0)])),
      attachments: ing.attachments.length,
      missingFiles: ing.missingFiles.length,
      flags: ing.flags.length,
      redactions: ing.redactions.length,
    });
    setSelection(new Set(ing.suggestedSelection));
    setProfile(ing.suggestedProfile);
    setRoute("clipboard");
    setMode("verbatim");
    setBlind(false);
    setScreen({ name: "select" });
  };

  const prepare = async (): Promise<void> => {
    if (!session) return;
    setError(undefined);
    const ctl = begin();
    setScreen({ name: "working" });
    const ids = session.turns.map((t) => t.id).filter((id) => selection.has(id));
    const r = await client.request(
      {
        type: "compile",
        sessionId: session.sessionId,
        selection: ids,
        profile,
        route,
        mode,
        ...(profile === "second_opinion" ? { blind } : {}),
      },
      {
        signal: ctl.signal,
        onProgress: (progress) => {
          if (current(ctl)) setScreen({ name: "working", progress });
        },
      },
    );
    if (!current(ctl)) return;
    op.current = undefined;
    if (!r.ok) {
      setScreen({ name: "select" });
      return fail(r.error.message, undefined);
    }
    if (r.reply.type === "preview") {
      setScreen({ name: "review", preview: r.reply, busy: false });
      return;
    }
    setScreen({ name: "select" });
    if (r.reply.type === "error") return fail(r.reply.message, r.reply.fallback);
    fail(`Unexpected reply from the host: ${r.reply.type}`, undefined);
  };

  /** Leave Review after a failure: the old preview must not stay approvable on screen. */
  const dropPreview = (message: string, fallback: Fallback | undefined): void => {
    setScreen({ name: "select" });
    fail(message, fallback);
  };

  const revise = async (preview: Preview, edits: Partial<Edits>): Promise<void> => {
    if (!session || op.current) return; // one revise or approve at a time
    setError(undefined);
    const ctl = begin();
    setScreen({ name: "review", preview, busy: true });
    const r = await client.request(
      { type: "revise", sessionId: session.sessionId, previewId: preview.previewId, edits: { ...NO_EDITS, ...edits } },
      { signal: ctl.signal },
    );
    if (!current(ctl)) return;
    op.current = undefined;
    if (!r.ok) return dropPreview(r.error.message, undefined);
    if (r.reply.type === "preview") return setScreen({ name: "review", preview: r.reply, busy: false });
    if (r.reply.type === "error") return dropPreview(r.reply.message, r.reply.fallback);
    dropPreview(`Unexpected reply from the host: ${r.reply.type}`, undefined);
  };

  const approve = async (preview: Preview): Promise<void> => {
    // Never approve while a revise (or anything else) is in flight: the displayed preview is about to change.
    if (!session || op.current) return;
    setError(undefined);
    const ctl = begin();
    setScreen({ name: "review", preview, busy: true });
    const r = await client.request(
      { type: "approve", sessionId: session.sessionId, previewId: preview.previewId, hash: preview.hash },
      { signal: ctl.signal },
    );
    if (!current(ctl)) return;
    op.current = undefined;
    if (!r.ok) return dropPreview(r.error.message, undefined);
    if (r.reply.type === "error") return dropPreview(r.reply.message, r.reply.fallback);
    if (r.reply.type !== "committed") return dropPreview(`Unexpected reply from the host: ${r.reply.type}`, undefined);
    const committed = r.reply;
    const delivery = await deliver(committed);
    setScreen({ name: "deliver", committed, delivery, deleted: false, busy: false });
  };

  const redeliver = async (committed: Committed, step: () => Promise<Delivery>): Promise<void> => {
    const delivery = await step();
    setScreen((s) => (s.name === "deliver" && s.committed === committed ? { ...s, delivery } : s));
  };

  const deletePack = async (committed: Committed): Promise<void> => {
    setError(undefined);
    const ctl = begin();
    setScreen((s) => (s.name === "deliver" ? { ...s, busy: true } : s));
    const r = await client.request({ type: "delete_pack", packId: committed.packId }, { signal: ctl.signal });
    if (!current(ctl)) return;
    op.current = undefined;
    const ok = r.ok && r.reply.type === "deleted";
    setScreen((s) => (s.name === "deliver" ? { ...s, busy: false, deleted: s.deleted || ok } : s));
    if (ok) return;
    if (!r.ok) return fail(r.error.message, undefined);
    fail(r.reply.type === "error" ? r.reply.message : `Unexpected reply from the host: ${r.reply.type}`, undefined);
  };

  const cancel = (): void => {
    op.current?.abort();
    op.current = undefined;
    setScreen({ name: "select" });
  };

  const applyFallback = (f: Fallback): void => {
    setError(undefined);
    if (f === "paste" || !session) {
      op.current?.abort();
      op.current = undefined;
      setBusy(false);
      setSession(undefined);
      setScreen({ name: "capture" });
      return;
    }
    if (f === "verbatim") setMode("verbatim");
    if (f === "clipboard") setRoute("clipboard");
    setScreen({ name: "select" });
  };

  const newTransfer = (): void => {
    op.current?.abort();
    op.current = undefined;
    setError(undefined);
    setSession(undefined);
    setPasted("");
    setScreen({ name: "capture" });
  };

  return (
    <main class="panel">
      {hostInfo && <p class="host">{hostInfo}</p>}
      {error && (
        <div role="alert" class="error">
          <p>{error.message}</p>
          <button type="button" onClick={() => applyFallback(error.fallback)}>
            {FALLBACK_LABEL[error.fallback]}
          </button>
        </div>
      )}
      {screen.name === "capture" && (
        <CaptureScreen pasted={pasted} busy={busy} onPasted={setPasted} onUse={() => void usePasted()} />
      )}
      {screen.name === "select" && session && (
        <SelectScreen
          session={session}
          selection={selection}
          profile={profile}
          route={route}
          mode={mode}
          blind={blind}
          onSelection={setSelection}
          onProfile={setProfile}
          onRoute={setRoute}
          onMode={setMode}
          onBlind={setBlind}
          onPrepare={() => void prepare()}
        />
      )}
      {screen.name === "working" && <WorkingScreen progress={screen.progress} onCancel={cancel} />}
      {screen.name === "review" && session && (
        <ReviewScreen
          preview={screen.preview}
          busy={screen.busy}
          route={route}
          selection={selection}
          turns={session.turns}
          onRevise={(edits) => void revise(screen.preview, edits)}
          onApprove={() => void approve(screen.preview)}
          onNew={newTransfer}
        />
      )}
      {screen.name === "deliver" && (
        <DeliverScreen
          committed={screen.committed}
          delivery={screen.delivery}
          deleted={screen.deleted}
          busy={screen.busy}
          onCopy={(text) => void redeliver(screen.committed, () => copyText(text))}
          onDownload={(f, z) => void redeliver(screen.committed, () => downloadZip(f, z))}
          onDelete={() => void deletePack(screen.committed)}
          onNew={newTransfer}
        />
      )}
    </main>
  );
}

function CaptureScreen(props: {
  pasted: string;
  busy: boolean;
  onPasted: (v: string) => void;
  onUse: () => void;
}): JSX.Element {
  return (
    <section>
      <h1>Capture</h1>
      <button type="button" disabled title="adapters arrive in T12">
        Capture this chat
      </button>
      <label for="pasted">Pasted chat</label>
      <textarea
        id="pasted"
        rows={12}
        placeholder={"User: …\nAssistant: …"}
        value={props.pasted}
        onInput={(e) => props.onPasted(e.currentTarget.value)}
      />
      <button type="button" disabled={props.busy} onClick={props.onUse}>
        Use pasted text
      </button>
    </section>
  );
}

function SelectScreen(props: {
  session: Session;
  selection: Set<string>;
  profile: Profile;
  route: Route;
  mode: Mode;
  blind: boolean;
  onSelection: (s: Set<string>) => void;
  onProfile: (p: Profile) => void;
  onRoute: (r: Route) => void;
  onMode: (m: Mode) => void;
  onBlind: (b: boolean) => void;
  onPrepare: () => void;
}): JSX.Element {
  const { session, selection } = props;
  const budget = effectiveBudget(props.profile, props.route);
  const tokens = useMemo(
    () => [...selection].reduce((n, id) => n + (session.tokensByTurn.get(id) ?? 0), 0),
    [selection, session],
  );
  const over = tokens > budget;
  const toggle = (id: string): void => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onSelection(next);
  };
  return (
    <section>
      <h1>Select</h1>
      <p class="counts">
        {session.turns.length} turns, {session.attachments} files
        {session.missingFiles > 0 && `, ${session.missingFiles} files not exposed by the page`}
        {session.flags > 0 && `, ${session.flags} flags`}
        {session.redactions > 0 && `, ${session.redactions} redactions`}
      </p>
      <div class="row">
        <label for="profile">Profile</label>
        <select id="profile" value={props.profile} onChange={(e) => props.onProfile(e.currentTarget.value as Profile)}>
          {PROFILES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {props.profile === "second_opinion" && (
          <>
            <input id="blind" type="checkbox" checked={props.blind} onChange={(e) => props.onBlind(e.currentTarget.checked)} />
            <label for="blind">Blind</label>
          </>
        )}
      </div>
      <div class="row">
        <label for="route">Route</label>
        <select id="route" value={props.route} onChange={(e) => props.onRoute(e.currentTarget.value as Route)}>
          {ROUTES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label for="mode">Mode</label>
        <select id="mode" value={props.mode} onChange={(e) => props.onMode(e.currentTarget.value as Mode)}>
          {MODES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <p data-testid="token-meter" data-over={String(over)} class="meter" style={over ? { color: "red" } : undefined}>
        approx. {tokens} / {budget} tokens
      </p>
      <ul class="turns">
        {session.turns.map((t) => (
          <li key={t.id}>
            <input
              type="checkbox"
              aria-label={`Include ${t.id}`}
              checked={selection.has(t.id)}
              onChange={() => toggle(t.id)}
            />
            <span class="turn-id">
              {t.id} · {t.role} · {session.tokensByTurn.get(t.id) ?? 0} tokens
            </span>
            <div class="turn-text">{turnPreview(t)}</div>
          </li>
        ))}
      </ul>
      <button type="button" class="primary" disabled={selection.size === 0} onClick={props.onPrepare}>
        Prepare
      </button>
    </section>
  );
}

function WorkingScreen(props: { progress: Progress | undefined; onCancel: () => void }): JSX.Element {
  const p = props.progress;
  return (
    <section>
      <h1>Working</h1>
      <p class="progress">{p ? `${p.stage} ${p.done}/${p.total}` : "Starting…"}</p>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </section>
  );
}

function ReviewScreen(props: {
  preview: Preview;
  busy: boolean;
  route: Route;
  selection: Set<string>;
  turns: Turn[];
  onRevise: (edits: Partial<Edits>) => void;
  onApprove: () => void;
  onNew: () => void;
}): JSX.Element {
  const { preview, busy } = props;
  const [confirming, setConfirming] = useState<string | undefined>();
  const segments = useMemo(() => markEnvelope(preview.envelope, preview.flags), [preview]);
  const cut = new Set(preview.cutList.flatMap((e) => refTurns(e.ref)));
  const pushed = props.turns.filter((t) => props.selection.has(t.id) && !cut.has(t.id));
  const placeholders = [
    ...new Set(
      preview.flags.flatMap((f) =>
        f.kind === "redacted" && f.match !== undefined && preview.envelope.includes(f.match) ? [f.match] : [],
      ),
    ),
  ];
  const routeLabel = ROUTES.find(([v]) => v === props.route)?.[1] ?? props.route;
  return (
    <section>
      <h1>Review</h1>
      <p class="counts" data-testid="review-stats">
        {preview.stats.pushedTokens} / {preview.stats.budget} tokens, {preview.stats.cutCount} cut
      </p>
      {preview.notices.length > 0 && (
        <ul class="notices">
          {preview.notices.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <pre data-testid="envelope" class="envelope">
        {segments.map((sg, i) =>
          sg.kind ? (
            <mark key={i} data-kind={sg.kind} class={`flag-${sg.kind}`}>
              {sg.text}
            </mark>
          ) : (
            sg.text
          ),
        )}
      </pre>
      {placeholders.length > 0 && (
        <>
          <h2>Redactions</h2>
          <ul class="redactions">
            {placeholders.map((ph) => (
              <li key={ph}>
                <button type="button" disabled={busy} onClick={() => setConfirming(ph)}>
                  Reveal {ph}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {confirming && (
        <div role="alertdialog" aria-label={`Reveal ${confirming}?`} class="confirm">
          <p>
            Reveal {confirming}? Its original value replaces the placeholder in the pack: it is sent to the
            destination and stored with the pack when you approve. Only reveal it if the destination may see it.
          </p>
          <button
            type="button"
            onClick={() => {
              const ph = confirming;
              setConfirming(undefined);
              props.onRevise({ unredact: [ph] });
            }}
          >
            Reveal
          </button>
          <button type="button" onClick={() => setConfirming(undefined)}>
            Cancel
          </button>
        </div>
      )}
      {pushed.length > 0 && (
        <>
          <h2>Turns in the pack</h2>
          <ul class="pushed">
            {pushed.map((t) => (
              <li key={t.id}>
                <span class="turn-id">
                  {t.id} · {t.role}
                </span>{" "}
                <button type="button" disabled={busy} onClick={() => props.onRevise({ moveToManifest: [t.id] })}>
                  Remove {t.id}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {preview.cutList.length > 0 && (
        <>
          <h2>Not pushed</h2>
          <ul class="cut">
            {preview.cutList.map((e: ManifestEntry) => (
              <li key={e.ref}>
                {e.ref}: {e.what} ({e.why}){" "}
                {/^t\d{3}$/.test(e.ref) && (
                  <button type="button" disabled={busy} onClick={() => props.onRevise({ moveToPush: [e.ref] })}>
                    Include {e.ref}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="destination">Destination: {routeLabel}</p>
      <p class="note">{DATA_NOTE}</p>
      <button type="button" class="primary" disabled={busy || confirming !== undefined} onClick={props.onApprove}>
        Approve and send
      </button>
      <button type="button" onClick={props.onNew}>
        New transfer
      </button>
    </section>
  );
}

function DeliverScreen(props: {
  committed: Committed;
  delivery: Delivery;
  deleted: boolean;
  busy: boolean;
  onCopy: (text: string) => void;
  onDownload: (fileName: string, zipBase64: string) => void;
  onDelete: () => void;
  onNew: () => void;
}): JSX.Element {
  const d = props.committed.deliverable;
  const done = props.delivery.state === "done";
  const failed = props.delivery.state === "failed" ? props.delivery.message : undefined;
  return (
    <section>
      <h1>Deliver</h1>
      <p class="counts">Pack {props.committed.packId}</p>
      {d.kind === "clipboard" && (
        <>
          <p>{done ? "Copied to the clipboard." : `Could not copy automatically${failed ? ` (${failed})` : ""}. Click Copy.`}</p>
          <button type="button" onClick={() => props.onCopy(d.text)}>
            {done ? "Copy again" : "Copy"}
          </button>
          <div class="row">
            {DESTINATIONS.map(([label, href]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ))}
          </div>
        </>
      )}
      {d.kind === "bundle" && (
        <>
          <p>{done ? `Downloaded ${d.fileName}.` : `The download did not start${failed ? ` (${failed})` : ""}.`}</p>
          <button type="button" onClick={() => props.onDownload(d.fileName, d.zipBase64)}>
            Download again
          </button>
        </>
      )}
      {d.kind === "mcp" && (
        <>
          <p>Type this in the destination client:</p>
          <p>
            <code>{d.instruction}</code>
          </p>
          <button type="button" onClick={() => props.onCopy(d.instruction)}>
            Copy
          </button>
          {done && <p>Copied to the clipboard.</p>}
          {failed && <p>Could not copy ({failed}).</p>}
        </>
      )}
      {props.deleted ? (
        <p>Pack deleted.</p>
      ) : (
        <button type="button" disabled={props.busy} onClick={props.onDelete}>
          Delete this pack
        </button>
      )}
      <button type="button" onClick={props.onNew}>
        New transfer
      </button>
    </section>
  );
}
