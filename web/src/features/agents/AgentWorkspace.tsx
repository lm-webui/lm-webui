import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot, Cpu, Terminal, Sparkles, Loader2, Copy, Check, RefreshCw,
  PanelRightClose, PanelRightOpen, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authFetch } from "@/utils/api";
import { cn } from "@/lib/utils";

interface AgentInfo { id: string; installed: boolean; version?: string; path?: string; }
interface Block { type: string; content: string; }
interface Msg { role: "user" | "agent"; blocks?: Block[]; content?: string; }
interface Profile { config: Record<string, any>; memory: string; skill: string; install_cmd: string; }

// ponytail: no logo assets exist for the host CLIs; use distinct icons + brand colors.
const AGENT_META: Record<string, { icon: typeof Bot; color: string }> = {
  claude: { icon: Bot, color: "text-orange-500" },
  codex: { icon: Cpu, color: "text-emerald-500" },
  opencode: { icon: Terminal, color: "text-sky-500" },
  hermes: { icon: Sparkles, color: "text-fuchsia-500" },
};
const AGENT_IDS = ["claude", "codex", "opencode", "hermes"];

export default function AgentWorkspace() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agent, setAgent] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [railOpen, setRailOpen] = useState(true);

  const refresh = async () => {
    try { const d: any = await authFetch("/api/agents"); setAgents(d.agents || []); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  // Load the selected agent's profile whenever it changes (or rail opens).
  useEffect(() => {
    if (!agent) { setProfile(null); return; }
    authFetch(`/api/agents/${agent}/profile`).then(setProfile).catch(() => setProfile(null));
  }, [agent, railOpen]);

  const active = agents.find((a) => a.id === agent);
  const ActiveIcon = AGENT_META[agent]?.icon ?? Bot;

  return (
    <div className="flex h-full bg-background">
      <Tabs defaultValue="chat" className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 h-12 shrink-0">
          <div className="flex items-center gap-2">
            <ActiveIcon className={cn("h-4 w-4", AGENT_META[agent]?.color)} />
            <span className="text-sm font-semibold">Agent Hub</span>
          </div>
          <div className="flex-1 flex justify-center">
            <TabsList>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="graph">Graph</TabsTrigger>
              <TabsTrigger value="manage">Manage</TabsTrigger>
            </TabsList>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setRailOpen((v) => !v)} title="Toggle info rail">
            {railOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>

        <TabsContent value="chat" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ChatTab agents={agents} agent={agent} onSelect={setAgent} />
        </TabsContent>
        <TabsContent value="graph" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <GraphTab agents={agents} />
        </TabsContent>
        <TabsContent value="manage" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <ManageTab agents={agents} agent={agent} onSelect={setAgent} onRefresh={refresh} />
        </TabsContent>
      </Tabs>

      {/* Collapsible right rail */}
      {railOpen && (
        <aside className="w-72 shrink-0 border-l border-border/50 flex flex-col min-h-0">
          <ProfileRail agent={agent} active={active} profile={profile} />
        </aside>
      )}
    </div>
  );
}

/* ------------------------------- Chat tab ------------------------------- */
function ChatTab({ agents, agent, onSelect }: {
  agents: AgentInfo[]; agent: string; onSelect: (id: string) => void;
}) {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const selectAgent = async (id: string) => {
    onSelect(id);
    setMessages([]);
    try {
      const r: any = await authFetch(`/api/agents/${id}/sessions`, { method: "POST" });
      setSessionId(r.session_id);
    } catch { setSessionId(""); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !agent || busy) return;
    if (text === "/new") { await selectAgent(agent); setInput(""); return; }
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    try {
      const r: any = await authFetch(`/api/agents/${agent}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId || undefined }),
      });
      if (r.session_id) setSessionId(r.session_id);
      setMessages((m) => [...m, { role: "agent", blocks: r.blocks || [] }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "agent", content: e?.message || "Agent call failed" }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Bot className="h-12 w-12 opacity-30 mb-3" />
            <p className="text-sm">Chat with {agent || "an agent"} — type a message or a /command</p>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary/10" : "bg-muted/40"}`}>
              {m.blocks
                ? m.blocks.map((b, j) => (
                    <pre key={j} className="whitespace-pre-wrap font-sans text-sm">{b.content}</pre>
                  ))
                : <div className="whitespace-pre-wrap">{m.content}</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {agent} is working…
          </div>
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        {/* Agent logo row — each logo starts a new session with that agent */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {AGENT_IDS.map((id) => {
            const meta = AGENT_META[id]!;
            const Icon = meta.icon;
            const installed = agents.find((a) => a.id === id)?.installed;
            return (
              <button key={id} onClick={() => selectAgent(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                  agent === id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
                )}
                title={`${id}${installed ? "" : " (not installed)"}`}>
                <Icon className={cn("h-4 w-4", meta.color)} />
                <span className="capitalize">{id}</span>
                {!installed && <span className="text-[.6rem] text-zinc-400">offline</span>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Message ${agent}… or /command`}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button onClick={send} disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Graph tab ------------------------------- */
function GraphTab({ agents }: { agents: AgentInfo[] }) {
  // ponytail: visual node board, no real scheduler/edge engine. Drag to arrange.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({
    claude: { x: 60, y: 40 }, codex: { x: 320, y: 40 },
    opencode: { x: 60, y: 200 }, hermes: { x: 320, y: 200 },
  });
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-hidden relative bg-muted/20">
        <svg width="100%" height="100%" viewBox="0 0 480 320" preserveAspectRatio="xMidYMid meet"
          onMouseMove={(e) => {
            if (!drag.current) return;
            const svg = e.currentTarget.getBoundingClientRect();
            const scale = svg.width / 480;
            const { id, dx, dy } = drag.current;
            const nx = dx + (e.clientX - svg.left) / scale;
            const ny = dy + (e.clientY - svg.top) / scale;
            setPos((p) => ({ ...p, [id]: { x: Math.max(0, Math.min(400, nx)), y: Math.max(0, Math.min(280, ny)) } }));
          }}
          onMouseUp={() => { drag.current = null; }}
          onMouseLeave={() => { drag.current = null; }}>
          {/* connection lines between the 4 nodes */}
          <line x1={pos.claude!.x + 80} y1={pos.claude!.y + 40} x2={pos.codex!.x + 80} y2={pos.codex!.y + 40} stroke="currentColor" className="text-muted-foreground/30" strokeWidth="1.5" />
          <line x1={pos.claude!.x + 80} y1={pos.claude!.y + 40} x2={pos.opencode!.x + 80} y2={pos.opencode!.y + 40} stroke="currentColor" className="text-muted-foreground/30" strokeWidth="1.5" />
          <line x1={pos.codex!.x + 80} y1={pos.codex!.y + 40} x2={pos.hermes!.x + 80} y2={pos.hermes!.y + 40} stroke="currentColor" className="text-muted-foreground/30" strokeWidth="1.5" />
          <line x1={pos.opencode!.x + 80} y1={pos.opencode!.y + 40} x2={pos.hermes!.x + 80} y2={pos.hermes!.y + 40} stroke="currentColor" className="text-muted-foreground/30" strokeWidth="1.5" />
          {AGENT_IDS.map((id) => {
            const meta = AGENT_META[id]!;
            const Icon = meta.icon;
            const installed = agents.find((a) => a.id === id)?.installed;
            return (
              <g key={id} onMouseDown={(e) => {
                e.preventDefault();
                drag.current = { id, dx: pos[id]!.x, dy: pos[id]!.y };
              }} className="cursor-grab">
                <rect x={pos[id]!.x} y={pos[id]!.y} width="160" height="80" rx="12"
                  fill="var(--background)" stroke={installed ? "var(--border)" : "var(--destructive)"} strokeWidth="1.5" />
                <g transform={`translate(${pos[id]!.x + 12}, ${pos[id]!.y + 12})`}>
                  <foreignObject width="136" height="56">
                    <div className="flex flex-col justify-center h-full">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", meta.color)} />
                        <span className="text-xs font-semibold capitalize">{id}</span>
                        {!installed && <Badge variant="outline" className="text-[.6rem] text-zinc-400">offline</Badge>}
                      </div>
                      <span className="text-[.65rem] text-muted-foreground truncate">
                        {installed ? "running" : "not installed"}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Schedule lane */}
      <div className="border-t border-border/50 p-3">
        <div className="text-xs font-semibold flex items-center gap-2 mb-2"><Workflow className="h-3.5 w-3.5" /> Schedule</div>
        <div className="space-y-1 text-xs text-muted-foreground">
          {AGENT_IDS.map((id) => (
            <div key={id} className="flex justify-between border rounded-md px-3 py-1.5">
              <span className="capitalize">{id}</span>
              <span>{agents.find((a) => a.id === id)?.installed ? "idle" : "needs install"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Manage tab ------------------------------- */
function ManageTab({ agents, agent, onSelect, onRefresh }: {
  agents: AgentInfo[]; agent: string; onSelect: (id: string) => void; onRefresh: () => void;
}) {
  const [copied, setCopied] = useState("");

  const copy = async (cmd: string) => {
    try { await navigator.clipboard.writeText(cmd); setCopied(cmd); setTimeout(() => setCopied(""), 1500); } catch {}
  };

  return (
    <div className="p-4 overflow-y-auto h-full grid grid-cols-1 sm:grid-cols-2 gap-3">
      {AGENT_IDS.map((id) => {
        const meta = AGENT_META[id]!;
        const Icon = meta.icon;
        const a = agents.find((x) => x.id === id);
        const installed = a?.installed;
        return (
          <Card key={id} className={cn("cursor-pointer", agent === id && "ring-1 ring-primary")} onClick={() => onSelect(id)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", meta.color)} />
                  <CardTitle className="text-sm capitalize">{id}</CardTitle>
                </div>
                <Badge variant={installed ? "secondary" : "outline"} className={installed ? "" : "text-zinc-400"}>
                  {installed ? (a.version || "installed") : "not installed"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {installed ? (
                <p className="text-[.7rem] text-muted-foreground truncate">{a.path || "on PATH"}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[.7rem] text-muted-foreground">Install this agent on the host to chat with it.</p>
                  <div className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                    <code className="flex-1 text-[.65rem] truncate">{AGENT_META[id] && getInstallCmd(id)}</code>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); copy(getInstallCmd(id)); }}>
                      {copied === getInstallCmd(id) ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
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

/* --------------------------- Profile right rail -------------------------- */
function ProfileRail({ agent, active, profile }: {
  agent: string; active: AgentInfo | undefined; profile: Profile | null;
}) {
  if (!agent) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex-1 flex items-center justify-center text-center">
        Select an agent to see its config, memory, and skills.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        {(() => { const I = AGENT_META[agent]?.icon ?? Bot; return <I className={cn("h-5 w-5", AGENT_META[agent]?.color)} />; })()}
        <div>
          <div className="text-sm font-semibold capitalize">{agent}</div>
          <div className="text-[.65rem] text-muted-foreground">
            {active?.installed ? (active.version || "installed") : "not installed"}
          </div>
        </div>
      </div>

      {!profile ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> loading…</div>
      ) : (
        <>
          <Section title="Config">
            {Object.entries(profile.config).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono truncate">{Array.isArray(v) ? v.join(" ") : String(v)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">install</span>
              <span className="font-mono text-[.65rem] truncate">{profile.install_cmd}</span>
            </div>
          </Section>
          <Section title="memory.md"><pre className="whitespace-pre-wrap font-sans text-xs">{profile.memory || "— empty —"}</pre></Section>
          <Section title="skill.md"><pre className="whitespace-pre-wrap font-sans text-xs">{profile.skill || "— empty —"}</pre></Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5">{title}</div>
      <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}
