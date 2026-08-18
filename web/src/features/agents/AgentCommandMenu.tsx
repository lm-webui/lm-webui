/* Agent command/mention input — a shared popover command menu for the Agent Hub.
 *
 * `/` lists the selected agent's interactive slash commands (`AGENT_SLASH_COMMANDS`); `@` lists
 * installed agents. Arrow keys / Tab / Shift+Tab move the highlight, Enter selects, Escape closes.
 * Selecting a command fires `onCommand(id)` — ChatTab runs the ones it can (clear/compact/new/model)
 * and inserts the rest as literal text. `/model` opens a second-level model picker.
 */
import { useEffect, useState } from "react";
import { Bot, CornerDownLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getAgentCommands } from "@/utils/api";
import { AGENT_META, AGENT_SLASH_COMMANDS, AGENT_MODELS, type AgentInfo, type AgentIcon, type SlashCommand } from "./agentProviders";

interface MenuItem {
  id: string;
  label: string;
  hint?: string | undefined;
  icon?: AgentIcon | typeof Bot;
  color?: string | undefined;
  value?: boolean;
  kind: "command" | "agent" | "value";
}

interface Props {
  agent: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  agents: AgentInfo[];
  onPickAgent: (id: string) => void;
  onCommand: (id: string, value?: string) => void;
  onSubmit?: () => void;
}

export function AgentCommandMenu({
  agent, value, onChange, placeholder, disabled, agents, onPickAgent, onCommand, onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [sub, setSub] = useState<string | null>(null); // active value command ("model")
  const [skills, setSkills] = useState<SlashCommand[]>([]);
  const builtins = AGENT_SLASH_COMMANDS[agent] ?? [];
  const models = AGENT_MODELS[agent] ?? [];

  // Installed Claude skills/plugins surface as slash commands (backend-discovered), so the "/"
  // list reflects whatever the CLI has — no per-skill UI code.
  useEffect(() => {
    if (!agent) { setSkills([]); return; }
    let alive = true;
    getAgentCommands(agent)
      .then((d) => { if (alive) setSkills(d.skills || []); })
      .catch(() => { if (alive) setSkills([]); });
    return () => { alive = false; };
  }, [agent]);
  // Built-ins first, then installed skills, deduped by id.
  const commands: SlashCommand[] = (() => {
    const seen = new Set(builtins.map((c) => c.id));
    return [...builtins, ...skills.filter((s) => !seen.has(s.id))];
  })();

  // Active trigger (/ or @) + the token being typed after it.
  const m = value.match(/(^|\s)([/@])(.*)$/);
  const triggerChar = m?.[2] ?? null;
  const token = (m?.[3] ?? "").trim();
  const valueQuery = token.replace(/^\S+\s*/, ""); // strip the leading command word for sub-lists

  const items: MenuItem[] = sub === "model"
    ? models.filter((x) => x.toLowerCase().includes(valueQuery.toLowerCase()))
        .map((x) => ({ id: x, label: x, kind: "value" as const }))
    : triggerChar === "/"
      ? commands.filter((c) => c.label.toLowerCase().includes(token.toLowerCase()) || c.id.toLowerCase().includes(token.toLowerCase()))
          .map((c) => ({ id: c.id, label: c.label, hint: c.hint, value: c.id === "model", kind: "command" as const }))
      : triggerChar === "@"
        ? agents.filter((a) => a.id.toLowerCase().includes(token.toLowerCase()))
            .map((a) => ({ id: a.id, label: AGENT_META[a.id]?.label ?? a.id, icon: AGENT_META[a.id]?.icon ?? Bot,
              color: AGENT_META[a.id]?.color, hint: a.installed ? "installed" : "not installed",
              kind: "agent" as const }))
        : [];

  const active = (triggerChar !== null || sub !== null) && items.length > 0;

  useEffect(() => { setHighlight(0); }, [value, sub, agent]);
  useEffect(() => { if (!triggerChar) { setSub(null); setOpen(false); } }, [triggerChar]);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  useEffect(() => { if (!active) setOpen(false); }, [active]);

  const commit = (item: MenuItem) => {
    if (item.kind === "agent") {
      setOpen(false);
      onChange(value.replace(/\s*@\S*$/, "").replace(/\s+$/, "") + " ");
      onPickAgent(item.id);
      return;
    }
    if (item.kind === "value") {
      setOpen(false);
      onChange("");
      onCommand(sub!, item.id);
      setSub(null);
      return;
    }
    // slash command
    if (item.value) {
      setSub(item.id); // open the value picker, keep the popover open
      onChange(`/${item.id} `);
      return;
    }
    setOpen(false);
    onCommand(item.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (active) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + items.length) % items.length); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        setHighlight((h) => (h + dir + items.length) % items.length);
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); commit(items[highlight]!); return; }
      if (e.key === "Escape") { e.preventDefault(); setSub(null); setOpen(false); return; }
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
          {sub === "model" && (
            <div className="px-2 pt-1 pb-1 text-[.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Choose model
            </div>
          )}
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
