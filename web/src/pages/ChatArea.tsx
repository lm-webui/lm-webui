import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatStore, useIsLoadingMessages } from "@/store/chatStore";
import { mapToConversation } from "@/utils/chatUtils";
import { useChatCreation } from "@/features/chat/useChatCreation";
import { toast } from "sonner";
import { detectMessageIntent } from "@/utils/chatUtils";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import ChatPane from "../components/chat/ChatPane";
import ImageWorkspace from "@/features/images/ImageWorkspace";
import ImageGallery from "@/features/images/ImageGallery";
import ProjectsWorkspace from "@/features/projects/ProjectsWorkspace";
import AgentWorkspace from "@/features/agents/AgentWorkspace";
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
  isLoading,
  setIsLoading,
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



  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "agent" | "gallery" | "workspace" | "projects" | "settings" | "runtime">("chat");

  const openConversation = async (conversationId: string) => {
    setActiveChat(conversationId);
    setActiveView("chat");
    const store = useChatStore.getState();
    if (store.conversations[conversationId]?.messages.length === 0) {
      await store.loadMessagesForConversation(conversationId);
    }
  };

  const openProjectConversation = async (projectId: string) => {
    const id = useChatStore.getState().createNewChat();
    useChatStore.getState().updateConversation(id, { metadata: { project_id: projectId } });
    setActiveChat(id);
  };

  // "Open in Image Studio" from a chat message -> switch to the Studio view.
  useEffect(() => {
    const go = () => setActiveView("workspace");
    window.addEventListener("navigate-studio", go);
    return () => window.removeEventListener("navigate-studio", go);
  }, []);
  const {
    searchStatus,
    handleSendMessage: chatCreationHandleSendMessage,
    handleStopMessage,
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
    if (genFile) {
      // Route through smart-modality (image_mode flag): the backend generates via the default
      // image provider and streams back an "image" event that renders in-chat + Gallery.
      return await chatCreationHandleSendMessage(genFile.prompt || content, [], true);
    }

    try {
      const ok = await chatCreationHandleSendMessage(content, files, false);
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

  const projectComposer = activeView === "projects" && activeChatId && modernConversation ? (
    <ChatPane
      conversation={modernConversation}
      onSend={handleSendMessage}
      isLoadingMessages={!!isLoadingMessages[activeChatId]}
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
      onStop={handleStopMessage}
      showWelcome={false}
    />
  ) : undefined;

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
        onViewChange={(v) => setActiveView(v as "chat" | "agent" | "gallery" | "workspace" | "projects" | "settings" | "runtime")}
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
          onViewChange={(v) => setActiveView(v as "chat" | "agent" | "gallery" | "workspace" | "projects" | "settings" | "runtime")}
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
            onStop={handleStopMessage}
          />
        )}
        {activeView === "workspace" && <ImageWorkspace />}
        {activeView === "gallery" && <ImageGallery />}
        {activeView === "projects" && <ProjectsWorkspace onOpenConversation={openConversation} onNewConversation={openProjectConversation} projectComposer={projectComposer} />}
        {activeView === "agent" && <AgentWorkspace />}
        {activeView === "runtime" && (
          <RuntimeManager
            open={true}
            onOpenChange={() => {}}
            onModelLoad={(model, provider) => { if (provider) setSelectedLLM(provider); setSelectedModel(model); }}
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
            onOpenRuntimeManager={() => setActiveView("runtime")}
          />
        )}
      </main>
    </div>
  );
}
