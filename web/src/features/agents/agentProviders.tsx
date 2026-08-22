/* Per-provider agent CLI config (command set, models, skills, interactivity).
 * The shared command menu + chat UI read this instead of hardcoding one agent.
 */
import { ComponentType } from "react";
import { Bot, Cpu, Terminal, RefreshCw, Trash2, Layers, Wand2 } from "lucide-react";
import { SiClaudecode, SiOpencode } from "react-icons/si";

export interface AgentInfo { id: string; installed: boolean; version?: string; path?: string; status?: "ok" | "degraded" | "missing"; }
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

// Interactive slash commands each CLI's TUI lists under "/". There's no machine-readable source,
// so this mirrors the CLI's own slash command set (honest to the TUI; selected commands are
// inserted as literal text since the app runs the CLI headless).
export interface SlashCommand { id: string; label: string; hint?: string; }
export const AGENT_SLASH_COMMANDS: Record<string, SlashCommand[]> = {
  claude: [
    { id: "model", label: "/model", hint: "Switch model" },
    { id: "clear", label: "/clear", hint: "Clear conversation" },
    { id: "compact", label: "/compact", hint: "Compact context" },
    { id: "config", label: "/config", hint: "Open config" },
    { id: "cost", label: "/cost", hint: "Show cost" },
    { id: "status", label: "/status", hint: "Session status" },
    { id: "memory", label: "/memory", hint: "Edit memory" },
    { id: "mcp", label: "/mcp", hint: "Manage MCP" },
    { id: "permissions", label: "/permissions", hint: "Manage permissions" },
    { id: "review", label: "/review", hint: "Review changes" },
    { id: "resume", label: "/resume", hint: "Resume a session" },
    { id: "agents", label: "/agents", hint: "Manage agents" },
    { id: "help", label: "/help", hint: "Show help" },
  ],
  codex: [
    { id: "clear", label: "/clear", hint: "Clear conversation" },
    { id: "compact", label: "/compact", hint: "Compact context" },
    { id: "model", label: "/model", hint: "Switch model" },
    { id: "fork", label: "/fork", hint: "Fork the session" },
    { id: "resume", label: "/resume", hint: "Resume a session" },
    { id: "status", label: "/status", hint: "Session status" },
    { id: "cost", label: "/cost", hint: "Show cost" },
    { id: "doctor", label: "/doctor", hint: "Diagnose setup" },
    { id: "help", label: "/help", hint: "Show help" },
  ],
  opencode: [
    { id: "agents", label: "/agents", hint: "Manage agents" },
    { id: "clear", label: "/clear", hint: "Clear conversation" },
    { id: "composer", label: "/composer", hint: "Open composer" },
    { id: "config", label: "/config", hint: "Open config" },
    { id: "cost", label: "/cost", hint: "Show cost" },
    { id: "history", label: "/history", hint: "Session history" },
    { id: "mcp", label: "/mcp", hint: "Manage MCP" },
    { id: "models", label: "/models", hint: "Switch model" },
    { id: "help", label: "/help", hint: "Show help" },
  ],
  hermes: [
    { id: "clear", label: "/clear", hint: "Clear conversation" },
    { id: "model", label: "/model", hint: "Switch model" },
    { id: "status", label: "/status", hint: "Session status" },
    { id: "system", label: "/system", hint: "Show system prompt" },
    { id: "help", label: "/help", hint: "Show help" },
  ],
};

// Model choices offered by `/model` (mirrors each CLI's default model set).
export const AGENT_MODELS: Record<string, string[]> = {
  claude: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5"],
  codex: ["gpt-5-codex", "gpt-5-mini-codex"],
  opencode: ["default"],
  hermes: ["default"],
};

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
