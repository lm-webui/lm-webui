import React, { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatStore, useActiveMessages, useActiveChatId, useSetActiveChat, useCreateNewChat, useIsLoadingMessages } from "@/store/chatStore";
import { mapToConversation } from "@/utils/chatUtils";
import { useUIStateManagement } from "@/features/ui/useUIStateManagement";
import { useChatCreation } from "@/features/chat/useChatCreation";
import { useAllModels } from "@/features/models/useAllModels";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { generateChatTitle, detectMessageIntent } from "@/utils/chatUtils";
import { generateImage } from "@/utils/api";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import ChatPane from "../components/chat/ChatPane";
import ImageWorkspace from "@/features/images/ImageWorkspace";
import ImageGallery from "@/features/images/ImageGallery";
import ProjectsWorkspace from "@/features/projects/ProjectsWorkspace";
import RuntimeManager from "../components/models/RuntimeManager";
import { Settings } from "../components/settings/Settings";
import ArtifactDrawer from "@/features/artifacts/ArtifactDrawer";

export default function ChatArea({
  isAuthenticated,
  messages,
  activeChatId,
  setActiveChat,
  createNewChat,
  conversations,
  allModels,
  providerGroups,
  isLoading,
  setIsLoading,
  chatHandleSendMessage,
  chatHandleStopMessage,
  selectedLLM,
  setSelectedLLM,
  selectedModel,
  setSelectedModel,
  isSearchEnabled,
  setIsSearchEnabled,
  isImageMode,
  setIsImageMode,
  isCodingMode,
  setIsCodingMode,
  selectedSearchEngine,
  onSearchEngineChange,
}: any) {
  const isMobile = useIsMobile();

  const activeConversation = activeChatId ? conversations[activeChatId] : null;
  const modernConversation = useMemo(() => activeConversation ? mapToConversation(activeConversation) : null, [activeConversation, messages]);
  const artifact = useChatStore((s) => s.artifact);

  const isLoadingMessages = useIsLoadingMessages();



  // Listen for project new-chat events from ProjectsWorkspace
  useEffect(() => {
    const handler = (e: any) => {
      const { projectId, chatId } = e.detail;
      if (!projectId || !chatId) return;
      useChatStore.getState().createNewChat();
      const store = useChatStore.getState();
      const activeId = store.activeChatId;
      if (activeId) {
        store.updateConversation(activeId, { metadata: { project_id: projectId } });
        setActiveChat(activeId);
        setActiveView("chat");
      }
    };
    window.addEventListener("project-new-chat", handler);
    return () => window.removeEventListener("project-new-chat", handler);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "gallery" | "workspace" | "projects" | "settings" | "runtime">("chat");

  // "Open in Image Studio" from a chat message -> switch to the Studio view.
  useEffect(() => {
    const go = () => setActiveView("workspace");
    window.addEventListener("navigate-studio", go);
    return () => window.removeEventListener("navigate-studio", go);
  }, []);
  const {
    messages: chatMessages, // unused but returned
    conversations: chatConversations, // unused but returned
    currentConversationId,
    currentSessionId,
    isLoading: chatIsLoading, // rename to avoid conflict if needed, or just use prop
    setIsLoading: setChatIsLoading,
    searchStatus,
    handleSendMessage: chatCreationHandleSendMessage,
    handleStopMessage: chatCreationHandleStopMessage,
    handleNewChat: chatCreationHandleNewChat
  } = useChatCreation({
    isAuthenticated,
    currentSessionId: activeChatId,
    currentConversationId: activeChatId,
    selectedLLM,
    selectedModel,
    modelMapping: {}, // Add proper mapping if available
    showRawResponse: false,
    isImageMode,
    isCodingMode,
    isSearchEnabled,
    selectedSearchEngine,
    autoTitleGeneration: true,
    onLoadingUpdate: setIsLoading,
    setIsImageMode
  });

  const handleSendMessage = async (content: string, files: any[] = []): Promise<boolean> => {
    if (!content.trim() && files.length === 0) return false;

    // Auto-detect intent (optional: could auto-enable modes)
    const intent = detectMessageIntent(content);
    if (intent.isCode && !isCodingMode) {
      toast.info("Switching to coding mode", { duration: 1000 });
      setIsCodingMode(true);
    }


    const genFile = files.find((f: any) => f.type === "generating_image");
    if (genFile && activeChatId) {
      const prompt = genFile.prompt || content;
      const now = Date.now();
      await useChatStore.getState().addMessage(activeChatId, { id: `user_${now}`, role: "user" as const, content: prompt, timestamp: new Date(), created_at: new Date().toISOString() });
      // activeChatId may have changed after backend sync — read fresh
      const currentChatId = useChatStore.getState().activeChatId || activeChatId;
      // Show skeleton immediately — bypass addMessage to avoid backend sync delay
      const skeletonId = `sk_${now}`;
      const skMsg = { id: skeletonId, role: "assistant" as const, content: "", timestamp: new Date(), created_at: new Date().toISOString(), type: "image_loading" };
      const skConv = useChatStore.getState().conversations[currentChatId];
      if (skConv) {
        useChatStore.getState().updateConversation(currentChatId, { messages: [...skConv.messages, skMsg] });
      }
      try {
        const imageUrl = await generateImage({
          provider: genFile.provider || selectedLLM,
          model: genFile.model || selectedModel,
          prompt,
          params: { size: "1024x1024" },
          conversation_id: currentChatId,
        } as any);
        if (imageUrl) {
          const store = useChatStore.getState();
          const conv = store.conversations[currentChatId];
          if (conv) {
            store.updateConversation(currentChatId, { messages: conv.messages.map((m: any) => m.id === skeletonId ? { ...m, type: undefined, generatedImageUrl: imageUrl } : m) });
            // Update title if still default — re-read fresh from store (conv is stale)
            const updatedConv = useChatStore.getState().conversations[currentChatId];
            if (updatedConv && updatedConv.title === 'New Chat') {
              const title = generateChatTitle(updatedConv.messages);
              if (title !== 'New Chat') {
                store.updateConversationTitle(currentChatId, title).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        console.error("Image gen failed:", e);
        toast.error("Image generation failed. Please try again.");
        // Remove the stuck skeleton
        const store = useChatStore.getState();
        const conv = store.conversations[currentChatId];
        if (conv) {
          store.updateConversation(currentChatId, {
            messages: conv.messages.filter((m: any) => m.id !== skeletonId),
          });
        }
        return false;
      }
      return true;
    }

    try {
      const ok = await chatCreationHandleSendMessage(content, files);
      return ok;
    } catch (e) {
      console.error("Message send failed:", e);
      toast.error("Message failed to send. Check your model connection.");
      return false;
    }
  };

  const handleNewChat = async () => {
    try {
      const id = await createNewChat();
      // If current active conversation belongs to a project, carry it forward
      const currentConv = useChatStore.getState().conversations[activeChatId || ""];
      if (currentConv?.metadata?.project_id) {
        useChatStore.getState().updateConversation(id, { metadata: { project_id: currentConv.metadata.project_id } });
      }
      setActiveChat(id);
      if (isMobile) setSidebarOpen(false);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      toast.error("Failed to create new chat. Please refresh the page and try again.");
    }
  };

  return (
    <div className="h-screen w-full bg-stone-100/50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 flex overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        selectedId={activeChatId}
        onSelect={async (id) => {
          setActiveChat(id);
          setActiveView("chat");
          // Load messages from backend if the conversation exists but has no messages loaded
          const store = useChatStore.getState();
          if (store.conversations[id] && store.conversations[id].messages.length === 0) {
            await store.loadMessagesForConversation(id);
          }
        }}
        createNewChat={() => { handleNewChat(); setActiveView("chat"); }}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onViewChange={(v) => setActiveView(v as "chat" | "gallery" | "workspace" | "projects" | "settings" | "runtime")}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-neutral-300/50 dark:bg-neutral-900/30">
        {artifact && <ArtifactDrawer artifact={artifact} onClose={() => useChatStore.getState().setArtifact(null)} />}
        <Header
          createNewChat={() => { handleNewChat(); setActiveView("chat"); }}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarOpen={setSidebarOpen}
          selectedLLM={selectedLLM}
          onLLMChange={setSelectedLLM}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          availableModels={allModels}
          selectedSearchEngine={selectedSearchEngine}
          onSearchEngineChange={onSearchEngineChange}
          onViewChange={(v) => setActiveView(v as "chat" | "gallery" | "workspace" | "projects" | "settings" | "runtime")}
        />
        {activeView === "chat" && (
          <ChatPane
            conversation={modernConversation}
            onSend={handleSendMessage}
            isLoadingMessages={!!(activeChatId && isLoadingMessages[activeChatId])}
            isLoading={isLoading}
            searchStatus={searchStatus}
            isThinking={false}
            onPauseThinking={() => {}}
            isSearchEnabled={isSearchEnabled}
            setIsSearchEnabled={setIsSearchEnabled}
            isImageMode={isImageMode}
            setIsImageMode={setIsImageMode}
            isCodingMode={isCodingMode}
            setIsCodingMode={setIsCodingMode}
            selectedModel={selectedModel}
            selectedLLM={selectedLLM}
            onLLMChange={setSelectedLLM}
            onModelChange={setSelectedModel}
            availableModels={allModels}
          />
        )}
        {activeView === "workspace" && <ImageWorkspace />}
        {activeView === "gallery" && <ImageGallery />}
        {activeView === "projects" && <ProjectsWorkspace />}
        {activeView === "runtime" && (
          <RuntimeManager
            open={true}
            onOpenChange={() => {}}
            onModelLoad={setSelectedModel}
            inline
          />
        )}
        {activeView === "settings" && (
          <Settings
            inline
            selectedLLM={selectedLLM}
            onLLMChange={setSelectedLLM}
            availableModels={allModels}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        )}
      </main>
    </div>
  );
}
