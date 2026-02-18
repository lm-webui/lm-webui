import { create } from 'zustand';
import { authFetch } from "../utils/api";

interface ContextItem {
  id: string;
  content: string;
  similarity?: number;
  metadata?: any;
  filename?: string;
  type?: string;
  role?: string;
  created_at?: string;
}

interface ContextState {
  // Active context for current conversation
  activeContext: {
    summaries: ContextItem[];
    recent_messages: ContextItem[];
    file_chunks: ContextItem[];
    total_items: number;
    has_context: boolean;
  } | null;

  // Loading states
  contextLoading: boolean;
  memoryDeleting: boolean;

  // Error handling
  lastError: Error | null;

  // Actions
  fetchActiveContext: (conversationId: string) => Promise<void>;
  forgetMemory: (conversationId: string, memoryId: string) => Promise<void>;
  clearContext: () => void;

  // Loading state actions
  setContextLoading: (loading: boolean) => void;
  setMemoryDeleting: (deleting: boolean) => void;

  // Error handling actions
  setError: (error: Error) => void;
  clearError: () => void;
}

export const useContextStore = create<ContextState>()(
  (set, get) => ({
      // Initial state
      activeContext: null,
      contextLoading: false,
      memoryDeleting: false,
      lastError: null,

      // Fetch active context for a conversation
      fetchActiveContext: async (conversationId: string) => {
        try {
          set({ contextLoading: true, lastError: null });

          const contextData = await authFetch(`/api/context/${conversationId}`);

          set({
            activeContext: {
              summaries: contextData.summaries || [],
              recent_messages: contextData.recent_messages || [],
              file_chunks: contextData.file_chunks || [],
              total_items: contextData.total_items || 0,
              has_context: contextData.has_context || false,
            },
            contextLoading: false,
          });

        } catch (error) {
          console.error('Failed to fetch context:', error);
          set({
            lastError: error as Error,
            contextLoading: false,
            activeContext: {
              summaries: [],
              recent_messages: [],
              file_chunks: [],
              total_items: 0,
              has_context: false,
            },
          });
        }
      },

      // Forget/remove a specific memory item
      forgetMemory: async (conversationId: string, memoryId: string) => {
        try {
          set({ memoryDeleting: true, lastError: null });

          await authFetch(`/api/context/${conversationId}/memory/${memoryId}`, {
            method: 'DELETE',
          });

          // Refresh context after deletion
          await get().fetchActiveContext(conversationId);
          set({ memoryDeleting: false });

        } catch (error) {
          console.error('Failed to forget memory:', error);
          set({
            lastError: error as Error,
            memoryDeleting: false,
          });
        }
      },

      // Clear current context
      clearContext: () => {
        set({
          activeContext: null,
          lastError: null,
        });
      },

      // Loading state setters
      setContextLoading: (loading: boolean) => {
        set({ contextLoading: loading });
      },

      setMemoryDeleting: (deleting: boolean) => {
        set({ memoryDeleting: deleting });
      },

      // Error handling
      setError: (error: Error) => {
        set({ lastError: error });
      },

      clearError: () => {
        set({ lastError: null });
      },
    })
  );

// Export hooks for common use cases
export const useActiveContext = () => useContextStore(state => state.activeContext);
export const useContextLoading = () => useContextStore(state => state.contextLoading);
export const useMemoryDeleting = () => useContextStore(state => state.memoryDeleting);
export const useContextError = () => useContextStore(state => state.lastError);
export const useFetchActiveContext = () => useContextStore(state => state.fetchActiveContext);
export const useForgetMemory = () => useContextStore(state => state.forgetMemory);
export const useClearContext = () => useContextStore(state => state.clearContext);
