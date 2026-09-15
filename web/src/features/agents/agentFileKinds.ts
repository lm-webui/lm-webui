/* The three files the backend resolves for every agent (app/agents/agent_files.py):
 * the CLI's real config in the home dir, plus two app-managed markdown files.
 *
 * The config's format differs per agent, so it is read off the path extension rather than
 * hardcoded: claude → settings.json, codex → config.toml, opencode → opencode.jsonc,
 * hermes → config.json.
 */

export type ConfigFormat = "json" | "jsonc" | "toml" | "text";

export interface AgentFileKind {
  /** Key the backend `save()` expects. */
  name: string;
  label: string;
  description: string;
}

/** A row from `GET /api/agents/{agent}/files`, enriched with the registry description + format. */
export interface AgentFile extends AgentFileKind {
  path: string;
  kind: "config" | "app";
  content: string;
  format: ConfigFormat;
  /** False when the file does not exist yet — reading never creates it. */
  exists: boolean;
}

/** Enrich the backend payload with the registry description and the config's format. */
export function toAgentFile(raw: {
  name: string;
  path: string;
  /** Backend sends a plain string; anything but "app" is treated as the CLI's config. */
  kind: string;
  content: string;
  label?: string;
  exists?: boolean;
}): AgentFile {
  const kind = fileKind(raw.name);
  return {
    ...kind,
    name: raw.name,
    path: raw.path,
    kind: raw.kind === "app" ? "app" : "config",
    content: raw.content ?? "",
    format: configFormat(raw.path),
    exists: raw.exists ?? true,
  };
}

export const AGENT_FILE_KINDS: AgentFileKind[] = [
  {
    name: "config",
    label: "Config",
    description: "This CLI's real config file in your home directory. A backup is written before each save.",
  },
  {
    name: "skill.md",
    label: "Skill",
    description: "App-managed instructions for this agent. Stored by lm-webui, not by the CLI — other agents are given this path to read.",
  },
  {
    name: "memory.md",
    label: "Memory",
    description: "App-managed notes for this agent. Stored by lm-webui, not by the CLI — other agents are given this path to read.",
  },
];

/** Unknown names fall back to a generic row so a new backend file still renders. */
export function fileKind(name: string): AgentFileKind {
  return AGENT_FILE_KINDS.find((k) => k.name === name) ?? {
    name,
    label: name,
    description: "",
  };
}

export function configFormat(path: string): ConfigFormat {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".jsonc") return "jsonc";
  if (ext === ".toml") return "toml";
  return "text";
}

/** Cap on a single file write, mirroring the backend's MAX_FILE_BYTES. */
export const MAX_FILE_BYTES = 256_000;

export function byteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

/** True when `draft` differs from what is on disk. */
export function isDirty(draft: string, saved: string): boolean {
  return draft !== saved;
}

/* Returns a parse error message, or null when the content is valid JSON.
 * Only `.json` configs are checked — `.jsonc` allows comments and `.toml` needs a parser we do
 * not ship, so those are written unchecked. Blocking for `.json`: the backend rejects malformed
 * JSON with a 400, so allowing the save would only produce a failed round-trip. */
export function jsonError(content: string): string | null {
  if (!content.trim()) return null;
  try {
    JSON.parse(content);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid JSON";
  }
}
