import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ChatArea from "@/pages/ChatArea";
import { fetchSettings } from "@/utils/api";
import { useChatCreation } from "@/features/chat/useChatCreation";
import { useFileManagement } from "@/features/files/useFileManagement";
import { useSessionManagement } from "@/features/sessions/useSessionManagement";
import { useModelManagement } from "@/features/models/useModelManagement";
import { useAllModels } from "@/features/models/useAllModels";
import { useUIStateManagement } from "@/features/ui/useUIStateManagement";
import { Message, Conversation } from "@/features/sessions/types";
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
  const [inputValue, setInputValue] = useState("");
  const [selectedLLM, setSelectedLLM] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"conversations" | "search" | "media">("conversations");

  // Unified loading states from Zustand
  const imageGenerationLoading = useImageGenerationLoading();
  const conversationCreationLoading = useConversationCreationLoading();
  const isLoading = imageGenerationLoading || conversationCreationLoading;

  // Enhanced features state
  const [selectedSearchEngine, setSelectedSearchEngine] = useState("duckduckgo");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelMapping, setModelMapping] = useState<Record<string, string>>({});
  const [selectedModel, setSelectedModel] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [supportedImageModels, setSupportedImageModels] = useState<string[]>([]);
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});

  // Cross-provider model aggregation
  const {
    allModels: allAvailableModels,
    allModelMapping: allModelMapping,
    providerGroups,
    isLoading: allModelsLoading,
    error: allModelsError
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
    setAutoTitleGeneration,

    // UI state
    isSidebarOpen: uiIsSidebarOpen,
    setIsSidebarOpen: uiSetIsSidebarOpen,
    sidebarView: uiSidebarView,
    setSidebarView: uiSetSidebarView,
    isGalleryOpen,
    setIsGalleryOpen,
    isFileProcessingOpen,
    setIsFileProcessingOpen,

    // Loading state
    isLoading: uiIsLoading,
    setIsLoading: uiSetIsLoading,

    // Feature toggle functions
    toggleSearch,
    toggleImageMode,
    toggleCodingMode,
    toggleRawResponse,
    toggleAutoTitleGeneration,

    // UI state functions
    openSidebar,
    closeSidebar,
    toggleSidebar,
    openGallery,
    closeGallery,
    openFileProcessing,
    closeFileProcessing,
  } = useUIStateManagement({
    onLoadingUpdate: () => {}, // Zustand handles loading state
    onSidebarStateUpdate: setIsSidebarOpen,
  });

  // Domain hooks
  const {
    handleSendMessage: chatHandleSendMessage,
    handleStopMessage: chatHandleStopMessage,
  } = useChatCreation({
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


  const {
    handleFileUpload: fileHandleFileUpload,
    handleFileProcessed: fileHandleFileProcessed,
    handleContextRetrieved: fileHandleContextRetrieved,
  } = useFileManagement();

  // Session management domain hook
  const {
    loadUserSessions: sessionLoadUserSessions,
    loadStoredApiKeys: sessionLoadStoredApiKeys,
    loadSessionMessages: sessionLoadSessionMessages,
    handleNewChat: sessionHandleNewChat,
  } = useSessionManagement({
    isAuthenticated,
    onSessionsUpdate: () => {}, // Zustand handles this
    onSessionIdUpdate: () => {}, // Zustand handles this
    onMessagesUpdate: () => {}, // Zustand handles this
    onApiKeysUpdate: setStoredApiKeys,
  });

  // Model management domain hook
  const {
    isLoadingModels: modelIsLoadingModels,
    setIsLoadingModels: modelSetIsLoadingModels,
    loadModels: modelLoadModels,
    loadImageModels: modelLoadImageModels,
    refreshModels: modelRefreshModels,
    validateModelSupport: modelValidateModelSupport,
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
        await modelLoadImageModels();
        
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

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      if (isAuthenticated) {
        await sessionLoadUserSessions();
        await sessionLoadStoredApiKeys();
      } else {
        const tempSessions = localStorage.getItem('tempSessions');
        if (tempSessions) {
          // Zustand will handle persistence automatically
          // No need to set React state
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

  // Trigger model refresh when authentication status changes
  useEffect(() => {
    if (isAuthenticated) {
      modelRefreshModels();
    }
  }, [isAuthenticated]);

  // Fetch supported image models - only when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      modelLoadImageModels();
    }
  }, [isAuthenticated]);

  // Enhanced send message handler using domain hook
  const handleSendMessage = async (message: string, fileReferences?: any[]) => {
    if (!message.trim()) return;

    if (!selectedLLM || !selectedLLM.trim()) {
      toast.error("Please select an AI provider before sending a message");
      return;
    }

    if (!selectedModel || !selectedModel.trim()) {
      toast.error("Please select a model before sending a message");
      return;
    }

    await chatHandleSendMessage(message, fileReferences || []);
  };


  // Action button handler - redirects to tool menu
  const handleActionButton = async (action: string) => {
    if (action === "image") {
      setIsImageMode(true);
      toast.info("Image generation mode activated");
    } else {
      toast.info("This feature is now available through the tool menu in the input bar");
    }
  };

  // Enhanced file upload handler using domain hook
  const handleFileUploadEnhanced = async (files: FileList) => {
    await fileHandleFileUpload(files, activeChatId || "");
  };

  // Enhanced file processed handler using domain hook
  const handleFileProcessedEnhanced = (result: any) => {
    fileHandleFileProcessed(result);
  };

  // Enhanced context retrieved handler using domain hook
  const handleContextRetrievedEnhanced = (context: string) => {
    fileHandleContextRetrieved(context);
  };

  // Stop message handler using domain hook
  const handleStopMessage = () => {
    chatHandleStopMessage();
  };

  const handleNewChat = async () => {
    const newChatId = await createNewChat();
    setActiveChat(newChatId);
    setIsSidebarOpen(false);
  };


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
      providerGroups={providerGroups}
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
      chatHandleSendMessage={handleSendMessage}
      chatHandleStopMessage={handleStopMessage}
      selectedSearchEngine={selectedSearchEngine}
      onSearchEngineChange={setSelectedSearchEngine}
    />
  );
}
