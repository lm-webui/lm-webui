import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import ChatArea from "@/pages/ChatArea";
import { fetchSettings } from "@/utils/api";
import { useChatCreation } from "@/features/chat/useChatCreation";
import { useSessionManagement } from "@/features/sessions/useSessionManagement";
import { useModelManagement } from "@/features/models/useModelManagement";
import { useAllModels } from "@/features/models/useAllModels";
import { useUIStateManagement } from "@/features/ui/useUIStateManagement";
import { useChatStore, useActiveMessages, useActiveChatId, useSetActiveChat, useCreateNewChat, useImageGenerationLoading, useConversationCreationLoading, selectConversations } from "@/store/chatStore";
import { useShallow } from 'zustand/react/shallow';

export default function IndexEnhanced() {
  const { isAuthenticated } = useAuth();
  
  // Zustand state management - use stable selectors
  const messages = useActiveMessages();
  const activeChatId = useActiveChatId();
  const setActiveChat = useSetActiveChat();
  const createNewChat = useCreateNewChat();

  // Use a stable selector for conversations - memoized to prevent infinite loops
  const conversations = useChatStore(useShallow(selectConversations));
  
  // UI state
  const [selectedLLM, setSelectedLLM] = useState("");
  const [, setIsSidebarOpen] = useState(false);

  // Unified loading states from Zustand
  const imageGenerationLoading = useImageGenerationLoading();
  const conversationCreationLoading = useConversationCreationLoading();
  const isLoading = imageGenerationLoading || conversationCreationLoading;

  // Enhanced features state
  const [selectedSearchEngine, setSelectedSearchEngine] = useState("duckduckgo");
  const [, setAvailableModels] = useState<string[]>([]);
  const [modelMapping, setModelMapping] = useState<Record<string, string>>({});
  const [selectedModel, setSelectedModel] = useState("");
  const [, setConnectionStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [, setSupportedImageModels] = useState<string[]>([]);
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});

  // Cross-provider model aggregation
  const {
    allModels: allAvailableModels,
  } = useAllModels({
    isAuthenticated,
    storedApiKeys
  });

  // UI state management domain hook
  const {
    // Feature toggles
    isSearchEnabled,
    setIsSearchEnabled,
    isImageMode,
    setIsImageMode,
    isCodingMode,
    setIsCodingMode,
    showRawResponse,
    setShowRawResponse,
    autoTitleGeneration,

    // UI state
    setIsFileProcessingOpen,

    // Loading state
    setIsLoading: uiSetIsLoading,
  } = useUIStateManagement({
    onLoadingUpdate: () => {}, // Zustand handles loading state
    onSidebarStateUpdate: setIsSidebarOpen,
  });

  // Domain hooks
  useChatCreation({
    isAuthenticated,
    currentSessionId: activeChatId || "",
    currentConversationId: activeChatId || "",
    selectedLLM,
    selectedModel,
    modelMapping,
    showRawResponse,
    isImageMode,
    isCodingMode,
    isSearchEnabled,
    selectedSearchEngine,
    autoTitleGeneration,
    onLoadingUpdate: () => {}, // Zustand handles loading state
    setIsImageMode
  });


  // Session management domain hook
  const {
    loadUserSessions: sessionLoadUserSessions,
    loadStoredApiKeys: sessionLoadStoredApiKeys,
  } = useSessionManagement({
    isAuthenticated,
    onSessionsUpdate: () => {}, // Zustand handles this
    onSessionIdUpdate: () => {}, // Zustand handles this
    onMessagesUpdate: () => {}, // Zustand handles this
    onApiKeysUpdate: setStoredApiKeys,
  });

  // Model management domain hook
  const {
    loadModels: modelLoadModels,
    loadImageModels: modelLoadImageModels,
  } = useModelManagement({
    selectedLLM,
    selectedModel,
    isAuthenticated,
    storedApiKeys,
    isImageMode,
    onModelsUpdate: setAvailableModels,
    onModelMappingUpdate: setModelMapping,
    onConnectionStatusUpdate: setConnectionStatus,
    onSelectedModelUpdate: setSelectedModel,
    onSupportedImageModelsUpdate: setSupportedImageModels,
  });

  // App initialization - moved to useEffect for better control
  useEffect(() => {
    const initializeApp = async () => {
      if (isAuthenticated) {
        await sessionLoadUserSessions();
        await sessionLoadStoredApiKeys();

        try {
          const settings = await fetchSettings();
          if (settings.selectedSearchEngine) {
            setSelectedSearchEngine(settings.selectedSearchEngine);
          }
          if (settings.selectedLLM) {
            setSelectedLLM(settings.selectedLLM);
          }
          if (settings.selectedModel) {
            setSelectedModel(settings.selectedModel);
          }
        } catch (error) {
          console.error("Failed to load user settings:", error);
        }
      }
    };
    initializeApp();
  }, [isAuthenticated]);

  // File processing event listener
  useEffect(() => {
    const handleOpenFileProcessing = () => {
      setIsFileProcessingOpen(true);
    };

    window.addEventListener('openFileProcessing', handleOpenFileProcessing);

    return () => {
      window.removeEventListener('openFileProcessing', handleOpenFileProcessing);
    };
  }, []);

  // Load session messages - Zustand handles this automatically
  // No need for manual loading as Zustand persists state


  // Reload stored API keys when selected LLM changes
  useEffect(() => {
    if (isAuthenticated) {
      sessionLoadStoredApiKeys();
    }
  }, [selectedLLM, isAuthenticated]);

  // Update available models when LLM provider changes - only when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      modelLoadModels();
    }
  }, [selectedLLM, storedApiKeys, isAuthenticated]);

  // Fetch supported image models - only when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      modelLoadImageModels();
    }
  }, [isAuthenticated]);



  return (
    <ChatArea
      isAuthenticated={isAuthenticated}
      messages={messages}
      activeChatId={activeChatId}
      setActiveChat={setActiveChat}
      createNewChat={createNewChat}
      conversations={conversations}
      selectedLLM={selectedLLM}
      setSelectedLLM={setSelectedLLM}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
      allModels={allAvailableModels}
      isSearchEnabled={isSearchEnabled}
      setIsSearchEnabled={setIsSearchEnabled}
      isImageMode={isImageMode}
      setIsImageMode={setIsImageMode}
      isCodingMode={isCodingMode}
      setIsCodingMode={setIsCodingMode}
      showRawResponse={showRawResponse}
      setShowRawResponse={setShowRawResponse}
      isLoading={isLoading}
      setIsLoading={uiSetIsLoading}
      selectedSearchEngine={selectedSearchEngine}
      onSearchEngineChange={setSelectedSearchEngine}
    />
  );
}
