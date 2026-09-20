import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot, Loader2, Copy, Check, RefreshCw,
  PanelRightClose, PanelRightOpen, Activity, CircleDot, Clock, Plus, MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  authFetch, streamAgent, getAgents, getAgentSessions, getAgentProfile, installAgent,
} from "@/utils/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { AGENT_META, AGENT_IDS, HealthBadge, type AgentInfo } from "./agentProviders";
import { AgentRail } from "./AgentRail";
import AgentFiles from "./AgentFiles";
import AgentTelemetry from "./AgentTelemetry";
import TerminalPane from "./TerminalPane";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";
// An agent install runs in an external terminal, so the result has to be waited for. `npm install
// -g` typically takes 30–90 s; ~2 minutes of polling covers it, and the Manage tab's Re-check
// button is the escape hatch when it doesn't.
const INSTALL_POLL_TRIES = 24;
const INSTALL_POLL_MS = 5000;

export default function AgentWorkspace() {
  const isMobile = useIsMobile();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agent, setAgent] = useState("");
  const [tab, setTab] = useState("terminal");
  // ponytail: rail collapses by default on mobile (init from width to avoid a flash).
  const [railOpen, setRailOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);

  // Collapse the rail if the viewport shrinks to mobile (covers resize/rotation too).
  useEffect(() => { if (isMobile) setRailOpen(false); }, [isMobile]);

  // The session id drives the terminal's WebSocket connection (one PTY per (agent, session)).
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);

  // `bust` re-probes install state server-side, bypassing the backend's detect cache.
  // Returns the list so the post-install poll can inspect it.
  const refresh = async (bust = false): Promise<any[]> => {
    try {
      const d: any = await getAgents(bust);
      const list = d.agents || [];
      setAgents(list);
      return list;
    } catch (err) {
      // Not silent: an empty list renders every agent as "not installed", which is a
      // very different story from "the request failed".
      toast.error(`Could not list agents: ${(err as Error).message}`);
      return [];
    }
  };
  useEffect(() => { void refresh(); }, []);

  // Load the agent's past sessions for the rail (continuation is --resume-based now).
  useEffect(() => {
    if (!agent) { setSessions([]); return; }
    let alive = true;
    getAgentSessions(agent)
      .then((d) => { if (alive) setSessions(d.sessions || []); })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [agent]);

  // Guards against a stale POST: clicking claude then codex could otherwise land claude's
  // session id while codex is selected, and the terminal would connect to a mismatched pair.
  const selectSeq = useRef(0);

  const selectAgent = async (id: string) => {
    const seq = ++selectSeq.current;
    setAgent(id);
    setSessionId("");
    setTab("terminal"); // the TUI is the single interactive surface for a live agent
    try {
      const r: any = await authFetch(`/api/agents/${id}/sessions`, { method: "POST" });
      if (seq === selectSeq.current) setSessionId(r.session_id);
    } catch (err) {
      if (seq === selectSeq.current) {
        setSessionId("");
        toast.error(`Could not start a ${id} session: ${(err as Error).message}`);
      }
    }
  };

  const resumeSession = async (sid: string) => {
    setSessionId(sid);
    setTab("terminal"); // the PTY replays the session's history on connect
  };

  const active = agents.find((a) => a.id === agent);
  const ActiveIcon = AGENT_META[agent]?.icon ?? Bot;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background relative">
      {/* The agent menu. The Hub needs the width for the terminal, so below `sm` the rail is
          replaced by the chip selector under the header. */}
      <AgentRail
        agents={agents}
        agent={agent}
        onSelect={selectAgent}
        className="hidden sm:flex"
      />
      <Tabs value={tab} onValueChange={setTab} className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 h-12 shrink-0">
          <div className="flex items-center gap-2">
            <ActiveIcon className={cn("h-4 w-4", AGENT_META[agent]?.color)} />
            <span className="text-sm font-semibold hidden sm:inline">Agent Hub</span>
          </div>
          <div className="flex-1 flex justify-center">
            <TabsList>
              <TabsTrigger value="terminal">Terminal</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="manage">Manage</TabsTrigger>
            </TabsList>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setRailOpen((v) => !v)} title="Toggle info rail">
            {railOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>

        <div className="shrink-0 border-b border-border/40 px-3 py-2 sm:hidden">
          <AgentSelector agents={agents} agent={agent} onSelect={selectAgent} />
        </div>

        {/* forceMount: without it Radix unmounts the inactive panels, so leaving the Terminal
            tab tears down the WebSocket (and, before the backend detach fix, the agent's
            process with it). The hidden-when-inactive class needs the panel to stay mounted. */}
        <TabsContent forceMount value="terminal" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="flex flex-col h-full min-h-0">
            <TerminalPane agent={agent} sessionId={sessionId} />
          </div>
        </TabsContent>
        <TabsContent forceMount value="activity" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ActivityTab agent={agent} sessionId={sessionId} />
        </TabsContent>
        <TabsContent forceMount value="manage" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ManageTab agent={agent} active={active} onRefresh={refresh} onOpenSession={resumeSession} />
        </TabsContent>
      </Tabs>

      {/* Collapsible right rail — overlay drawer on mobile, in-flow column on desktop */}
      {railOpen && isMobile && (
        <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setRailOpen(false)} />
      )}
      {railOpen && (
        <aside className={cn(
          "w-72 shrink-0 border-l border-border/50 flex flex-col min-h-0 overflow-hidden",
          isMobile && "absolute inset-y-0 right-0 z-30 bg-background shadow-xl",
        )}>
          <SessionRail agent={agent} sessionId={sessionId} sessions={sessions}
            onNew={selectAgent} onResume={resumeSession} />
          {/* Telemetry pinned to the bottom — session list scrolls in the space above. */}
          <div className="shrink-0 min-h-0 overflow-y-auto">
            <ProfileRail agent={agent} active={active} />
          </div>
        </aside>
      )}
    </div>
  );
}

/* ------------------------- Shared agent selector ------------------------- */
// ponytail: one selector reused by Chat (new session) + Activity (view runs).
function AgentSelector({ agents, agent, onSelect, size = "md" }: {
  agents: AgentInfo[]; agent: string; onSelect: (id: string) => void; size?: "sm" | "md";
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap">
      {AGENT_IDS.map((id) => {
        const meta = AGENT_META[id]!;
        const Icon = meta.icon;
        const installed = agents.find((a) => a.id === id)?.installed;
        return (
          <button key={id} onClick={() => onSelect(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
              size === "sm" ? "text-[.7rem]" : "text-xs",
              agent === id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
            )}
            title={`${id}${installed ? "" : " (not installed)"}`}>
            <Icon className={cn("h-4 w-4", meta.color)} />
            <span>{meta.label}</span>
            {!installed && <span className="text-[.6rem] text-zinc-400">offline</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- Activity tab ------------------------------ */
// ponytail: live run (SSE) + run history for the selected agent. We render our spawned
// process, not the agent's internal sub-agents; tokens are a chars/4 estimate.
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function RunCard({ run }: { run: any }) {
  const [open, setOpen] = useState(false);
  const dur = run.ended_at && run.started_at
    ? Math.max(0, Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000))
    : null;
  return (
    <div className="rounded-xl border border-border/60">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/40">
        <CircleDot className={cn("h-3.5 w-3.5 shrink-0",
          run.status === "done" ? "text-emerald-500" : run.status === "failed" ? "text-red-500" : "text-muted-foreground")} />
        <span className="text-xs font-medium capitalize">{run.status}</span>
        {dur !== null && <span className="text-[.65rem] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{dur}s</span>}
        {run.exit_code != null && run.exit_code !== 0 && <span className="text-[.65rem] text-red-500">exit {run.exit_code}</span>}
        <span className="ml-auto text-[.65rem] text-muted-foreground">~{run.tokens} tok</span>
      </button>
      {open && run.output && (
        <pre className="px-3 pb-3 text-xs whitespace-pre-wrap font-mono text-muted-foreground max-h-64 overflow-y-auto">{run.output}</pre>
      )}
    </div>
  );
}

function ActivityTab({ agent, sessionId }: { agent: string; sessionId: string }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [live, setLive] = useState<{ text: string; startedAt: number; tokens: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const now = useNow(!!live);

  const loadRuns = async (a: string) => {
    if (!a) { setRuns([]); return; }
    try { const d: any = await authFetch(`/api/agents/${a}/runs`); setRuns(d.runs || []); } catch { setRuns([]); }
  };
  useEffect(() => {
    // Switching agents must not leave the previous agent's run streaming into this tab's card.
    abortRef.current?.abort();
    setLive(null);
    setError("");
    void loadRuns(agent);
  }, [agent]);

  // Stop a run's callbacks writing into an unmounted tab.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runNow = async () => {
    const text = input.trim();
    if (!text || !agent || busy) return;
    setBusy(true);
    setInput("");
    setError("");
    const startedAt = Date.now();
    setLive({ text: "", startedAt, tokens: 0 });
    const ctl = new AbortController();
    abortRef.current = ctl;
    let acc = "";
    // session_id is what makes the second run continue the first (claude resumes via --resume);
    // omitting it created a brand-new session — and so a brand-new conversation — every time.
    await streamAgent(agent, { message: text, ...(sessionId ? { session_id: sessionId } : {}) }, {
      onOutput: (line) => { acc += line; setLive({ text: acc, startedAt, tokens: Math.floor(acc.length / 4) }); },
      onRun: (run) => { setRuns((r) => [run, ...r.filter((x) => x.run_id !== run.run_id)]); },
      onError: (err) => { setError(err.message || "Agent run failed"); },
      // Runs last on every path, including the not-installed one that emits no `run` frame.
      onComplete: () => setLive(null),
    }, ctl.signal);
    setLive(null);
    setBusy(false);
    abortRef.current = null;
  };

  const elapsed = live ? Math.max(0, Math.round((now - live.startedAt) / 1000)) : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {live && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {agent} is running
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
                <Clock className="h-3 w-3" />{elapsed}s · ~{live.tokens} tok
              </span>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground line-clamp-6">{live.text || "…"}</pre>
          </div>
        )}
        {!live && error && (
          <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {!live && !error && runs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Activity className="h-10 w-10 opacity-30 mb-2" />
            <p className="text-sm">No runs for {agent || "this agent"} yet.</p>
          </div>
        )}
        {runs.map((r) => <RunCard key={r.run_id} run={r} />)}
      </div>
      <div className="border-t p-3">
        {/* Agent selection lives in the rail (or the mobile chip row under the header). */}
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runNow()}
            placeholder={`Run ${agent || "an agent"}…`}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button onClick={runNow} disabled={busy || !input.trim() || !agent}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Manage tab ------------------------------- */
/* The selected agent's detail: install state on top, its config/skill/memory files below.
 * Selection lives in the rail, so there is no card grid or drill-down here. */
function ManageTab({ agent, active, onRefresh, onOpenSession }: {
  agent: string; active: AgentInfo | undefined; onRefresh: (bust?: boolean) => Promise<any[]>;
  /** Bring a session's terminal to the front — how an install shows its output. */
  onOpenSession: (sid: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installCmd, setInstallCmd] = useState("");
  const installed = !!active?.installed;

  // The install command is owned by the backend agent registry — read it rather than mirror it.
  useEffect(() => {
    if (!agent) { setInstallCmd(""); return; }
    let alive = true;
    getAgentProfile(agent)
      .then((p) => { if (alive) setInstallCmd(p.install_cmd || ""); })
      .catch(() => { if (alive) setInstallCmd(""); });
    return () => { alive = false; };
  }, [agent]);

  const copy = async () => {
    if (!installCmd) return;
    if (await copyText(installCmd)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const install = async (update: boolean) => {
    if (!agent) return;
    setInstalling(true);
    try {
      const r = await installAgent(agent, update);
      if (!r.launched) {
        toast.info(`${agent} is already installed.`);
        setInstalling(false);
        return;
      }
      // The install runs in one of our own terminal tabs now, so open it rather than leaving the
      // user to find a separate OS window — the output streams over the terminal socket and
      // survives a reload. session_id is null only on the host-terminal fallback.
      if (r.session_id) {
        onOpenSession(r.session_id);
        toast.success(`${update ? "Updating" : "Installing"} ${agent} — output in the Terminal tab.`);
      } else {
        toast.success(`${update ? "Update" : "Install"} launched in a host terminal.`);
      }
      // The install runs in an external terminal (`npm install -g` takes 30–90 s), so a single
      // re-probe can never see the result — the old 2.5 s timer reliably cached "missing" for the
      // rest of the day. Poll until it appears, then stop. The Manage tab's re-check button is the
      // escape hatch if this gives up first.
      for (let i = 0; i < INSTALL_POLL_TRIES; i++) {
        await new Promise((res) => setTimeout(res, INSTALL_POLL_MS));
        const list = await onRefresh(true);
        if (list?.find((a: any) => a.id === agent)?.installed) {
          toast.success(`${agent} installed.`);
          break;
        }
      }
    } catch (err) {
      // 409 = no terminal to open (headless / Docker). The command is right here to copy.
      toast.error((err as Error).message || `Could not install ${agent}`);
    }
    setInstalling(false);
  };

  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
        Pick an agent from the left to manage it.
      </div>
    );
  }

  const meta = AGENT_META[agent];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{meta?.label ?? agent}</span>
          <HealthBadge status={active?.status} installed={installed} />
          {/* Re-check install state. The "Update" button used to be the only way to refresh, and it
              re-runs the installer — a plain re-probe is what you want after installing by hand. */}
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5" disabled={installing}
            title="Re-check whether this agent is installed"
            onClick={() => onRefresh(true)}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-check
          </Button>
          {installed && meta ? (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={installing}
              onClick={() => install(true)}>
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {installing ? "Updating…" : "Update"}
            </Button>
          ) : null}
        </div>

        {installed ? (
          <p className="text-xs text-muted-foreground">
            {active?.version && <span className="mr-2">v{active.version}</span>}
            <span className="font-mono text-[.65rem]">{active?.path || "on PATH"}</span>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This agent is not on the host yet. Install it to chat with it.
            </p>
            {installCmd ? (
              <div className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                <code className="flex-1 truncate font-mono text-[.65rem]">{installCmd}</code>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copy} title="Copy install command">
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            ) : null}
            <Button size="sm" disabled={installing} onClick={() => install(false)}>
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Install in host terminal"}
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <AgentFiles agent={agent} />
      </div>
    </div>
  );
}

/* ------------------------- Session rail (right) ------------------------- */
// Selectable session history, like a terminal-session sidebar: click one to resume it (--resume).
function SessionRail({ agent, sessionId, sessions, onNew, onResume }: {
  agent: string; sessionId: string; sessions: any[];
  onNew: (id: string) => void; onResume: (sid: string) => void;
}) {
  const row = (sid: string, label: string, icon: ReactNode, activeRow: boolean) => (
    <button onClick={() => (sid ? onResume(sid) : onNew(agent))}
      className={cn(
        "w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
        activeRow ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50",
      )}>
      {icon}
      <span className="truncate font-mono">{label}</span>
    </button>
  );
  return (
    <div className="border-b border-border/50 p-3 space-y-2 flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">Sessions</span>
        <button onClick={() => onNew(agent)} className="text-[.65rem] text-primary hover:underline shrink-0">
          + New
        </button>
      </div>
      {!agent ? (
        <p className="text-[.65rem] text-muted-foreground px-1">Select an agent to see sessions.</p>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1 min-h-0 max-h-96">
          {row("", "New session", <Plus className="h-3.5 w-3.5 shrink-0" />, !sessionId)}
          {sessions.length === 0 && (
            <p className="text-[.65rem] text-muted-foreground px-1 pt-1">No past sessions yet.</p>
          )}
          {sessions.map((s) => row(s.sid, s.sid, <MessageSquareText className="h-3.5 w-3.5 shrink-0" />, s.sid === sessionId))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Profile right rail -------------------------- */
// ponytail: the rail shows the selected agent's live telemetry (usage/context).
function ProfileRail({ agent, active }: { agent: string; active: AgentInfo | undefined }) {
  if (!agent) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex-1 flex items-center justify-center text-center">
        Select an agent to see its usage and context.
      </div>
    );
  }
  return <AgentTelemetry agent={agent} active={active} />;
}
