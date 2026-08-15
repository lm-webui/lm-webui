import {
  streamChat,
  createConversation,
  generateConversationTitle,
  generateImage,
} from "@/utils/api";

export interface ChatRequest {
  message: string;
  provider: string;
  model: string;
  api_key?: string;
  conversation_history?: any[];
  signal?: AbortSignal | undefined;
  show_raw_response?: boolean;
  file_references?: any[]; // File references for RAG
  web_search?: boolean; // Enable web search
  search_provider?: string; // Search provider to use
  is_image_mode?: boolean; // Force image generation (smart-modality)
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  model?: string;
  searchUsed?: boolean;
  rawResponse?: string;
  generatedImageUrl?: string;
  sources?: any[];
  retrievedImages?: string[];
  context_used?: any;
  documentsReferenced?: boolean;
  memoryUsed?: boolean;
  fileAttachments?: Array<{
    id: number;
    file_path: string;
    file_type: string;
    metadata?: any;
  }> | undefined;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: Date;
  messageCount: number;
  messages?: any[];
}

export class ChatService {
  static async sendMessage(
    request: ChatRequest,
    options: {
      isAuthenticated: boolean;
      currentSessionId: string;
      currentConversationId: string;
      messages: Message[];
      selectedModel: string;
      modelMapping: Record<string, string>;
      showRawResponse: boolean;
          isSearchEnabled?: boolean;
      selectedSearchEngine?: string;
      autoTitleGeneration: boolean;
      setCurrentSessionId: (id: string) => void;
      setCurrentConversationId: (id: string) => void;
      setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
      updateConversation: (id: string, updates: any) => void;
      setMessages: (messages: Message[]) => void;
      setIsLoading: (loading: boolean) => void;
      onChunk?: (chunk: string) => void;
      onStatus?: (stage: string, message: string) => void;
      onSources?: (data: { context_used?: any; sources?: any[]; retrieved_images?: string[] }) => void;
      onImage?: (imageUrl: string) => void;
    }
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    sessionId: string;
  }> {
    const {
      isAuthenticated,
      currentSessionId,
      messages,
      selectedModel,
      modelMapping,
      showRawResponse,
      isSearchEnabled,
      selectedSearchEngine,
      autoTitleGeneration,
      setCurrentSessionId,
      setCurrentConversationId,
      setConversations
    } = options;

    // Create session only when first message is sent (not on app load)
    let sessionId = currentSessionId;
    if (!sessionId) {
      if (isAuthenticated) {
        // For authenticated users, use backend-generated conversation ID
        const newConversation = await createConversation("New Chat");
        sessionId = newConversation.conversation_id;
        setCurrentSessionId(sessionId);
        setCurrentConversationId(sessionId);
        
        // Add to conversations list
        const conversation: Conversation = {
          id: sessionId,
          title: newConversation.title,
          lastMessage: new Date(),
          messageCount: 0,
          messages: []
        };
        setConversations(prev => [conversation, ...prev]);
      } else {
        // Create temporary session for unauthenticated users
        sessionId = `temp_${Date.now()}`;
        setCurrentSessionId(sessionId);
        setCurrentConversationId(sessionId);
        
        const newConversation: Conversation = {
          id: sessionId,
          title: "New Chat",
          lastMessage: new Date(),
          messageCount: 0,
          messages: []
        };
        setConversations(prev => [newConversation, ...prev]);
      }
    }

    // Note: User message will be persisted by the chat API (/api/chat)
    // when it processes the request, so we don't need to save it separately here.

    // Include conversation history for context
    const conversationHistory = messages.map(msg => {
      // Handle timestamp safely - fallback to created_at or current time if timestamp is missing/invalid
      // Cast to any to access created_at which might exist from chatStore
      const timeValue = msg.timestamp || (msg as any).created_at || new Date();
      let isoTime;
      try {
        isoTime = new Date(timeValue).toISOString();
      } catch (e) {
        isoTime = new Date().toISOString();
      }

      return {
        role: msg.role,
        content: msg.content,
        timestamp: isoTime,
        model: msg.model
      };
    });

    // Get the actual model ID from the mapping for API calls
    // Try both prefixed and non-prefixed keys to be robust
    const providerPrefixedKey = request.provider ? `${request.provider}:${selectedModel}` : selectedModel;
    const modelIdForAPI = modelMapping[providerPrefixedKey] || modelMapping[selectedModel] || selectedModel;
    
    console.log(`🤖 Model resolution: '${selectedModel}' -> '${modelIdForAPI}' (using mapping: ${!!(modelMapping[providerPrefixedKey] || modelMapping[selectedModel])})`);

    // Create a signal for the request - either use the provided one or create a new one
    const signal = request.signal || new AbortController().signal;

    // Check if the message is an image generation request
    const lowerMsg = request.message.toLowerCase();
    const isImageGenerationRequest = 
      (lowerMsg.startsWith("generate image") || 
       lowerMsg.startsWith("create image") || 
       lowerMsg.startsWith("draw ") ||
       lowerMsg.includes("generate an image") ||
       lowerMsg.includes("create an image")) &&
      (selectedModel.includes("dall-e") || 
       selectedModel.includes("image") || 
       selectedModel.includes("flux") ||
       selectedModel.toLowerCase().includes("nano banana") ||
       selectedModel.toLowerCase().includes("imagen"));

    let processedResponse = "";
    let generatedImageUrl: string | undefined;
    let sourcesPayload: { context_used?: any; sources?: any[]; retrieved_images?: string[] } = {};

    if (isImageGenerationRequest) {
      console.log("🎨 Image generation intent detected in ChatService");
      try {
        // Use the generateImage API instead of chat
        const imageUrl = await generateImage({
          message: request.message,
          provider: request.provider,
          model: modelIdForAPI,
          api_key: request.api_key || ""
        }, sessionId);
        processedResponse = `![Generated Image](${imageUrl})`;
        generatedImageUrl = imageUrl;
      } catch (error: any) {
        console.error("Image generation failed:", error);
        processedResponse = `Failed to generate image: ${error.message || "Unknown error"}`;
      }
    } else {
      // Stream via SSE — tokens animate live, status stages the placeholder, sources
      // carry the multimodal context for citations/badges/retrieved images.
      let streamError: Error | null = null;
      await streamChat({
        message: request.message,
        provider: request.provider,
        model: modelIdForAPI,
        api_key: "",
        conversation_history: conversationHistory,
        show_raw_response: showRawResponse,
        signal: signal,
        conversation_id: sessionId, // Pass conversation ID to backend
        file_references: request.file_references || [],
        web_search: isSearchEnabled ?? false,
        search_provider: selectedSearchEngine ?? "duckduckgo",
        is_image_mode: request.is_image_mode ?? false,
      }, {
        onToken: (token) => {
          processedResponse += token;
          options.onChunk?.(token);
        },
        onStatus: (stage, msg) => options.onStatus?.(stage, msg),
        onSources: (data) => {
          sourcesPayload = data;
          options.onSources?.(data);
        },
        onImage: (url) => options.onImage?.(url),
        onError: (err) => { streamError = err; },
      }, signal);

      if (streamError) throw streamError;
    }

    // Note: Assistant message is already persisted by the chat API (/api/chat)
    // when it returns the response, so we don't need to save it separately here.

    // Debug logging for title generation
    console.log(`🎯 Frontend Title Check: sessionId=${sessionId}, messages.length=${messages.length}, autoTitleGeneration=${autoTitleGeneration}, isAuthenticated=${isAuthenticated}`);
    console.log(`   Message preview: '${request.message.substring(0,100)}${request.message.length > 100 ? '...' : ''}'`);

    // Auto-generate title after first user message
    // Check if this is the first user message in the conversation
    const userMessagesCount = messages.filter(m => m.role === "user").length;
    const isFirstUserMessage = userMessagesCount === 0;
    
    // Auto-trigger background title generation in backend for first user message
    if (autoTitleGeneration && isFirstUserMessage && isAuthenticated) {
      console.log(`✅ Frontend: Triggering backend title generation for first user message (total messages: ${messages.length}, user messages: ${userMessagesCount})`);
      // Trigger backend title generation asynchronously (non-blocking)
      generateConversationTitle(sessionId).catch(error => {
        console.error("Failed to trigger backend title generation:", error);
      });
    } else {
      console.log(`❌ Frontend: Skipping title generation (not first user message or not authenticated: total=${messages.length}, user=${userMessagesCount}, authenticated=${isAuthenticated})`);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: request.message,
      timestamp: new Date(),
    };

    const contextUsed = sourcesPayload.context_used || {};
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: processedResponse,
      timestamp: new Date(),
      model: selectedModel,
      ...(generatedImageUrl ? { generatedImageUrl } : {}),
      sources: sourcesPayload.sources || [],
      retrievedImages: sourcesPayload.retrieved_images || [],
      context_used: contextUsed,
      searchUsed: !!contextUsed.web_search,
      documentsReferenced: !!contextUsed.rag,
      memoryUsed: !!contextUsed.memory,
    } as Message;

    return {
      userMessage,
      assistantMessage,
      sessionId
    };
  }

  static async stopMessage(abortController: AbortController | null, setIsLoading: (loading: boolean) => void) {
    if (abortController) {
      abortController.abort(); // Abort the ongoing request
      setIsLoading(false); // Immediately stop loading state
    }
  }
}
