import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ChatService, ChatRequest } from "./chatService";
import { ImageService, ImageRequest } from "@/features/images/imageService";
import { useChatStore, useAddMessage, useActiveChatId, useSetActiveChat, useCreateNewChat, useStartImageGeneration, useCompleteImageGeneration, useStartConversationCreation, useCompleteConversationCreation, useUpdateConversation } from "@/store/chatStore";
import { useShallow } from 'zustand/react/shallow';

// Simple image message formatter - creates text-only content (image will be rendered separately)
const formatImageMessage = (imageUrl: string, _userPrompt: string): string => {
  console.log("🔄 formatImageMessage called with URL:", imageUrl?.substring(0, 50) + "...");

  // Return only text content - image will be rendered via generatedImageUrl field
  return `**Image Generated Successfully!**

*Click on the image below to view it in full size.*`;
};

// Generate unique message IDs to prevent conflicts
const generateMessageId = (prefix: string = 'msg'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

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
  const activeChatId = useActiveChatId();
  const setActiveChat = useSetActiveChat();
  const createNewChat = useCreateNewChat();
  const updateConversation = useUpdateConversation();
  
  // Use stable selectors with useShallow to prevent infinite loops
  const messages = useChatStore(useShallow(state => state.getActiveMessages()));
  const conversations = useChatStore(useShallow(state => state.conversations));

  // Zustand loading actions
  const startImageGeneration = useStartImageGeneration();
  const completeImageGeneration = useCompleteImageGeneration();
  const startConversationCreation = useStartConversationCreation();
  const completeConversationCreation = useCompleteConversationCreation();

  // Use external loading state if provided, otherwise use internal
  const isLoading = options?.onLoadingUpdate ? internalIsLoading : internalIsLoading;
  const setIsLoading = options?.onLoadingUpdate || setInternalIsLoading;

  // Use Zustand active chat ID or fallback to options
  const currentConversationId = activeChatId || options?.currentConversationId || "";
  const currentSessionId = activeChatId || options?.currentSessionId || "";

  const handleSendMessage = useCallback(async (message: string, fileReferences: any[] = []): Promise<boolean> => {
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

    // Set loading state based on message type
    if (hookOptions.isImageMode) {
      startImageGeneration(targetConversationId);
    } else {
      startConversationCreation();
    }
    
    // Reset search status
    setSearchStatus("");

    // Initialize AbortController for the current request
    abortControllerRef.current = new AbortController();

    let sent = true;
    let receivedContent = false;
    try {
    // Check if image mode is enabled and route to image generation
    if (hookOptions.isImageMode) {
      // Route to image generation API
      const imageRequest: ImageRequest = {
        message: currentInput,
        provider: hookOptions.selectedLLM,
        model: hookOptions.selectedModel,
        api_key: "",
      };

      const imageResult = await ImageService.generateImage(imageRequest, {
        isAuthenticated: hookOptions.isAuthenticated,
        currentConversationId,
        currentSessionId,
        conversations: Object.values(conversations) as any,
        selectedModel: hookOptions.selectedModel,
        modelMapping: hookOptions.modelMapping,
        setCurrentSessionId: () => {},
        setCurrentConversationId: () => {},
        setConversations: () => {},
      });

      console.log("🖼️ Image generation result:", {
        imageUrl: imageResult.imageUrl,
        conversationId: imageResult.conversationId,
        provider: hookOptions.selectedLLM,
        imageUrlType: typeof imageResult.imageUrl,
        imageUrlLength: imageResult.imageUrl?.length
      });

      // Create assistant message using unified formatting - ensures consistency across providers
      const assistantMessage = {
        id: assistantMessageId,
        role: "assistant" as const,
        content: formatImageMessage(imageResult.imageUrl, currentInput),
        timestamp: new Date(),
        generatedImageUrl: imageResult.imageUrl,
        created_at: new Date().toISOString()
      };

      console.log("🤖 Adding assistant message to state:", {
        id: assistantMessageId,
        content: assistantMessage.content.substring(0, 50) + "...",
      });

      targetIdRef.current = assistantMessageId;

      // Add assistant message to Zustand store
      if (currentConversationId) {
        addMessage(currentConversationId, assistantMessage);
      }

      // Complete image generation loading
      completeImageGeneration(currentConversationId);

      // Reset image mode after successful generation
      if (options?.setIsImageMode) {
        options.setIsImageMode(false);
      }

      } else {
        // Use regular chat service for normal mode
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
        };

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
          if (chunk) receivedContent = true;
          if (targetIdRef.current) {
            streamMessageChunk(targetConversationId || result.sessionId, targetIdRef.current, chunk);
          }
        },
        onStatus: (status: string) => {
          setSearchStatus(status);
        }
      });

        // Add only assistant message to Zustand store (user message already added)
        if (targetConversationId) {
          const assistantMessage = {
            ...result.assistantMessage,
            created_at: (result.assistantMessage as any).created_at || new Date().toISOString()
          };
          await addMessage(targetConversationId, assistantMessage);

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
      // Ensure loading states are cleared
      if (hookOptions.isImageMode) {
        completeImageGeneration(currentConversationId);
      } else {
        completeConversationCreation();
      }
      setSearchStatus(""); // Clear search status
      abortControllerRef.current = null; // Clear the controller
    }
    return sent;
  }, [options, activeChatId, messages, conversations, addMessage, createNewChat, setActiveChat, startImageGeneration, completeImageGeneration, startConversationCreation, completeConversationCreation]);

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
