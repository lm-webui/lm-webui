/* Per-provider agent CLI config (command set, models, skills, interactivity).
 * The shared command menu + chat UI read this instead of hardcoding one agent.
 */
import { ComponentType } from "react";
import { Bot, Cpu, Terminal, RefreshCw, Trash2, Layers, Wand2 } from "lucide-react";
import { SiClaudecode, SiOpencode } from "react-icons/si";

export interface AgentInfo { id: string; installed: boolean; version?: string; path?: string; }
export interface Skill { id: string; label: string; instructions: string; }
export interface CommandDef { id: string; label: string; hint?: string; icon: typeof Bot; value?: boolean; }

// `id` is the backend/CLI key and must stay as-is; `label` is what the UI shows.
export type AgentIcon = ComponentType<{ className?: string }>;
export const AGENT_META: Record<string, { label: string; icon: AgentIcon; color: string }> = {
  claude:   { label: "Claude Code", icon: SiClaudecode, color: "text-orange-500" },
  codex:    { label: "Codex", icon: Terminal, color: "text-sky-500" },
  opencode: { label: "OpenCode", icon: SiOpencode, color: "text-gray-400" },
  hermes:   { label: "Hermes", icon: HermesIcon, color: "text-amber-400" },
};

// ponytail: hermes has no simple brand glyph; render its initial as a styled letter.
function HermesIcon({ className }: { className?: string }) {
  return <span className={className}>H</span>;
}
export const AGENT_IDS = ["claude", "codex", "opencode", "hermes"];

export interface AgentProviderConfig {
  interactive: boolean;
  commands: CommandDef[];
  models?: string[];
  skills?: Skill[];
}

const SESSION_CMDS: CommandDef[] = [
  { id: "new", label: "New session", hint: "Reset this agent's context", icon: RefreshCw },
  { id: "clear", label: "Clear chat", hint: "Reset this agent's context", icon: Trash2 },
  { id: "compact", label: "Compact context", hint: "Summarize and reset", icon: Layers },
];

const SKILLS: Skill[] = [
  { id: "ponytail", label: "Ponytail (lazy code)", instructions: "You are a lazy senior developer. Prefer the shortest working solution; reuse existing code and the standard library; no speculative abstractions." },
];

// claude is the only bidirectional (stream-json) provider today; others are one-shot.
export const AGENT_PROVIDERS: Record<string, AgentProviderConfig> = {
  claude: {
    interactive: true,
    commands: [
      ...SESSION_CMDS,
      { id: "model", label: "Switch model", hint: "Choose a model", icon: Cpu, value: true },
      { id: "skill", label: "Apply skill", hint: "e.g. ponytail", icon: Wand2, value: true },
    ],
    models: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5", "claude-fable-5"],
    skills: SKILLS,
  },
  codex: { interactive: false, commands: SESSION_CMDS },
  opencode: { interactive: false, commands: SESSION_CMDS },
  hermes: { interactive: false, commands: SESSION_CMDS },
};

export function providerFor(agent: string): AgentProviderConfig {
  return AGENT_PROVIDERS[agent] ?? { interactive: false, commands: SESSION_CMDS };
}
