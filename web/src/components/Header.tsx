import { Settings as SettingsIcon, Server, MessageSquarePlus, MoreVertical } from "lucide-react";
import { VscChatSparkle } from "react-icons/vsc";
import { HiOutlineMenuAlt4 } from "react-icons/hi";
import { Button } from "./ui/button";
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
  onViewChange?: (view: string) => void;
}

export default function Header({
  createNewChat,
  setSidebarOpen,
  onViewChange,
}: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 px-3 py-[19px] md:py-[20px] flex h-12 shrink-0 items-center justify-between border-b border-stone-400/50 bg-neutral-300/50 backdrop-blur-sm dark:border-zinc-700/50 dark:bg-neutral-900/50">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        >
          <HiOutlineMenuAlt4 className="h-5 w-5" />
        </Button>
        <img
          src="/text41.png"
          alt="LM-WebUI"
          className="h-3 w-auto object-contain md:hidden"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={createNewChat}
          className="md:hidden"
          title="New chat"
        >
          <VscChatSparkle className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewChange?.("settings")}
          className="md:hidden"
          title="Settings"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
        <div className="hidden sm:block">
          <HardwareStatus />
        </div>

        {user?.role === "admin" && <Button
          variant="link"
          size="sm"
          onClick={() => onViewChange?.("runtime")}
          className="hidden sm:flex gap-2 py-5 px-3 rounded-full border-zinc-200 dark:border-zinc-800"
          title="Runtime Manager"
        >
          <Server className="h-5 w-5" />
        </Button>}
        <Button
          variant="link"
          size="sm"
          onClick={() => onViewChange?.("settings")}
          className="hidden sm:flex gap-2 py-5 px-3 rounded-full border-zinc-200 dark:border-zinc-800"
          title="Settings"
        >
          <SettingsIcon className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
