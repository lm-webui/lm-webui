import { useState } from "react";
import { PanelLeftOpen, Settings as SettingsIcon, Server } from "lucide-react";
import { Button } from "./ui/button";
import { Settings } from "./settings/Settings";
import RuntimeManager from "./models/RuntimeManager";
import { HardwareStatus } from "./orchestrator/HardwareStatus";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  createNewChat: () => void;
  sidebarCollapsed: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectedLLM: string;
  onLLMChange: (llm: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  availableModels: string[];
  selectedSearchEngine?: string;
  onSearchEngineChange?: (value: string) => void;
}

export default function Header({
  createNewChat,
  sidebarCollapsed,
  setSidebarOpen,
  selectedLLM,
  onLLMChange,
  selectedModel,
  onModelChange,
  availableModels,
  selectedSearchEngine,
  onSearchEngineChange,
}: HeaderProps) {
  const [isRuntimeManagerOpen, setIsRuntimeManagerOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 px-4 py-[23px] md:py-[23px] flex h-14 shrink-0 items-center justify-between border-b border-stone-400/50 bg-neutral-300/50 backdrop-blur-sm dark:border-zinc-800 dark:bg-neutral-900/25">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:block">
          <HardwareStatus />
        </div>

        {user?.role === "admin" && <Button
          variant="link"
          size="sm"
          onClick={() => setIsRuntimeManagerOpen(true)}
          className="hidden sm:flex gap-2 py-5 px-3 rounded-full border-zinc-200 dark:border-zinc-800"
          title="Runtime Manager"
        >
          <Server className="h-5 w-5" />
        </Button>}
        {user?.role === "admin" && <RuntimeManager
          open={isRuntimeManagerOpen}
          onOpenChange={setIsRuntimeManagerOpen}
          onModelLoad={onModelChange}
        />}
        <Settings
          selectedLLM={selectedLLM}
          onLLMChange={onLLMChange}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          selectedSearchEngine={selectedSearchEngine ?? "duckduckgo"}
          onSearchEngineChange={onSearchEngineChange ?? (() => {})}
          trigger={
            <Button
              variant="link"
              size="sm"
              className="flex gap-2 py-5 px-3 rounded-full border-zinc-200 dark:border-zinc-800"
            >
              <SettingsIcon className="h-5 w-5" />
            </Button>
          }
        />
      </div>
    </header>
  );
}
