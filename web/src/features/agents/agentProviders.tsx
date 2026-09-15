/* Agent identity + status, shared by the rail, the Hub tabs and the telemetry panel.
 *
 * Everything else that used to live here — slash-command lists, model lists, provider configs —
 * was only read by AgentCommandMenu, which nothing rendered. Hand-maintained mirrors of each
 * CLI's command set drift silently; the backend registry is the real source for what we run.
 */
import { ComponentType } from "react";
import { AlertTriangle, CheckCircle, Terminal, XCircle } from "lucide-react";
import { SiClaudecode, SiOpencode } from "react-icons/si";
import { Badge } from "@/components/ui/badge";

export interface AgentInfo {
  id: string;
  installed: boolean;
  version?: string;
  path?: string;
  status?: "ok" | "degraded" | "missing";
}

// `id` is the backend/CLI key and must stay as-is; `label` is what the UI shows.
export type AgentIcon = ComponentType<{ className?: string }>;
export const AGENT_META: Record<string, { label: string; icon: AgentIcon; color: string }> = {
  claude:   { label: "Claude Code", icon: SiClaudecode, color: "text-orange-500" },
  codex:    { label: "Codex", icon: Terminal, color: "text-sky-500" },
  opencode: { label: "OpenCode", icon: SiOpencode, color: "text-gray-400" },
  hermes:   { label: "Hermes", icon: HermesIcon, color: "text-amber-400" },
};
export const AGENT_IDS = ["claude", "codex", "opencode", "hermes"];

// ponytail: hermes has no simple brand glyph; render its initial as a styled letter.
function HermesIcon({ className }: { className?: string }) {
  return <span className={className}>H</span>;
}

/** Install state pill, styled to match the Runtime Manager's status badges (RuntimeTab.tsx). */
export function HealthBadge({ status, installed }: { status?: string | undefined; installed: boolean }) {
  if (status === "ok" || (installed && !status)) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Installed</Badge>;
  }
  if (status === "degraded") {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
  }
  return <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"><XCircle className="h-3 w-3 mr-1" />Not installed</Badge>;
}
