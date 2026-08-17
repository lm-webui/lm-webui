/* Agent command/mention input — a shared popover command menu for the Agent Hub.
 *
 * `/` opens the selected agent's REAL CLI commands (fetched from the backend, parsed from the
 * installed CLI's `--help`); `@` opens installed agents. Arrow keys / Tab / Shift+Tab move the
 * highlight, Enter selects, Escape closes. Selecting a `/` command inserts its literal text into
 * the input (tab-completion feel) — no UI-wrapper actions (new/clear/compact/model/skill) here.
 */
import { useEffect, useState } from "react";
import { Bot, CornerDownLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getAgentCommands } from "@/utils/api";
import { AGENT_META, type AgentInfo, type AgentIcon } from "./agentProviders";

interface MenuItem {
  id: string;
  label: string;
  hint?: string | undefined;
  icon?: AgentIcon | typeof Bot;
  color?: string | undefined;
  kind: "command" | "agent";
}

interface Props {
  agent: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  agents: AgentInfo[];
  onPickAgent: (id: string) => void;
  onCommand: (id: string, value?: string) => void; // kept for call-site compatibility; unused now
  onSubmit?: () => void;
}

export function AgentCommandMenu({
  agent, value, onChange, placeholder, disabled, agents, onPickAgent, onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [commands, setCommands] = useState<{ id: string; label: string; hint?: string }[]>([]);

  // Fetch the real CLI command surface for the selected agent (parsed from `--help`).
  useEffect(() => {
    if (!agent) { setCommands([]); return; }
    let alive = true;
    getAgentCommands(agent)
      .then((d) => { if (alive) setCommands(d.commands || []); })
      .catch(() => { if (alive) setCommands([]); });
    return () => { alive = false; };
  }, [agent]);

  // Active trigger (/ or @) + the token being typed after it.
  const m = value.match(/(^|\s)([/@])(.*)$/);
  const triggerChar = m?.[2] ?? null;
  const token = (m?.[3] ?? "").trim();

  const items: MenuItem[] = triggerChar === "/"
    ? commands.filter((c) => c.label.toLowerCase().includes(token.toLowerCase()) || c.id.toLowerCase().includes(token.toLowerCase()))
        .map((c) => ({ id: c.id, label: c.label, hint: c.hint, kind: "command" as const }))
    : triggerChar === "@"
      ? agents.filter((a) => a.id.toLowerCase().includes(token.toLowerCase()))
          .map((a) => ({ id: a.id, label: AGENT_META[a.id]?.label ?? a.id, icon: AGENT_META[a.id]?.icon ?? Bot,
            color: AGENT_META[a.id]?.color, hint: a.installed ? "installed" : "not installed",
            kind: "agent" as const }))
      : [];

  const active = triggerChar !== null && items.length > 0;

  useEffect(() => { setHighlight(0); }, [value, agent]);
  useEffect(() => { if (!triggerChar) setOpen(false); }, [triggerChar]);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  useEffect(() => { if (!active) setOpen(false); }, [active]);

  const commit = (item: MenuItem) => {
    setOpen(false);
    if (item.kind === "agent") {
      onChange(value.replace(/\s*@\S*$/, "").replace(/\s+$/, "") + " ");
      onPickAgent(item.id);
      return;
    }
    // Real CLI command: insert its literal text (tab-completion feel), then close.
    const base = value.replace(/\s*[/@]\S*$/, "");
    onChange((base ? base + " " : "") + item.label + " ");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (active) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + items.length) % items.length); return; }
      if (e.key === "Tab") {
        // Tab/Shift+Tab cycle the highlight like a CLI menu.
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        setHighlight((h) => (h + dir + items.length) % items.length);
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); commit(items[highlight]!); return; }
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div className="flex-1 relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </PopoverAnchor>
        <PopoverContent align="start" side="top" sideOffset={6} className="w-80 max-h-72 overflow-y-auto p-1">
          <div className="space-y-0.5">
            {items.map((item, i) => {
              const Icon = item.icon ?? Bot;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => commit(item)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                    i === highlight ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", item.color)} />
                  <span className="font-medium truncate">{item.label}</span>
                  {item.hint && (
                    <span className="ml-auto text-[.65rem] text-muted-foreground truncate max-w-[40%]">{item.hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {triggerChar && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[.6rem] text-muted-foreground">
          <CornerDownLeft className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}
