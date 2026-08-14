import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  created_at: string;
  timestamp?: Date;
  isLoading?: boolean;
  generatedImageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  isBackendConfirmed?: boolean;
  metadata?: Record<string, any>;
}

interface ChatStore {
  // Active conversation state
  activeChatId: string | null;
  conversations: Record<string, Conversation>;

  // UI refresh signal — incremented on mutations to force sidebar re-render
  sidebarVersion: number;

  // Loading states
  imageGenerationLoading: boolean;
  conversationCreationLoading: boolean;
  isLoadingMessages: Record<string, boolean>;

  // Error handling
  lastError: Error | null;
  retryableOperations: Map<string, () => Promise<void>>;

  // Background processing
  processingImages: Set<string>;

  // Shared artifact (created from sidebar "..." menu, displayed in ArtifactDrawer)
  artifact: any | null;
  setArtifact: (a: any | null) => void;

  // Actions
  setActiveChat: (chatId: string) => void;
  createNewChat: () => string;
  addMessage: (chatId: string, message: Message) => Promise<string>; // Returns the actual conversation ID (may change if backend syncs)
  updateConversationTitle: (chatId: string, title: string) => Promise<void>;
  updateConversation: (chatId: string, updates: Partial<Conversation>) => void;
  streamMessageChunk: (chatId: string, messageId: string, chunk: string) => void;
  finalizeMessage: (chatId: string, messageId: string, fields: Partial<Message> & Record<string, any>) => void;
  deleteConversation: (chatId: string) => Promise<void>;
  ensureConversation: () => Promise<string>;

  // Loading state actions
  startImageGeneration: (conversationId: string) => void;
  completeImageGeneration: (conversationId: string) => void;
  startConversationCreation: () => void;
  completeConversationCreation: () => void;

  // Error handling actions
  setError: (error: Error) => void;
  clearError: () => void;
  addRetryableOperation: (key: string, operation: () => Promise<void>) => void;
  removeRetryableOperation: (key: string) => void;
  retryOperation: (key: string) => Promise<void>;

  // Background processing actions
  addProcessingImage: (imageUrl: string) => void;
  removeProcessingImage: (imageUrl: string) => void;
  isImageProcessing: (imageUrl: string) => boolean;

  // Recovery actions
  recoverConversation: (chatId: string) => Promise<boolean>;
  validateConversationState: (chatId: string) => boolean;

  // Sidebar actions
  incrementSidebarVersion: () => void;
  loadMessagesForConversation: (chatId: string) => Promise<void>;
  refreshConversationList: () => Promise<void>;

  // Getters
  getActiveConversation: () => Conversation | null;
  getActiveMessages: () => Message[];
}

export const useChatStore = create<ChatStore>()(
  (set, get) => ({
      // Initial state
      activeChatId: null,
      conversations: {},

      // Loading states
      imageGenerationLoading: false,
      conversationCreationLoading: false,
      sidebarVersion: 0,
      isLoadingMessages: {},

      // Error handling
      lastError: null,
      retryableOperations: new Map(),
      artifact: null,
      setArtifact: (a) => set({ artifact: a }),

      // Background processing
      processingImages: new Set(),
      
      // Sidebar version — incremented to force sidebar re-render after mutations
      incrementSidebarVersion: () => {
        set(state => ({ sidebarVersion: state.sidebarVersion + 1 }));
      },

      // Load messages for a conversation from the backend
      loadMessagesForConversation: async (chatId: string) => {
        // Skip frontend-only conversations (no backend data to load)
        const conv = get().conversations[chatId];
        if (!conv?.isBackendConfirmed) return;

        set(state => ({
          isLoadingMessages: { ...state.isLoadingMessages, [chatId]: true }
        }));

        try {
          const { getConversationWithFiles } = await import('@/utils/api');
          const { messages: backendMessages } = await getConversationWithFiles(chatId);

          if (backendMessages && backendMessages.length > 0) {
            const state = get();
            const conversation = state.conversations[chatId];
            if (conversation) {
              const formattedMessages = backendMessages.map((msg: any) => ({
                id: msg.id?.toString() || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: (msg.role === 'user' || msg.role === 'assistant') ? msg.role : 'user',
                content: msg.content || '',
                created_at: msg.created_at || msg.timestamp || new Date().toISOString(),
                // Restore persisted attachments so the bubble shows them after reload.
                fileAttachments: msg.metadata?.attachments || undefined,
              }));

              set(state => ({
                conversations: {
                  ...state.conversations,
                  [chatId]: {
                    ...conversation,
                    messages: formattedMessages,
                    isBackendConfirmed: true,
                  },
                },
              }));
            }
          }
        } catch (error) {
          console.error(`Failed to load messages for conversation ${chatId}:`, error);
        } finally {
          set(state => ({
            isLoadingMessages: { ...state.isLoadingMessages, [chatId]: false }
          }));
        }
      },

      // Refresh the conversation list from the backend, merging with existing state
      refreshConversationList: async () => {
        try {
          const { getUserSessions } = await import('@/utils/api');
          const sessions = await getUserSessions();

          const state = get();
          const updatedConversations = { ...state.conversations };

          sessions.forEach((session: any) => {
            const existingConv = updatedConversations[session.session_id];
            if (existingConv) {
              // Update title/metadata but keep existing messages
              updatedConversations[session.session_id] = {
                ...existingConv,
                title: session.title,
              };
            } else {
              // Add new conversation with empty messages
              updatedConversations[session.session_id] = {
                id: session.session_id,
                title: session.title,
                messages: [],
                created_at: session.last_activity || new Date().toISOString(),
              };
            }
          });

          set({ conversations: updatedConversations });
          get().incrementSidebarVersion();
        } catch (error) {
          console.error('Failed to refresh conversation list:', error);
        }
      },

      // WebSocket state
      websocketConnected: false,
      
      // Set active chat
      setActiveChat: (chatId: string) => {
        // Validate it's a string, not a Promise or other object
        if (typeof chatId !== 'string') {
          console.error('setActiveChat: Invalid chatId type:', typeof chatId, chatId);
          return;
        }
        
        // Check for corrupted IDs like [object Promise]
        if (chatId.includes('[object')) {
          console.error('setActiveChat: Corrupted chatId:', chatId);
          return;
        }
        
        set({ activeChatId: chatId });
      },
      
      // Create new chat — frontend-only until first message
      createNewChat: () => {
        const state = get();
        
        // Find existing empty conversation (title = "New Chat" and no messages)
        const emptyConv = Object.values(state.conversations).find(
          conv => conv.title === 'New Chat' && conv.messages.length === 0
        );
        
        if (emptyConv) {
          // Activate existing empty conversation instead of creating new one
          set({ activeChatId: emptyConv.id });
          return emptyConv.id;
        }
        
        // Create frontend-only conversation — backend creation deferred to addMessage
        const chatId = `conv_${Date.now()}`;
        const newConversation: Conversation = {
          id: chatId,
          title: 'New Chat',
          messages: [],
          created_at: new Date().toISOString(),
        };

        set(state => ({
          activeChatId: chatId,
          conversations: {
            ...state.conversations,
            [chatId]: newConversation,
          },
        }));
        get().incrementSidebarVersion();
        return chatId;
      },
      
      // Add message to conversation with backend creation on first message
      addMessage: async (chatId: string, message: Message) => {
        // Start loading state (will disable chat input)
        get().startConversationCreation();
        
        try {
          const state = get();
          const conversation = state.conversations[chatId];
          // Only create in backend if it's the first message AND not already confirmed
          const isFirstUserMessage = conversation && 
                                     conversation.messages.length === 0 && 
                                     message.role === 'user' &&
                                     !conversation.isBackendConfirmed;
          
          let backendConversationId = chatId;
          
          // Create conversation in backend on first user message
          if (isFirstUserMessage) {
            try {
              const { createConversation } = await import('@/utils/api');
              // Pass the frontend conversation ID to backend
              const response = await createConversation('New Chat', chatId, conversation.metadata);
              backendConversationId = response.conversation_id;
              
              console.log(`✅ Created conversation in backend: ${chatId} -> ${backendConversationId}`, 
                         response.exists ? '(already existed)' : '(new)');
              
              // Update frontend with backend ID if different
              if (backendConversationId !== chatId) {
                // Replace frontend ID with backend ID
                set(state => {
                  const { [chatId]: oldConv, ...otherConvs } = state.conversations;
                  if (!oldConv) return state;
                  
                  return {
                    activeChatId: backendConversationId,
                    conversations: {
                      ...otherConvs,
                      [backendConversationId]: {
                        ...oldConv,
                        id: backendConversationId,
                        isBackendConfirmed: true,
                      },
                    },
                  };
                });
              } else {
                // If IDs match, just mark as confirmed
                set(state => {
                  const currConv = state.conversations[chatId];
                  if (!currConv) return state;
                  return {
                    conversations: {
                      ...state.conversations,
                      [chatId]: {
                        ...currConv,
                        isBackendConfirmed: true,
                      }
                    }
                  };
                });
              }
              
              // Force sidebar re-render since conversation ID may have changed
              get().incrementSidebarVersion();
            } catch (error) {
              console.error('❌ Failed to create conversation in backend:', error);
              // Continue with frontend-only conversation
            }
          }
          
          // Process message for frontend store
          const processedMessage: Message = message.id ? message : {
            ...message,
            id: crypto.randomUUID(),
            created_at: message.created_at || new Date().toISOString(),
          };
          
          // Update frontend store with message
          set(state => {
            const conv = state.conversations[backendConversationId] || 
                        (conversation ? { ...conversation, id: backendConversationId } : null);
            
            if (!conv) {
              // Create conversation if it doesn't exist
              const newConversation: Conversation = {
                id: backendConversationId,
                title: 'New Chat',
                messages: [processedMessage],
                created_at: new Date().toISOString(),
              };
              
              return {
                conversations: {
                  ...state.conversations,
                  [backendConversationId]: newConversation,
                },
              };
            }
            
            // Enhanced duplicate detection
            const isDuplicate = conv.messages.some(msg => {
              if (processedMessage.id && msg.id === processedMessage.id) return true;
              
              const timeDiff = Math.abs(
                new Date(msg.created_at).getTime() - new Date(processedMessage.created_at).getTime()
              );
              
              return (
                msg.role === processedMessage.role &&
                msg.content === processedMessage.content &&
                timeDiff < 2000
              );
            });
            
            if (isDuplicate) {
              console.log(`🔄 Skipping duplicate message: ${processedMessage.content.substring(0, 50)}...`);
              return state;
            }
            
          // Generates title locally first so it shows up in the sidebar instantly (replaces removed SSE logic)
          if (conv.title === 'New Chat' && processedMessage.role === 'user') {
            import('@/utils/chatUtils').then(({ generateChatTitle }) => {
              const allMessages = [...conv.messages, processedMessage];
              const title = generateChatTitle(allMessages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at,
                metadata: {}
              })));
              
              if (title !== 'New Chat') {
                get().updateConversationTitle(backendConversationId, title);
              }
            }).catch(err => {
              console.error('Failed to generate local title:', err);
            });
          }
            
            return {
              conversations: {
                ...state.conversations,
                [backendConversationId]: {
                  ...conv,
                  messages: [...conv.messages, processedMessage].sort((a, b) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  ),
                },
              },
            };
          });
          
          // Force sidebar refresh after adding message
          get().incrementSidebarVersion();
          
          return backendConversationId;
          
        } catch (error) {
          console.error('❌ Error in addMessage:', error);
          get().setError(error as Error);
          throw error;
        } finally {
          // Complete loading state (re-enables chat input)
          get().completeConversationCreation();
        }
      },
      
      // Update conversation title with backend API integration
      updateConversation: (chatId: string, updates: Partial<Conversation>) => {
        set(state => {
          const conversation = state.conversations[chatId];
          if (!conversation) return state;
          
          return {
            conversations: {
              ...state.conversations,
              [chatId]: {
                ...conversation,
                ...updates,
              },
            },
          };
        });
      },

      streamMessageChunk: (chatId: string, messageId: string, chunk: string) => {
        set(state => {
          const conversation = state.conversations[chatId];
          if (!conversation) return state;

          const messages = [...conversation.messages];
          const messageIndex = messages.findIndex(m => m.id === messageId);

          if (messageIndex > -1) {
            const message = messages[messageIndex];
            if (message) {
              messages[messageIndex] = {
                ...message,
                content: message.content + chunk,
                isLoading: true, // streaming — shows the cursor / progress in the UI
                timestamp: message.timestamp || new Date(), // Maintain original timestamp if exists
              };
            }
          } else {
            // If message doesn't exist yet, create it
            messages.push({
              id: messageId,
              role: 'assistant',
              content: chunk,
              isLoading: true,
              created_at: new Date().toISOString(),
            });
          }

          return {
            conversations: {
              ...state.conversations,
              [chatId]: {
                ...conversation,
                messages,
              },
            },
          };
        });
      },

      // Finalize a streaming assistant message: clear the loading flag and attach the
      // multimodal context (sources, context_used, retrieved images, badges).
      finalizeMessage: (chatId: string, messageId: string, fields: Partial<Message> & Record<string, any>) => {
        set(state => {
          const conversation = state.conversations[chatId];
          if (!conversation) return state;
          const messages = conversation.messages.map(m =>
            m.id === messageId ? { ...m, ...fields, isLoading: false } : m
          );
          return {
            conversations: {
              ...state.conversations,
              [chatId]: { ...conversation, messages },
            },
          };
        });
      },

      updateConversationTitle: async (chatId: string, title: string) => {
        try {
          // First, try to update in backend
          const { updateConversationTitleInBackend } = await import('@/utils/api');
          await updateConversationTitleInBackend(chatId, title);
          
          // If successful, update frontend store
          set(state => {
            const conversation = state.conversations[chatId];
            if (!conversation) return state;
            
            return {
              conversations: {
                ...state.conversations,
                [chatId]: {
                  ...conversation,
                  title,
                },
              },
            };
          });
          
          console.log(`✅ Conversation title updated in backend: ${chatId} -> "${title}"`);
          
          // Force sidebar re-render after title update
          get().incrementSidebarVersion();
        } catch (error) {
          console.error(`❌ Failed to update conversation title in backend:`, error);
          
          // Fallback: update frontend only
          set(state => {
            const conversation = state.conversations[chatId];
            if (!conversation) return state;
            
            return {
              conversations: {
                ...state.conversations,
                [chatId]: {
                  ...conversation,
                  title,
                },
              },
            };
          });
          
          get().incrementSidebarVersion();
          throw error; // Re-throw for error handling in UI
        }
      },
      
      // Delete conversation with backend API integration
      deleteConversation: async (chatId: string) => {
        // Validation for corrupted IDs
        const isCorrupted = typeof chatId !== 'string' || chatId === '[object Object]' || chatId.includes('[object');
        
        if (!isCorrupted) {
          try {
            // First, try to delete from backend
            const { deleteConversationFromBackend } = await import('@/utils/api');
            await deleteConversationFromBackend(chatId);
            console.log(`✅ Conversation ${chatId} deleted from backend`);
          } catch (error: any) {
            // If not found (404), treat as success/already deleted and proceed to local cleanup
            const isNotFound = error?.status === 404 || error?.message?.includes('404') || error?.response?.detail === 'Conversation not found';
            
            if (isNotFound) {
               console.warn(`⚠️ Conversation ${chatId} not found in backend, removing locally`);
            } else {
               console.error(`❌ Failed to delete conversation ${chatId} from backend:`, error);
               // We proceed to local delete to ensure UI can recover
            }
          }
        } else {
           console.warn(`⚠️ Detected corrupted conversation ID: ${chatId}, removing locally only`);
        }

        // Always perform local cleanup to unblock UI
        set(state => {
          const newConversations = { ...state.conversations };
          
          // Standard delete
          delete newConversations[chatId];
          
          // Aggressive cleanup for corrupted IDs (key/value mismatch)
          if (isCorrupted) {
            Object.keys(newConversations).forEach(key => {
              const val = newConversations[key];
              // Delete if key is corrupted
              if (key.includes('[object')) {
                delete newConversations[key];
              }
              // Delete if value's ID matches the requested ID but key is different
              else if (val && val.id === chatId) {
                delete newConversations[key];
              }
            });
          }
          
          // If the deleted conversation was active, select another one or set to null
          let newActiveChatId = state.activeChatId;
          const isActiveChat = state.activeChatId && (
            state.activeChatId === chatId || 
            (isCorrupted && (!newConversations[state.activeChatId] || state.activeChatId.includes('[object')))
          );

          if (isActiveChat) {
            const remainingIds = Object.keys(newConversations);
            newActiveChatId = remainingIds.length > 0 ? remainingIds[0]! : null;
          }
          
          return {
            conversations: newConversations,
            activeChatId: newActiveChatId
          };
        });
        
        // Force sidebar re-render after deletion
        get().incrementSidebarVersion();
      },
      
      // Ensure active conversation exists
      ensureConversation: async () => {
        const state = get();
        let chatId = state.activeChatId;
        
        if (!chatId) {
          // Create new conversation if none exists
          const newChatId = `conv_${Date.now()}`;
          const newConversation: Conversation = {
            id: newChatId,
            title: 'New Chat',
            messages: [],
            created_at: new Date().toISOString(),
            isBackendConfirmed: false,
          };

          set((state) => ({
            activeChatId: newChatId,
            conversations: {
              ...state.conversations,
              [newChatId]: newConversation,
            },
          }));
          
          return newChatId;
        }
        
        return chatId;
      },
      
      // Get active conversation
      getActiveConversation: () => {
        const state = get();
        if (!state.activeChatId) return null;
        return state.conversations[state.activeChatId] || null;
      },
      
      // Loading state actions
      startImageGeneration: (conversationId: string) => {
        console.debug('image generation started for conversation', conversationId);
        set({ imageGenerationLoading: true });
      },

      completeImageGeneration: (conversationId: string) => {
        console.debug('image generation completed for conversation', conversationId);
        set({ imageGenerationLoading: false });
      },

      startConversationCreation: () => {
        set({ conversationCreationLoading: true });
      },

      completeConversationCreation: () => {
        set({ conversationCreationLoading: false });
      },

      // Error handling actions
      setError: (error: Error) => {
        set({ lastError: error });
      },

      clearError: () => {
        set({ lastError: null });
      },

      addRetryableOperation: (key: string, operation: () => Promise<void>) => {
        set(state => ({
          retryableOperations: new Map(state.retryableOperations).set(key, operation)
        }));
      },

      removeRetryableOperation: (key: string) => {
        set(state => {
          const newOperations = new Map(state.retryableOperations);
          newOperations.delete(key);
          return { retryableOperations: newOperations };
        });
      },

      retryOperation: async (key: string) => {
        const state = get();
        const operation = state.retryableOperations.get(key);
        if (operation) {
          try {
            await operation();
            get().removeRetryableOperation(key);
            get().clearError();
          } catch (error) {
            get().setError(error as Error);
            throw error;
          }
        }
      },

      // Background processing actions
      addProcessingImage: (imageUrl: string) => {
        set(state => ({
          processingImages: new Set(state.processingImages).add(imageUrl)
        }));
      },

      removeProcessingImage: (imageUrl: string) => {
        set(state => {
          const newSet = new Set(state.processingImages);
          newSet.delete(imageUrl);
          return { processingImages: newSet };
        });
      },

      isImageProcessing: (imageUrl: string) => {
        return get().processingImages.has(imageUrl);
      },

      // WebSocket actions
      // Recovery actions
      recoverConversation: async (chatId: string) => {
        try {
          // Attempt to reload conversation from backend
          const { getConversationHistory } = await import('@/utils/api');
          const response = await getConversationHistory(chatId);

          // Handle potentially nested response structure from backend
          // Backend returns { conversation: { ... } } or flat object depending on endpoint
          const conversationData = response.conversation || response;
          const messages = conversationData.messages;

          if (messages && Array.isArray(messages)) {
            // Update store with recovered data
            set(state => ({
              conversations: {
                ...state.conversations,
                [chatId]: {
                  id: chatId,
                  title: conversationData.title || 'Recovered Chat',
                  messages: messages,
                  created_at: conversationData.created_at || new Date().toISOString(),
                  isBackendConfirmed: true,
                },
              },
            }));
            return true;
          }
          return false;
        } catch (error) {
          if (error instanceof Error && (error.message.includes('Conversation not found') || error.message.includes('404'))) {
            return false; // expected for frontend-only convs, not an error
          }
          console.error('Failed to recover conversation:', error);
          return false;
        }
      },

      validateConversationState: (chatId: string) => {
        const state = get();
        const conversation = state.conversations[chatId];
        return !!(conversation && conversation.id && conversation.messages);
      },

      // Get active messages
      getActiveMessages: () => {
        const state = get();
        if (!state.activeChatId) return [];
        return state.conversations[state.activeChatId]?.messages || [];
      },
    })
  );

// Stable selector functions to prevent infinite loops
const selectActiveChatId = (state: ChatStore) => state.activeChatId;
const selectSetActiveChat = (state: ChatStore) => state.setActiveChat;
const selectCreateNewChat = (state: ChatStore) => state.createNewChat;
const selectAddMessage = (state: ChatStore) => state.addMessage;
const selectFinalizeMessage = (state: ChatStore) => state.finalizeMessage;
const selectImageGenerationLoading = (state: ChatStore) => state.imageGenerationLoading;
const selectConversationCreationLoading = (state: ChatStore) => state.conversationCreationLoading;
const selectLastError = (state: ChatStore) => state.lastError;
const selectProcessingImages = (state: ChatStore) => state.processingImages;
const selectStartImageGeneration = (state: ChatStore) => state.startImageGeneration;
const selectCompleteImageGeneration = (state: ChatStore) => state.completeImageGeneration;
const selectStartConversationCreation = (state: ChatStore) => state.startConversationCreation;
const selectCompleteConversationCreation = (state: ChatStore) => state.completeConversationCreation;
const selectSetError = (state: ChatStore) => state.setError;
const selectClearError = (state: ChatStore) => state.clearError;
const selectAddProcessingImage = (state: ChatStore) => state.addProcessingImage;
const selectRemoveProcessingImage = (state: ChatStore) => state.removeProcessingImage;
const selectIsImageProcessing = (state: ChatStore) => state.isImageProcessing;
const selectRecoverConversation = (state: ChatStore) => state.recoverConversation;
const selectValidateConversationState = (state: ChatStore) => state.validateConversationState;
export const selectConversations = (state: ChatStore) => state.conversations;
export const selectSidebarVersion = (state: ChatStore) => state.sidebarVersion;
export const selectIsLoadingMessages = (state: ChatStore) => state.isLoadingMessages;

const selectActiveConversation = (state: ChatStore): Conversation | null => {
  if (!state.activeChatId) return null;
  return state.conversations[state.activeChatId] || null;
};

const selectActiveMessages = (state: ChatStore): Message[] => {
  if (!state.activeChatId) return [];
  return state.conversations[state.activeChatId]?.messages || [];
};

// Export hooks for common use cases - with proper memoization to avoid infinite loops
export const useActiveChatId = () => useChatStore(selectActiveChatId);
export const useSetActiveChat = () => useChatStore(selectSetActiveChat);
export const useCreateNewChat = () => useChatStore(selectCreateNewChat);
export const useAddMessage = () => useChatStore(selectAddMessage);
export const useFinalizeMessage = () => useChatStore(selectFinalizeMessage);
export const useUpdateConversation = () => useChatStore(state => state.updateConversation);

export const useActiveConversation = (): Conversation | null => {
  return useChatStore(useShallow(selectActiveConversation));
};

export const useActiveMessages = (): Message[] => {
  return useChatStore(useShallow(selectActiveMessages));
};

// Export new hooks for enhanced functionality
export const useImageGenerationLoading = () => useChatStore(selectImageGenerationLoading);
export const useConversationCreationLoading = () => useChatStore(selectConversationCreationLoading);
export const useLastError = () => useChatStore(selectLastError);
export const useProcessingImages = () => useChatStore(selectProcessingImages);
export const useStartImageGeneration = () => useChatStore(selectStartImageGeneration);
export const useCompleteImageGeneration = () => useChatStore(selectCompleteImageGeneration);
export const useStartConversationCreation = () => useChatStore(selectStartConversationCreation);
export const useCompleteConversationCreation = () => useChatStore(selectCompleteConversationCreation);
export const useSetError = () => useChatStore(selectSetError);
export const useClearError = () => useChatStore(selectClearError);
export const useAddProcessingImage = () => useChatStore(selectAddProcessingImage);
export const useRemoveProcessingImage = () => useChatStore(selectRemoveProcessingImage);
export const useIsImageProcessing = () => useChatStore(selectIsImageProcessing);
export const useRecoverConversation = () => useChatStore(selectRecoverConversation);
export const useValidateConversationState = () => useChatStore(selectValidateConversationState);
export const useSidebarVersion = () => useChatStore(selectSidebarVersion);
export const useIsLoadingMessages = () => useChatStore(selectIsLoadingMessages);
export const useLoadMessagesForConversation = () => useChatStore(state => state.loadMessagesForConversation);
export const useRefreshConversationList = () => useChatStore(state => state.refreshConversationList);
