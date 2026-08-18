import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ChatService, ChatRequest } from "./chatService";
import { useChatStore, useAddMessage, useFinalizeMessage, useActiveChatId, useSetActiveChat, useCreateNewChat, useStartConversationCreation, useCompleteConversationCreation, useUpdateConversation } from "@/store/chatStore";
import { useShallow } from 'zustand/react/shallow';

// Generate unique message IDs to prevent conflicts
const generateMessageId = (prefix: string = 'msg'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Normalize the backend `sources` payload into the shape MessageContext renders
// (adds id; counts document/image sources for the "N documents" badge).
function normalizeSources(raw: any[] = []) {
  return raw.map((s, i) => ({
    id: s.id || `src_${i}`,
    title: s.title || "Source",
    type: (s.type as string) || "document",
    snippet: s.snippet || "",
    source: s.source || "",
  }));
}
function sourcesToFields(data: { context_used?: any; sources?: any[]; retrieved_images?: string[]; search_query?: string } = {}) {
  const cu = data.context_used || {};
  const sources = normalizeSources(data.sources);
  const docCount = sources.filter(s => s.type === "document" || s.type === "image").length;
  return {
    sources,
    retrievedImages: data.retrieved_images || [],
    context_used: cu,
    searchUsed: !!cu.web_search,
    searchQuery: data.search_query || "",
    documentsReferenced: docCount,
    memoryUsed: !!cu.memory,
  };
}

interface UseChatCreationOptions {
  isAuthenticated: boolean;
  currentSessionId: string;
  currentConversationId: string;
  selectedLLM: string;
  selectedModel: string;
  modelMapping: Record<string, string>;
  showRawResponse: boolean;
  isImageMode: boolean;
  isCodingMode: boolean;
  isSearchEnabled?: boolean;
  selectedSearchEngine?: string;
  autoTitleGeneration: boolean;
  onLoadingUpdate: (loading: boolean) => void;
  setIsImageMode?: (value: boolean) => void;
}

export function useChatCreation(options?: UseChatCreationOptions) {
  const [internalIsLoading, setInternalIsLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Zustand state management
  const addMessage = useAddMessage();
  const finalizeMessage = useFinalizeMessage();
  const activeChatId = useActiveChatId();
  const setActiveChat = useSetActiveChat();
  const createNewChat = useCreateNewChat();
  const updateConversation = useUpdateConversation();
  
  // Use stable selectors with useShallow to prevent infinite loops
  const messages = useChatStore(useShallow(state => state.getActiveMessages()));
  const conversations = useChatStore(useShallow(state => state.conversations));

  // Zustand loading actions
  const startConversationCreation = useStartConversationCreation();
  const completeConversationCreation = useCompleteConversationCreation();

  // Use external loading state if provided, otherwise use internal
  const isLoading = options?.onLoadingUpdate ? internalIsLoading : internalIsLoading;
  const setIsLoading = options?.onLoadingUpdate || setInternalIsLoading;

  // Use Zustand active chat ID or fallback to options
  const currentConversationId = activeChatId || options?.currentConversationId || "";
  const currentSessionId = activeChatId || options?.currentSessionId || "";

  const handleSendMessage = useCallback(async (message: string, fileReferences: any[] = [], imageMode: boolean = false): Promise<boolean> => {
    if (!message.trim()) return false;

    const streamMessageChunk = useChatStore.getState().streamMessageChunk;
    const targetIdRef = { current: "" };

    // Use the options passed to the hook, or fallback values
    const hookOptions = options || {
      isAuthenticated: false,
      selectedLLM: "",
      selectedModel: "",
      modelMapping: {},
      showRawResponse: false,
      isImageMode: false,
      isCodingMode: false,
      isSearchEnabled: false,
      selectedSearchEngine: "duckduckgo",
      autoTitleGeneration: true,
    };

    // Validate required fields before sending
    if (!hookOptions.selectedLLM || !hookOptions.selectedLLM.trim()) {
      toast.error("Please select an AI provider before sending a message");
      return false;
    }

    if (!hookOptions.selectedModel || !hookOptions.selectedModel.trim()) {
      toast.error("Please select a model before sending a message");
      return false;
    }

    // Generate unique IDs to prevent conflicts
    const userMessageId = generateMessageId('user');
    const assistantMessageId = generateMessageId('assistant');

    const userMessage = {
      id: userMessageId,
      role: "user" as const,
      content: message,
      timestamp: new Date(),
      fileAttachments: fileReferences,
      created_at: new Date().toISOString()
    };

    console.log("📝 Adding user message to state:", {
      id: userMessageId,
      content: message.substring(0, 50) + "...",
      currentMessagesCount: messages.length
    });

    // Add user message to Zustand store
    let targetConversationId = currentConversationId;
    if (currentConversationId) {
      const resolvedId = await addMessage(currentConversationId, userMessage);
      if (resolvedId) {
        targetConversationId = resolvedId;
      }
    } else {
      // Create new conversation if none exists
      const newChatId = await createNewChat();
      setActiveChat(newChatId);
      const resolvedId = await addMessage(newChatId, userMessage);
      targetConversationId = resolvedId || newChatId;
    }

    const currentInput = message;

    // Image mode now streams through the normal chat pipeline (smart-modality), so both
    // use conversation loading rather than the legacy image-generation loader.
    startConversationCreation();
    
    // Reset search status
    setSearchStatus("");

    // Initialize AbortController for the current request
    abortControllerRef.current = new AbortController();

    let sent = true;
    let receivedContent = false;
    let receivedImageUrl = "";
    try {
      // Route via the normal chat pipeline (smart-modality). Image mode streams the same
      // way and lands as an `image` event → onImage finalizes generatedImageUrl on the message.
      const chatRequest: ChatRequest = {
          message: currentInput,
          provider: hookOptions.selectedLLM,
          model: hookOptions.selectedModel,
          api_key: "",
          signal: abortControllerRef.current.signal,
          show_raw_response: hookOptions.showRawResponse,
          file_references: fileReferences,
          web_search: hookOptions.isSearchEnabled ?? false,
          search_provider: hookOptions.selectedSearchEngine ?? "duckduckgo",
          is_image_mode: hookOptions.isImageMode || imageMode,
        };

      // Stream tokens into this assistant message as they arrive.
      targetIdRef.current = assistantMessageId;

      const result = await ChatService.sendMessage(chatRequest, {
        isAuthenticated: hookOptions.isAuthenticated,
        currentSessionId: targetConversationId,
        currentConversationId: targetConversationId,
        messages: messages as any,
        selectedModel: hookOptions.selectedModel,
        modelMapping: hookOptions.modelMapping,
        showRawResponse: hookOptions.showRawResponse,
        isSearchEnabled: hookOptions.isSearchEnabled ?? false,
        selectedSearchEngine: hookOptions.selectedSearchEngine ?? "duckduckgo",
        autoTitleGeneration: hookOptions.autoTitleGeneration,
        setCurrentSessionId: () => {},
        setCurrentConversationId: () => {},
        setConversations: () => {},
        updateConversation,
        setMessages: () => {},
        setIsLoading: () => {},
        onChunk: (chunk: string) => {
          if (chunk && !receivedContent) {
            receivedContent = true;
            // Tokens have started — stop showing the search shimmer.
            setSearchStatus("");
          }
          if (chunk) receivedContent = true;
          if (targetIdRef.current && targetConversationId) {
            streamMessageChunk(targetConversationId, targetIdRef.current, chunk);
          }
        },
        onStatus: (stage: string, message: string) => {
          setSearchStatus(message || stage);
        },
        onSources: (data) => {
          // Attach multimodal context to the streamed message live.
          if (targetIdRef.current && targetConversationId) {
            finalizeMessage(targetConversationId, targetIdRef.current, sourcesToFields(data));
          }
        },
        onImage: (url) => {
          receivedImageUrl = url;
          // Set the generated image on the active assistant message so it renders in-chat.
          if (targetIdRef.current && targetConversationId) {
            finalizeMessage(targetConversationId, targetIdRef.current, { generatedImageUrl: url });
          }
        }
      });

        // Streamed tokens already landed in the store via streamMessageChunk — only add the
        // whole assistant message when nothing streamed (e.g. empty reply). Finalize clears the
        // loading flag / cursor either way.
        if (targetConversationId) {
          if (!receivedContent && targetIdRef.current) {
            await addMessage(targetConversationId, {
              ...result.assistantMessage,
              id: targetIdRef.current,
              ...(receivedImageUrl ? { generatedImageUrl: receivedImageUrl } : {}),
              created_at: (result.assistantMessage as any).created_at || new Date().toISOString()
            });
          } else {
            finalizeMessage(targetConversationId, targetIdRef.current, sourcesToFields(
              result.assistantMessage as any
            ));
          }

          // Complete conversation creation loading
          completeConversationCreation();
        }

        // Save messages to local storage for unauthenticated users
        if (!hookOptions.isAuthenticated) {
          const localAssistantMessage = {
            ...result.assistantMessage,
            created_at: (result.assistantMessage as any).created_at || new Date().toISOString()
          };
          // Get existing messages from localStorage
          const existingMessages = JSON.parse(localStorage.getItem(`tempMessages_${result.sessionId}`) || '[]');
          // Add only assistant message (user message already in localStorage from earlier)
          localStorage.setItem(`tempMessages_${result.sessionId}`, JSON.stringify([...existingMessages, localAssistantMessage]));
        }
    } catch (error: any) {
      // Only treat as a failed send (keep prompt) if no assistant content was streamed —
      // a mid-stream/late error after content counts as sent so the prompt clears.
      if (!receivedContent) {
        sent = false;
        if (error.name === "AbortError") {
          toast.info("Chat stopped by user.");
        } else {
          const errorMessage = error?.message || "Failed to send message";
          toast.error(`Chat Error: ${errorMessage}`);
          console.error("API Error:", error);
        }
      }
    } finally {
      // Ensure loading states are cleared.
      completeConversationCreation();
      // Image mode is a one-shot generation — reset the toggle when the send settles.
      if (hookOptions.isImageMode && options?.setIsImageMode) {
        options.setIsImageMode(false);
      }
      setSearchStatus(""); // Clear search status
      abortControllerRef.current = null; // Clear the controller
    }
    return sent;
  }, [options, activeChatId, messages, conversations, addMessage, createNewChat, setActiveChat, startConversationCreation, completeConversationCreation]);

  const handleStopMessage = useCallback(() => {
    ChatService.stopMessage(abortControllerRef.current, setIsLoading);
  }, []);

  const handleNewChat = useCallback(async () => {
    try {
      // Create new chat using Zustand
      const newChatId = await createNewChat();
      setActiveChat(newChatId);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      toast.error("Failed to create new chat");
    }
  }, [createNewChat, setActiveChat]);

  return {
    messages,
    conversations,
    currentConversationId,
    currentSessionId,
    isLoading,
    setIsLoading,
    searchStatus,
    handleSendMessage,
    handleStopMessage,
    handleNewChat,
  };
}
