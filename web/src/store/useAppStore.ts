import { create } from 'zustand';
import { persist, devtools, subscribeWithSelector } from 'zustand/middleware';
import { AppStore } from './core/slices';
import { createChatSlice } from './slices/chatSlice';
import { getStoreConfig } from './core/config';

/**
 * Creates the main application store
 */
export const useAppStore = create<AppStore>()(
  persist(
    devtools(
      subscribeWithSelector((set, get, api) => ({
        // Store metadata
        _storeName: 'app-store',
        _version: 1,
        _initialized: false,
        
        // Initialize store
        initialize: () => {
          if (get()._initialized) return;
          set({ _initialized: true });
          console.log('App store initialized');
        },
        
        // Reset store
        reset: () => {
          // Reset all slices
          set({
            _initialized: true,
            // Note: Individual slices will need their own reset logic
          });
        },
        
        // Root actions
        update: (updates: Partial<AppStore>) => {
          set(updates);
        },
        
        batchUpdate: (updates: Partial<AppStore>[]) => {
          const currentState = get();
          const newState = updates.reduce((state, update) => ({ ...state, ...update }), currentState);
          set(newState);
        },
        
        // Include all slices
        ...createChatSlice(set as any, get as any, api as any),
      }),
      { name: 'AppStore' }
    ),
    {
      name: 'app-store',
      version: 1,
      partialize: (state) => ({
        // Only persist certain slices
        ui: state.ui,
        settings: state.settings,
        auth: state.auth,
      }),
      migrate: (persistedState: any, version: number) => {
        console.log(`Migrating store from version ${version}`);
        // Migration logic here
        return persistedState;
      },
    }
  )
 )
);

/**
 * Store hooks for common use cases
 */

// Chat store hooks
export const useActiveChatId = () => useAppStore((state) => state.chat.activeChatId);
export const useSetActiveChat = () => useAppStore((state) => state.chat.setActiveChat);
export const useCreateNewChat = () => useAppStore((state) => state.chat.createNewChat);
export const useAddMessage = () => useAppStore((state) => state.chat.addMessage);
export const useUpdateConversation = () => useAppStore((state) => state.chat.updateConversation);
export const useActiveConversation = () => useAppStore((state) => state.chat.activeConversation());
export const useActiveMessages = () => useAppStore((state) => state.chat.activeMessages());
export const useImageGenerationLoading = () => useAppStore((state) => state.chat.imageGenerationLoading);
export const useConversationCreationLoading = () => useAppStore((state) => state.chat.conversationCreationLoading);
export const useLastError = () => useAppStore((state) => state.chat.lastError);
export const useProcessingImages = () => useAppStore((state) => state.chat.processingImages);
export const useStartImageGeneration = () => useAppStore((state) => state.chat.startImageGeneration);
export const useCompleteImageGeneration = () => useAppStore((state) => state.chat.completeImageGeneration);
export const useStartConversationCreation = () => useAppStore((state) => state.chat.startConversationCreation);
export const useCompleteConversationCreation = () => useAppStore((state) => state.chat.completeConversationCreation);
export const useSetError = () => useAppStore((state) => state.chat.setError);
export const useClearError = () => useAppStore((state) => state.chat.clearError);
export const useAddProcessingImage = () => useAppStore((state) => state.chat.addProcessingImage);
export const useRemoveProcessingImage = () => useAppStore((state) => state.chat.removeProcessingImage);
export const useIsImageProcessing = () => useAppStore((state) => state.chat.isImageProcessing);
export const useRecoverConversation = () => useAppStore((state) => state.chat.recoverConversation);
export const useValidateConversationState = () => useAppStore((state) => state.chat.validateConversationState);

// Store initialization utility
export function initializeAppStore() {
  const store = useAppStore.getState();
  if (!store._initialized) {
    store.initialize();
  }
}

// Store reset utility
export function resetAppStore() {
  useAppStore.getState().reset();
}

// Store subscription utility
export function subscribeToStore(
  selector: (state: AppStore) => any,
  listener: (selectedState: any) => void
) {
  return useAppStore.subscribe(selector, listener);
}

// Store debug utility
export function debugAppStore() {
  if (process.env.NODE_ENV === 'development') {
    const state = useAppStore.getState();
    console.log('App Store State:', state);
    return state;
  }
  return null;
}