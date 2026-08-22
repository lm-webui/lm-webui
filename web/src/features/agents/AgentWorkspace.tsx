import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot, Loader2, Copy, Check, RefreshCw, ArrowLeft,
  PanelRightClose, PanelRightOpen, Activity, CircleDot, Clock, Plus, MessageSquareText,
  CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authFetch, streamAgent, getAgentSessions, installAgent } from "@/utils/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { AGENT_META, AGENT_IDS, type AgentInfo } from "./agentProviders";
import AgentFiles from "./AgentFiles";
import AgentTelemetry from "./AgentTelemetry";
import TerminalPane from "./TerminalPane";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";
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

  const refresh = async () => {
    try { const d: any = await authFetch("/api/agents"); setAgents(d.agents || []); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  // Load the agent's past sessions for the rail (continuation is --resume-based now).
  useEffect(() => {
    if (!agent) { setSessions([]); return; }
    getAgentSessions(agent).then((d) => setSessions(d.sessions || [])).catch(() => setSessions([]));
  }, [agent]);

  const selectAgent = async (id: string) => {
    setAgent(id);
    setSessionId("");
    try {
      const r: any = await authFetch(`/api/agents/${id}/sessions`, { method: "POST" });
      setSessionId(r.session_id);
    } catch { setSessionId(""); }
    setTab("terminal"); // the TUI is the single interactive surface for a live agent
  };

  const resumeSession = async (sid: string) => {
    setSessionId(sid);
    setTab("terminal"); // the PTY replays the session's history on connect
  };

  const active = agents.find((a) => a.id === agent);
  const ActiveIcon = AGENT_META[agent]?.icon ?? Bot;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background relative">
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

        <TabsContent value="terminal" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="flex flex-col h-full min-h-0">
            <TerminalPane agent={agent} sessionId={sessionId} />
            <div className="shrink-0 border-t border-border/40 bg-background p-3">
              <AgentSelector agents={agents} agent={agent} onSelect={selectAgent} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="activity" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ActivityTab agents={agents} agent={agent} onSelect={setAgent} />
        </TabsContent>
        <TabsContent value="manage" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ManageTab agents={agents} agent={agent} onRefresh={refresh} />
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

function ActivityTab({ agents, agent, onSelect }: {
  agents: AgentInfo[]; agent: string; onSelect: (id: string) => void;
}) {
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
  useEffect(() => { loadRuns(agent); }, [agent]);

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
    await streamAgent(agent, { message: text }, {
      onOutput: (line) => { acc += line; setLive({ text: acc, startedAt, tokens: Math.floor(acc.length / 4) }); },
      onRun: (run) => { setLive(null); setRuns((r) => [run, ...r.filter((x) => x.run_id !== run.run_id)]); },
      onError: (err) => { setLive(null); setError(err.message || "Agent run failed"); },
    }, ctl.signal);
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
      <div className="border-t p-3 space-y-2">
        {/* Agent selector above the input, matching the chat tab layout */}
        <AgentSelector agents={agents} agent={agent} onSelect={onSelect} />
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
// Health badge, matching the Runtime Manager's status styling (RuntimeTab.tsx).
function HealthBadge({ status, installed }: { status?: string | undefined; installed: boolean }) {
  if (status === "ok" || (installed && !status)) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Installed</Badge>;
  }
  if (status === "degraded") {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
  }
  return <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"><XCircle className="h-3 w-3 mr-1" />Not installed</Badge>;
}

function ManageTab({ agents, agent, onRefresh }: {
  agents: AgentInfo[]; agent: string; onRefresh: () => void;
}) {
  const [copied, setCopied] = useState("");
  const [installing, setInstalling] = useState("");
  const [editingAgent, setEditingAgent] = useState("");

  const copy = async (cmd: string) => {
    const ok = await copyText(cmd);
    if (ok) { setCopied(cmd); setTimeout(() => setCopied(""), 1500); }
  };

  const install = async (id: string, update: boolean) => {
    setInstalling(id);
    try {
      await installAgent(id, update);
      toast.success(`${update ? "Update" : "Install"} launched in the host terminal.`);
      setTimeout(onRefresh, 2500);
    } catch { /* the host terminal remains the source of install errors */ }
    setInstalling("");
  };

  // Drill-down: clicking an agent opens its config/skill/memory editor.
  if (editingAgent) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="p-3 border-b flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditingAgent("")}>
            <ArrowLeft className="h-3.5 w-3.5" /> All agents
          </Button>
          <span className="text-sm font-medium">{AGENT_META[editingAgent]?.label ?? editingAgent}</span>
        </div>
        <div className="flex-1 min-h-0">
          <AgentFiles agent={editingAgent} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full grid grid-cols-1 sm:grid-cols-2 gap-3">
      {AGENT_IDS.map((id) => {
        const meta = AGENT_META[id]!;
        const Icon = meta.icon;
        const a = agents.find((x) => x.id === id);
        const installed = a?.installed;
        return (
          <Card key={id} className={cn(installed && "cursor-pointer", agent === id && "ring-1 ring-primary")}
            onClick={() => installed && setEditingAgent(id)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", meta.color)} />
                  <CardTitle className="text-sm">{meta.label}</CardTitle>
                </div>
                <HealthBadge status={a?.status} installed={!!installed} />
              </div>
            </CardHeader>
            <CardContent>
              {installed ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {a?.version && <span className="mr-2">v{a.version}</span>}
                    <span className="truncate max-w-[180px]">{a?.path || "on PATH"}</span>
                  </p>
                  <Button variant="outline" size="sm" className="w-full" disabled={installing === id}
                    onClick={(e) => { e.stopPropagation(); install(id, true); }}>
                    {installing === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    {installing === id ? "Updating…" : "Update in host terminal"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[.7rem] text-muted-foreground">Install this agent on the host to chat with it.</p>
                  <div className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                    <code className="flex-1 text-[.65rem] truncate">{getInstallCmd(id)}</code>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); copy(getInstallCmd(id)); }}>
                      {copied === getInstallCmd(id) ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <Button size="sm" className="w-full" disabled={installing === id}
                    onClick={(e) => { e.stopPropagation(); install(id, false); }}>
                    {installing === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Install in host terminal"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <div className="sm:col-span-2">
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Re-check installed agents
        </Button>
      </div>
    </div>
  );
}

// ponytail: install cmds are defined on the backend; mirror as fallback if profile not loaded.
function getInstallCmd(id: string): string {
  const hints: Record<string, string> = {
    claude: "npm install -g @anthropic-ai/claude-code",
    codex: "npm install -g @openai/codex",
    opencode: "npm install -g opencode-ai",
    hermes: "npm install -g hermes",
  };
  return hints[id] ?? id;
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
