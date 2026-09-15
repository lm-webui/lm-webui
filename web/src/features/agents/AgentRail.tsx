/* The Agent Hub's agent menu — one icon per agent, in a narrow left column.
 *
 * This is the single place an agent gets selected. It replaced the chip rows that used to sit
 * above the terminal and activity inputs, plus the Manage tab's card grid, so all three tabs
 * share one selection.
 *
 * The hub is desktop-oriented (the terminal needs the width), so the rail is hidden below `sm`
 * and the Hub falls back to the chip selector there.
 */
import { Bot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AGENT_IDS, AGENT_META, type AgentInfo } from "./agentProviders";

interface Props {
  agents: AgentInfo[];
  agent: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function AgentRail({ agents, agent, onSelect, className }: Props) {
  return (
    <nav
      aria-label="Agents"
      className={cn(
        "flex h-full w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border/50 py-3",
        className,
      )}
    >
      {AGENT_IDS.map((id) => {
        const meta = AGENT_META[id] ?? { label: id, icon: Bot, color: "" };
        const Icon = meta.icon;
        const installed = agents.find((a) => a.id === id)?.installed ?? false;
        const active = agent === id;
        const label = installed ? meta.label : `${meta.label} (not installed)`;

        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(id)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-primary/10 ring-2 ring-primary"
                    : "hover:bg-muted/60",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-opacity",
                    meta.color,
                    // Dimmed when the CLI is not on the host — there is nothing to talk to yet.
                    installed ? "opacity-100" : "opacity-40 grayscale",
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
