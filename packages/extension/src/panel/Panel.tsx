// Side panel screens (plan/extension.md §Side panel screens): Capture → Select → Working → Review.
// Review is a placeholder that shows the raw envelope (full Review is T09).
// Page text is rendered as text only: no dangerouslySetInnerHTML anywhere (S14).
import { parsePaste } from "@cb/adapters";
import type { Part, Profile, Route, Turn } from "@cb/schema";
import { countTokens, effectiveBudget } from "@cb/tokens";
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { HostClient, HostReply, Progress } from "../native.js";

type Mode = "condensed" | "verbatim";
type Fallback = "paste" | "verbatim" | "clipboard";
type Ingested = Extract<HostReply, { type: "ingested" }>;
type Preview = Extract<HostReply, { type: "preview" }>;

type Screen =
  | { name: "capture" }
  | { name: "select" }
  | { name: "working"; progress?: Progress }
  | { name: "review"; preview: Preview };

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
      setScreen({ name: "review", preview: r.reply });
      return;
    }
    setScreen({ name: "select" });
    if (r.reply.type === "error") return fail(r.reply.message, r.reply.fallback);
    fail(`Unexpected reply from the host: ${r.reply.type}`, undefined);
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
      {screen.name === "review" && <ReviewScreen preview={screen.preview} onNew={newTransfer} />}
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

function ReviewScreen(props: { preview: Preview; onNew: () => void }): JSX.Element {
  const { preview } = props;
  return (
    <section>
      <h1>Review (placeholder)</h1>
      <p class="note">Full review arrives in T09. Nothing has been copied, saved or sent.</p>
      {preview.notices.length > 0 && (
        <ul class="notices">
          {preview.notices.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p class="counts">
        {preview.stats.pushedTokens} / {preview.stats.budget} tokens, {preview.stats.cutCount} cut
      </p>
      <pre data-testid="envelope" class="envelope">
        {preview.envelope}
      </pre>
      <button type="button" onClick={props.onNew}>
        New transfer
      </button>
    </section>
  );
}
