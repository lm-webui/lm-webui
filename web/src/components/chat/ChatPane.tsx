import React, { useEffect, useState } from "react";
import { ChatConversation } from "@/types/chat-ui";
import { Message as LegacyMessage } from "./Message";
import { LoadingMessage } from "./LoadingMessage";
import Composer from "../Composer";
import { useAuth } from "@/contexts/AuthContext";
import { Welcome } from "../Welcome";
import { useChatStore } from "@/store/chatStore";
import { FolderKanban } from "lucide-react";
import { authFetch } from "@/utils/api";
import { toast } from "sonner";

interface ChatPaneProps {
  conversation: ChatConversation | null;
  onSend: (content: string, files?: any[]) => Promise<boolean>;
  isLoading: boolean;
  searchStatus?: string;
  isThinking: boolean;
  onPauseThinking: () => void;
  isSearchEnabled: boolean;
  setIsSearchEnabled: (enabled: boolean) => void;
  isImageMode: boolean;
  setIsImageMode: (enabled: boolean) => void;
  isCodingMode: boolean;
  setIsCodingMode: (enabled: boolean) => void;
  selectedModel?: string;
  selectedLLM?: string;
  onLLMChange?: (llm: string) => void;
  onModelChange?: (model: string) => void;
  availableModels?: string[];
  isLoadingMessages?: boolean;
  onStop?: () => void;
  showWelcome?: boolean;
}

export default function ChatPane({
  conversation,
  onSend,
  isLoading,
  searchStatus,
  isThinking,
  isSearchEnabled,
  setIsSearchEnabled,
  isImageMode,
  setIsImageMode,
  isCodingMode,
  setIsCodingMode,
  selectedModel,
  selectedLLM,
  onLLMChange,
  onModelChange,
  availableModels,
  isLoadingMessages,
  onStop,
  showWelcome = true,
}: ChatPaneProps) {
  const [promptTemplate, setPromptTemplate] = React.useState("");
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickToBottomRef = React.useRef(true); // follow streaming unless the user scrolls up
  const { user } = useAuth();

  // Look up project name when conversation has a project_id
  useEffect(() => {
    if (!conversation) { setProjectName(""); return; }
    const conv = useChatStore.getState().conversations[conversation.id];
    const pid = conv?.metadata?.project_id;
    if (!pid) { setProjectName(""); return; }
    authFetch("/api/projects").then((d: any) => {
      const p = (d.projects || []).find((p: any) => p.id === pid);
      if (p) setProjectName(p.name);
    }).catch(() => {});
  }, [conversation?.id]);

  const handleRegenerate = () => {
    if (!conversation) return;
    const lastUser = [...conversation.messages].reverse().find((m: any) => m.role === "user");
    if (lastUser) onSend(lastUser.content || "", []);
  };

  const openProjectPicker = () => {
    if (projects.length === 0) {
      authFetch("/api/projects").then((d: any) => setProjects(d.projects || [])).catch(() => {});
    }
    setShowProjectPicker((v) => !v);
  };

  const handleAddToProject = async (projectId: string) => {
    if (!conversation) return;
    try {
      await authFetch(`/api/history/conversation/${conversation.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { project_id: projectId } }),
      });
      setShowProjectPicker(false);
      const project = projects.find((item) => item.id === projectId);
      setProjectName(project?.name || "");
      toast.success("Added to project");
    } catch {
      toast.error("Failed to add to project");
    }
  };

  const handleRemoveFromProject = async () => {
    if (!conversation) return;
    try {
      await authFetch(`/api/history/conversation/${conversation.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { project_id: null } }),
      });
      setProjectName("");
      toast.success("Removed from project");
    } catch {
      toast.error("Failed to remove from project");
    }
  };

  const ACTION_TEMPLATES: Record<string, string> = {
    "Create image": "Create an image of...",
    "Write docs": "Write documentation about...",
    "Summarize": "Summarize the following:",
    "Brainstorm": "Brainstorm ideas about:",
  };
  const handleAction = (label: string) => {
    setPromptTemplate(ACTION_TEMPLATES[label] || "");
  };
  const handleSend = (text: string, files?: any[]) => {
    setPromptTemplate("");
    return onSend(text, files);
  };

  // Follow the stream only when the user hasn't scrolled up; resume when back at the bottom.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages.length, isThinking]);

  const composer = (
    <Composer
      onSend={handleSend}
      busy={isLoading}
      conversationId={conversation?.id || ""}
      isSearchEnabled={isSearchEnabled}
      setIsSearchEnabled={setIsSearchEnabled}
      isImageMode={isImageMode}
      setIsImageMode={setIsImageMode}
      isCodingMode={isCodingMode}
      setIsCodingMode={setIsCodingMode}
      selectedModel={selectedModel || ""}
      selectedLLM={selectedLLM || ""}
      {...(onLLMChange ? { onLLMChange } : {})}
      {...(onModelChange ? { onModelChange } : {})}
      {...(availableModels ? { availableModels } : {})}
      {...(onStop ? { onStop } : {})}
      initialValue={promptTemplate}
    />
  );

  if (isLoadingMessages) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col bg-neutral-200/70 dark:bg-neutral-900/50">
        <div className="flex-1 space-y-8 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="max-w-3xl mx-auto space-y-6 mt-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className={`h-9 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="max-w-3xl mx-auto">
            <div className="h-24 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-neutral-300 dark:bg-neutral-900 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!conversation || conversation.messages.length === 0) {
    return showWelcome ? <Welcome user={user} onAction={handleAction}>{composer}</Welcome> : (
      <div className="flex h-full min-h-0 flex-1 flex-col justify-end bg-neutral-200/70 px-4 pb-4 dark:bg-neutral-900/50 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">{composer}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col relative bg-neutral-200/70 dark:bg-neutral-900/50">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-6 overflow-y-auto px-3 py-3 sm:px-8 sm:py-6 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="mb-8 hidden md:block">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-dark">
              {conversation.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{conversation.messages.length} messages · Updated recently</p>
          </div>

          {conversation.messages.map((m) => (
            <div key={m.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <LegacyMessage
                message={{
                  id: m.id,
                  role: m.role as "user" | "assistant",
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  isLoading: !!m.isLoading,
                  ...(m.type ? { type: m.type } : {}),
                  ...(m.generatedImageUrl ? { generatedImageUrl: m.generatedImageUrl } : {}),
                  ...(m.model ? { model: m.model } : {}),
                  ...(m.fileAttachments?.length ? { fileAttachments: m.fileAttachments } : {}),
                  ...(m.searchUsed !== undefined ? { searchUsed: m.searchUsed } : {}),
                  ...(m.sources ? { sources: m.sources } : {}),
                  ...(m.retrievedImages ? { retrievedImages: m.retrievedImages } : {}),
                  ...(m.context_used ? { context_used: m.context_used } : {}),
                  ...(m.documentsReferenced !== undefined ? { documentsReferenced: m.documentsReferenced } : {}),
                  ...(m.memoryUsed !== undefined ? { memoryUsed: m.memoryUsed } : {}),
                  ...(m.searchQuery ? { searchQuery: m.searchQuery } : {}),
                  ...(m.citations ? { citations: m.citations } : {}),
                }}
                onRegenerate={handleRegenerate}
                onAddToProject={openProjectPicker}
                onTranscribe={(prompt) => onSend(prompt, [])}
              />
            </div>
          ))}

          {/* Loading indicator when LLM is generating response (standard mode).
              Hidden once a message is streaming content — otherwise it duplicates
              the streaming bubble's own shimmer. */}
          {isLoading && !conversation.messages.some((m) => m.isLoading) && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <LoadingMessage
                showRawResponse={false}
                isStreaming={false}
                searchStatus={searchStatus || ""}
                isSearchEnabled={isSearchEnabled}
              />
            </div>
          )}

          <div className="h-4" />
        </div>
      </div>

      {projectName && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-muted-foreground bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-2">
            <FolderKanban className="h-3 w-3 shrink-0" />
            <span>Project: <span className="font-medium">{projectName}</span></span>
            <span className="text-zinc-400 hidden sm:inline">· System prompt active</span>
            <button type="button" onClick={handleRemoveFromProject} className="ml-auto rounded px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Remove</button>
          </div>
        </div>
      )}
      {showProjectPicker && (
        <div className="px-4 pb-1">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Add to project:</span>
            {projects.length === 0 && <span className="text-muted-foreground">No projects</span>}
            {projects.map((p: any) => (
              <button
                key={p.id}
                onClick={() => handleAddToProject(p.id)}
                className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="px-4 pb-4">
        <div className="max-w-3xl mx-auto">
          {composer}
        </div>
      </div>
    </div>
  );
}
