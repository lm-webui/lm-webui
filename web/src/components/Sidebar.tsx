import React, { useState, useRef, useEffect } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  SearchIcon,
  Plus,
  Edit2,
  X,
  Trash2,
  Check,
  LayoutGrid,
  Briefcase,
  Palette,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Server,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authFetch } from "@/utils/api";
import { ChatConversation } from "@/types/chat-ui";
import { Button } from "./ui/button";
import { ProfilePopover } from "./ui/profile-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { useChatStore, useIsLoadingMessages } from "@/store/chatStore";
import { useShallow } from 'zustand/react/shallow';
import { mapToConversation } from "@/utils/chatUtils";
import { selectConversations } from "@/store/chatStore";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  createNewChat: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  onViewChange?: (view: string) => void;
}

// Conversation item component with edit and delete functionality
function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onClose,
  onEditTitle,
  onDelete,
  isLoadingMessages,
  projects,
  onAssignProject,
  onCreateProject,
  projectName,
}: {
  conversation: ChatConversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  isLoadingMessages?: Record<string, boolean>;
  projects?: any[];
  onAssignProject?: (conversationId: string, projectId: string) => void;
  onCreateProject?: (conversationId: string, name: string) => void;
  projectName?: string;
  onClose?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== conversation.title) {
      onEditTitle(conversation.id, trimmedTitle);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(conversation.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (window.innerWidth < 768) onClose?.(); onSelect(conversation.id); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(conversation.id);
        }}
        className={cn(
          "w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors flex items-center justify-between cursor-pointer",
          isSelected
            ? "bg-zinc-100 dark:bg-zinc-800 font-medium"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
        )}
      >
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="h-6 text-sm px-1 py-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={cn(
              "truncate flex-1",
              conversation.isTitleGenerating &&
                "text-zinc-400 italic animate-pulse",
            )}
          >
            {conversation.isTitleGenerating
              ? "Generating title..."
              : conversation.title}
            {projectName && (
              <span className="text-[10px] text-muted-foreground ml-1">· {projectName}</span>
            )}
          </span>
        )}

        {!isEditing && !conversation.isTitleGenerating && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}>
                {isLoadingMessages?.[conversation.id] ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : (
                  <MoreHorizontal className="h-3 w-3" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl min-w-[180px]" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit2 className="h-3.5 w-3.5 mr-2" /> Rename
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  <FolderKanban className="h-3.5 w-3.5 mr-2" /> Add to Project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="rounded-xl">
                  {projects?.map((p: any) => (
                    <DropdownMenuItem key={p.id} onClick={() => onAssignProject?.(conversation.id, p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    const name = prompt("Project name:");
                    if (name) onCreateProject?.(conversation.id, name);
                  }}>
                    <Plus className="h-3.5 w-3.5 mr-2" /> New Project
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(conversation.id)} className="text-red-500">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isEditing && (
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 hover:bg-green-100 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400"
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  open,
  onClose,
  selectedId,
  onSelect,
  createNewChat,
  sidebarCollapsed,
  setSidebarCollapsed,
  onViewChange,
}: SidebarProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const isLoadingMessages = useIsLoadingMessages();

  // Fetch projects for "Add to Project" menu + project name badges
  useEffect(() => {
    authFetch("/api/projects").then((d: any) => setProjects(d.projects || [])).catch(() => {});
  }, []);
  const projectNames: Record<string, string> = {};
  projects.forEach((p: any) => { projectNames[p.id] = p.name; });
  const rawConversations = useChatStore(useShallow(selectConversations));
  const rawConvsLength = Object.keys(rawConversations).length;
  const conversations = Object.values(rawConversations).map(mapToConversation);
  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered
    .filter((c) => !c.pinned)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 20);
  const updateConversationTitle = useChatStore(
    (state) => state.updateConversationTitle,
  );
  const deleteConversation = useChatStore((state) => state.deleteConversation);

  const handleEditTitle = (chatId: string, title: string) => {
    updateConversationTitle(chatId, title);
    toast.success("Conversation title updated");
  };

  const handleDeleteConversation = (chatId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this conversation? This action cannot be undone.",
      )
    ) {
      deleteConversation(chatId);
      toast.success("Conversation deleted");

      // If we deleted the selected conversation, select another one
      if (selectedId === chatId) {
        const remaining = conversations.filter((c) => c.id !== chatId);
        if (remaining.length > 0 && remaining[0]) {
          onSelect(remaining[0].id);
        }
      }
    }
  };

  const handleAssignProject = async (conversationId: string, projectId: string) => {
    try {
      const res = await authFetch(`/api/history/conversation/${conversationId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { project_id: projectId } }),
      });
      if (res && !res.error) toast.success("Conversation added to project");
      else toast.error("Failed to add to project");
    } catch { toast.error("Failed to add to project"); }
  };

  const handleCreateProject = async (conversationId: string, name: string) => {
    try {
      const data = await authFetch("/api/projects", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, system_prompt: "You are a helpful assistant." }),
      });
      if (data && !data.error) {
        setProjects(prev => [...prev, { id: data.id, name, system_prompt: data.system_prompt, conversation_count: 0 }]);
        await handleAssignProject(conversationId, data.id);
        toast.success("Project created and conversation assigned");
      } else toast.error("Failed to create project");
    } catch { toast.error("Failed to create project"); }
  };

  if (sidebarCollapsed) {
    return (
      <aside className="z-50 flex h-full w-16 shrink-0 flex-col border-r border-zinc-300/60 bg-neutral-300 transition-[width] duration-200 dark:border-zinc-800 dark:bg-neutral-900">
        <div className="flex items-center px-3 py-[7.5px] justify-center border-b border-stone-400/50 dark:border-zinc-800">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center gap-2 pt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { if (window.innerWidth < 768) onClose?.(); createNewChat(); }}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Gallery"
            onClick={() => onViewChange?.("gallery")}
          >
            <LayoutGrid className="h-5 w-5 text-zinc-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Studio"
            onClick={() => onViewChange?.("workspace")}
          >
            <Palette className="h-5 w-5 text-zinc-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Projects"
            onClick={() => onViewChange?.("projects")}
          >
            <FolderKanban className="h-5 w-5 text-zinc-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Runtime"
            onClick={() => onViewChange?.("runtime")}
          >
            <Server className="h-5 w-5 text-zinc-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Settings"
            onClick={() => onViewChange?.("settings")}
          >
            <SettingsIcon className="h-5 w-5 text-zinc-500" />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 opacity-50 transition-opacity duration-200 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "z-50 flex h-full w-64 md:w-80 shrink-0 flex-col border-r border-stone-400/50 bg-neutral-300 transition-transform duration-200 dark:border-zinc-800 dark:bg-neutral-900",
          open ? "translate-x-0" : "-translate-x-full",
          "fixed inset-y-0 left-0 md:static md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between px-2 py-3 md:px-3 md:py-4 ml-2 pb-3 md:pb-4">
          <div className="flex items-center gap-8 md:gap-28">
            <div className="flex items-center gap-2 md:gap-3 ml-1">
              <img
                src="/logo1.png"
                alt="Logo"
                className="h-5 w-5 md:h-7 md:w-7 object-contain"
              />
              <img
                src="/text41.png"
                alt="AI Assistant"
                className="h-3.5 md:h-4 object-contain hidden dark:block"
              />
              <img
                src="/text49.png"
                alt="AI Assistant"
                className="h-3 md:h-4 object-contain block dark:hidden"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-14"
              onClick={() => {
                if (window.innerWidth < 768) onClose?.();
                else setSidebarCollapsed(true);
              }}
            >
              <PanelLeftClose className="h-5 w-5 text-zinc-500" />
            </Button>
          </div>
        </div>

        <div className="px-4 mb-2 md:mb-3">
          <div className="relative group">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 group-focus-within:text-zinc-600 dark:group-focus-within:text-zinc-300 transition-colors" />
            <Input
              placeholder="Search for chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-full bg-stone-100/50 dark:bg-zinc-800/50 border-none shadow-inner focus-visible:outline-none focus-visible:ring-neutral-200/5 dark:focus-visible:ring-neutral-500/5 transition-all outline-none"
            />
          </div>
        </div>

        <div className="px-4 mb-1 hidden md:block">
          <Button
            onClick={() => { if (window.innerWidth < 768) onClose?.(); createNewChat(); }}
            variant="ghost"
            className="w-full flex items-center justify-start gap-3 rounded-full h-10 px-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full shadow-inner hover:shadow-inner bg-stone-100/60 dark:bg-zinc-800">
              <Plus className="h-3.5 w-3.5" />
            </div>
            <span className="font-small text-zinc-600 dark:text-zinc-400">
              New chat
            </span>
          </Button>
        </div>

        <div className="px-3 mb-1.5 md:mb-2.5">
          <div className="space-y-0.5">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-4 h-10 rounded-full font-normal text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => onViewChange?.("gallery")}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>Gallery</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-4 h-10 rounded-full font-normal text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => onViewChange?.("workspace")}
            >
              <Palette className="h-4 w-4" />
              <span>Studio</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-4 h-10 rounded-full font-normal text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => onViewChange?.("projects")}
            >
              <FolderKanban className="h-4 w-4" />
              <span>Projects</span>
            </Button>
          </div>
        </div>

        <div className="px-4 pb-1 ml-2 text-xs font-medium text-zinc-500">
          Chats
        </div>
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-4 scrollbar-hide">
          <div className="space-y-1">
            {pinned.length > 0 && (
              <div className="space-y-1 shadow-inner">
                <h3 className="px-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Pinned
                </h3>
                {pinned.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    isSelected={selectedId === c.id}
                    onSelect={onSelect}
                    onEditTitle={handleEditTitle}
                    onDelete={handleDeleteConversation}
                    isLoadingMessages={isLoadingMessages}
                    projects={projects}
                    onAssignProject={handleAssignProject}
                    onCreateProject={handleCreateProject}
                    projectName={projectNames[rawConversations[c.id]?.metadata?.project_id || ''] || ''}
                    onClose={onClose}
                  />
                ))}
              </div>
            )}
            {rawConvsLength === 0 ? (
              <div className="space-y-3 px-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-7 rounded-3xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="px-3 text-xs text-zinc-400">
                No conversations yet.
              </p>
            ) : (
              recent.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  isSelected={selectedId === c.id}
                  onSelect={onSelect}
                  onEditTitle={handleEditTitle}
                  onDelete={handleDeleteConversation}
                  isLoadingMessages={isLoadingMessages}
                    projects={projects}
                    onAssignProject={handleAssignProject}
                    onCreateProject={handleCreateProject}
                    projectName={projectNames[rawConversations[c.id]?.metadata?.project_id || ''] || ''}
                    onClose={onClose}
                />
              ))
            )}
          </div>
        </nav>

        <div className="mt-auto border-t border-zinc-200/60 px-4 py-3 mb-2 dark:border-zinc-800">
          <ProfilePopover />
        </div>
      </aside>
    </>
  );
}
