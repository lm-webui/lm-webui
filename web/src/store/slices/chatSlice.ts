import { StateCreator } from 'zustand';
import { ChatSlice, AppStore } from '../core/slices';
import { ChatMessage, ChatConversation } from '@/types/core';
import { toChatMessage, toChatConversation } from '@/types/core';

export const initialChatState = {
  conversations: {} as Record<string, ChatConversation>,
  activeChatId: null as string | null,
  conversationCreationLoading: false,
  imageGenerationLoading: false,
  processingImages: [] as string[],
  lastError: null as string | null,
  _initialized: false,
};

export const createChatSlice: StateCreator<AppStore, [], [], { chat: ChatSlice }> = (set, get) => ({
  chat: {
  ...initialChatState,
  
  initialize: () => {
    if (get().chat._initialized) return;
    set(state => ({
      chat: {
        ...state.chat,
        _initialized: true,
      },
    }));
  },
  
  reset: () => {
    set(state => ({
      chat: {
        ...initialChatState,
        _initialized: true,
      },
    }));
  },
  
  setActiveChat: (chatId: string) => {
    set(state => ({
      chat: {
        ...state.chat,
        activeChatId: chatId,
      },
    }));
  },
  
  createNewChat: () => {
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConversation: ChatConversation = {
      id: chatId,
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    
    set(state => ({
      chat: {
        ...state.chat,
        conversations: {
          ...state.chat.conversations,
          [chatId]: newConversation,
        },
        activeChatId: chatId,
      },
    }));
    
    return chatId;
  },
  
  addMessage: (chatId: string, message: ChatMessage) => {
    const chatMessage = toChatMessage(message);
    
    set(state => {
      const conversation = state.chat.conversations[chatId];
      if (!conversation) return state;
      
      const updatedConversation: ChatConversation = {
        ...conversation,
        messages: [...conversation.messages, chatMessage],
        updatedAt: new Date().toISOString(),
        messageCount: (conversation.messageCount || conversation.messages.length) + 1,
      };
      
      return {
        chat: {
          ...state.chat,
          conversations: {
            ...state.chat.conversations,
            [chatId]: updatedConversation,
          },
        },
      };
    });
  },
  
  updateConversation: (conversationId: string, updates: Partial<ChatConversation>) => {
    set(state => {
      const conversation = state.chat.conversations[conversationId];
      if (!conversation) return state;
      
      const updatedConversation: ChatConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      
      return {
        chat: {
          ...state.chat,
          conversations: {
            ...state.chat.conversations,
            [conversationId]: updatedConversation,
          },
        },
      };
    });
  },
  
  streamMessageChunk: (chatId: string, chunk: string, messageId?: string) => {
    set(state => {
      const conversation = state.chat.conversations[chatId];
      if (!conversation) return state;
      
      const messages = [...conversation.messages];
      let lastMessage = messages[messages.length - 1];
      
      if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.isLoading !== true) {
        // Create new assistant message
        const newMessage: ChatMessage = {
          id: messageId || `msg_${Date.now()}`,
          role: 'assistant',
          content: chunk,
          createdAt: new Date().toISOString(),
          isLoading: true,
        };
        
        messages.push(newMessage);
      } else {
        // Append to existing assistant message
        lastMessage = {
          ...lastMessage,
          content: lastMessage.content + chunk,
        };
        messages[messages.length - 1] = lastMessage;
      }
      
      const updatedConversation: ChatConversation = {
        ...conversation,
        messages,
        updatedAt: new Date().toISOString(),
      };
      
      return {
        chat: {
          ...state.chat,
          conversations: {
            ...state.chat.conversations,
            [chatId]: updatedConversation,
          },
        },
      };
    });
  },
  
  startImageGeneration: () => {
    set(state => ({
      chat: {
        ...state.chat,
        imageGenerationLoading: true,
      },
    }));
  },
  
  completeImageGeneration: () => {
    set(state => ({
      chat: {
        ...state.chat,
        imageGenerationLoading: false,
      },
    }));
  },
  
  startConversationCreation: () => {
    set(state => ({
      chat: {
        ...state.chat,
        conversationCreationLoading: true,
      },
    }));
  },
  
  completeConversationCreation: () => {
    set(state => ({
      chat: {
        ...state.chat,
        conversationCreationLoading: false,
      },
    }));
  },
  
  setError: (error: string) => {
    set(state => ({
      chat: {
        ...state.chat,
        lastError: error,
      },
    }));
  },
  
  clearError: () => {
    set(state => ({
      chat: {
        ...state.chat,
        lastError: null,
      },
    }));
  },
  
  addProcessingImage: (imageId: string) => {
    set(state => ({
      chat: {
        ...state.chat,
        processingImages: [...state.chat.processingImages, imageId],
      },
    }));
  },
  
  removeProcessingImage: (imageId: string) => {
    set(state => ({
      chat: {
        ...state.chat,
        processingImages: state.chat.processingImages.filter(id => id !== imageId),
      },
    }));
  },
  
  recoverConversation: (conversationId: string) => {
    // Implementation for conversation recovery
    console.log(`Recovering conversation: ${conversationId}`);
  },
  
  validateConversationState: (conversationId: string) => {
    const conversation = get().chat.conversations[conversationId];
    if (!conversation) return false;
    
    // Basic validation
    return !!conversation.id && 
           !!conversation.title && 
           Array.isArray(conversation.messages);
  },
  
  // Selectors (computed properties)
  activeConversation: () => {
    const { activeChatId, conversations } = get().chat;
    return activeChatId ? conversations[activeChatId] : null;
  },
  
  activeMessages: () => {
    const conversation = get().chat.activeConversation();
    return conversation?.messages || [];
  },
  
  isImageProcessing: (imageId: string) => {
    return get().chat.processingImages.includes(imageId);
  },
}});