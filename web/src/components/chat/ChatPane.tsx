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
import { Button } from "@/components/ui/button";
import { createArtifactFromConversation } from "@/features/artifacts/artifactService";
import ArtifactDrawer from "@/features/artifacts/ArtifactDrawer";

interface ChatPaneProps {
  conversation: ChatConversation | null;
  onSend: (content: string, files?: any[]) => Promise<void>;
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
}

export default function ChatPane({
  conversation,
  onSend,
  isLoading,
  searchStatus,
  isThinking,
  onPauseThinking,
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
}: ChatPaneProps) {
  const [promptTemplate, setPromptTemplate] = React.useState("");
  const [projectName, setProjectName] = useState("");
  const [artifact, setArtifact] = useState<any>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
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
    onSend(text, files);
  };

  const handleCreateArtifact = async () => {
    if (!conversation?.id) return;
    try {
      const created = await createArtifactFromConversation(conversation.id, conversation.title || "Conversation document");
      setArtifact(created);
    } catch (error: any) {
      console.error("Artifact creation failed:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      selectedModel={selectedModel || "gpt-4o-mini"}
      selectedLLM={selectedLLM}
      onLLMChange={onLLMChange}
      onModelChange={onModelChange}
      availableModels={availableModels}
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
    return <Welcome user={user} onAction={handleAction}>{composer}</Welcome>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col relative bg-neutral-200/70 dark:bg-neutral-900/50">
      {artifact && <ArtifactDrawer artifact={artifact} onClose={() => setArtifact(null)} />}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-dark">
              {conversation.title}
            </h1>
            <div className="mt-1 flex items-center justify-between gap-3"><p className="text-sm text-zinc-500">{conversation.messages.length} messages · Updated recently</p><Button size="sm" variant="outline" onClick={handleCreateArtifact}>Create document</Button></div>
          </div>

          {conversation.messages.map((m) => (
            <div key={m.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <LegacyMessage
                message={{
                  id: m.id,
                  role: m.role as any,
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  isLoading: !!m.isLoading,
                  type: m.type,
                  generatedImageUrl: m.generatedImageUrl,
                  model: m.model,
                }}
              />
            </div>
          ))}

          {/* Loading indicator when LLM is generating response (standard mode) */}
          {isLoading && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <LoadingMessage
                showRawResponse={false}
                isStreaming={false}
                searchStatus={searchStatus || ""}
                isSearchEnabled={isSearchEnabled}
              />
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {projectName && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-muted-foreground bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-2">
            <FolderKanban className="h-3 w-3 shrink-0" />
            <span>Project: <span className="font-medium">{projectName}</span></span>
            <span className="text-zinc-400 hidden sm:inline">· System prompt active</span>
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
