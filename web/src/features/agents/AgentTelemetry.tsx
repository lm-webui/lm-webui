/* Agent telemetry — live usage panel for the selected agent (right rail).
 * Shows token usage, run count, cost, and a context-window fill bar. Polls /usage.
 */
import { useEffect, useState } from "react";
import { Activity, Clock, Coins, MessageSquareText, Gauge, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getAgentUsage } from "@/utils/api";
import { AGENT_META } from "./agentProviders";
import type { AgentInfo } from "./agentProviders";

interface Usage {
  run_count: number; last_run_at?: string;
  total_input_tokens: number; total_output_tokens: number; total_cost_usd: number;
  context_window?: number;
  session_count?: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function fmtUsd(n: number): string {
  return n > 0 ? `$${n.toFixed(4)}` : "—";
}

// Health status badge, matching the Runtime Manager's status styling (RuntimeTab.tsx).
function HealthBadge({ status, installed }: { status?: string | undefined; installed: boolean }) {
  if (status === "ok" || (installed && !status)) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Installed</Badge>;
  }
  if (status === "degraded") {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
  }
  return <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"><XCircle className="h-3 w-3 mr-1" />Not installed</Badge>;
}

export default function AgentTelemetry({ agent, active }: { agent: string; active?: AgentInfo | undefined }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!agent) { setUsage(null); return; }
    let alive = true;
    const load = () => getAgentUsage(agent).then((d) => { if (alive) setUsage(d); }).catch(() => {});
    load();
    const id = setInterval(load, 15000); // poll while the rail is open
    return () => { alive = false; clearInterval(id); };
  }, [agent]);

  const Icon = AGENT_META[agent]?.icon ?? Activity;
  const cw = usage?.context_window;
  const used = usage?.total_input_tokens ?? 0;
  const fillPct = cw ? Math.min(100, (used / cw) * 100) : 0;

  const rows = [
    { icon: MessageSquareText, label: "Runs", value: String(usage?.run_count ?? 0) },
    { icon: Coins, label: "Tokens in", value: fmt(usage?.total_input_tokens ?? 0) },
    { icon: Coins, label: "Tokens out", value: fmt(usage?.total_output_tokens ?? 0) },
    { icon: Activity, label: "Cost", value: fmtUsd(usage?.total_cost_usd ?? 0) },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-5 w-5", AGENT_META[agent]?.color)} />
        <div>
          <div className="text-sm font-semibold">{AGENT_META[agent]?.label ?? agent}</div>
          <div className="text-[.65rem] text-muted-foreground">
            {active?.version ? `v${active.version}` : (active?.installed ? "installed" : "not installed")}
          </div>
        </div>
      </div>

      <HealthBadge status={active?.status} installed={!!active?.installed} />

      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-muted/40 p-2">
            <div className="flex items-center gap-1 text-[.6rem] text-muted-foreground">
              <r.icon className="h-3 w-3" /> {r.label}
            </div>
            <div className="text-sm font-medium">{r.value}</div>
          </div>
        ))}
      </div>

      {cw ? (
        <div>
          <div className="flex items-center justify-between text-[.65rem] text-muted-foreground mb-1">
            <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> Context</span>
            <span className="font-mono">{fmt(used)} / {fmt(cw)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all",
                fillPct > 85 ? "bg-red-500" : fillPct > 60 ? "bg-amber-500" : "bg-emerald-500")}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[.65rem] text-muted-foreground">
          <Clock className="h-3 w-3" /> No run data yet.
        </div>
      )}

      {(usage?.session_count ?? 0) > 0 && (
        <div>
          <div className="text-[.65rem] text-muted-foreground">
            {usage?.session_count} session{usage?.session_count === 1 ? "" : "s"} · full list in the sidebar
          </div>
        </div>
      )}
    </div>
  );
}
