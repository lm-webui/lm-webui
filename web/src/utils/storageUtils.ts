// ==================== SESSION STORAGE UTILITIES ====================

export const DRAFT_STORAGE_KEYS = {
  CHAT_DRAFT: 'chat_draft',
  CONVERSATION_DRAFT: (conversationId: string) => `draft_${conversationId}`,
  UNSENT_MESSAGE: (conversationId: string) => `unsent_${conversationId}`,
} as const;

export const saveDraftMessage = (
  conversationId: string,
  content: string,
  metadata?: {
    cursorPosition?: number;
    timestamp?: number;
    attachments?: Array<{ type: string; data: string }>;
  }
): void => {
  try {
    const draft = {
      content,
      metadata: metadata || {},
      savedAt: Date.now(),
      conversationId,
    };
    
    sessionStorage.setItem(
      DRAFT_STORAGE_KEYS.CONVERSATION_DRAFT(conversationId),
      JSON.stringify(draft)
    );
    
    console.log(`💾 Saved draft for conversation ${conversationId}`);
  } catch (error) {
    console.error('Failed to save draft message:', error);
  }
};

export const loadDraftMessage = (
  conversationId: string
): {
  content: string;
  metadata: any;
  savedAt: number;
  conversationId: string;
} | null => {
  try {
    const draftJson = sessionStorage.getItem(
      DRAFT_STORAGE_KEYS.CONVERSATION_DRAFT(conversationId)
    );
    
    if (!draftJson) return null;
    
    const draft = JSON.parse(draftJson);
    
    // Validate the draft hasn't expired (optional: 24-hour expiration)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (Date.now() - draft.savedAt > TWENTY_FOUR_HOURS) {
      clearDraftMessage(conversationId);
      return null;
    }
    
    return draft;
  } catch (error) {
    console.error('Failed to load draft message:', error);
    return null;
  }
};

export const clearDraftMessage = (conversationId: string): void => {
  try {
    sessionStorage.removeItem(
      DRAFT_STORAGE_KEYS.CONVERSATION_DRAFT(conversationId)
    );
    sessionStorage.removeItem(
      DRAFT_STORAGE_KEYS.UNSENT_MESSAGE(conversationId)
    );
    console.log(`🗑️ Cleared draft for conversation ${conversationId}`);
  } catch (error) {
    console.error('Failed to clear draft message:', error);
  }
};

export const saveUnsentMessage = (
  conversationId: string,
  message: string
): void => {
  try {
    const unsent = {
      message,
      savedAt: Date.now(),
      conversationId,
    };
    
    sessionStorage.setItem(
      DRAFT_STORAGE_KEYS.UNSENT_MESSAGE(conversationId),
      JSON.stringify(unsent)
    );
  } catch (error) {
    console.error('Failed to save unsent message:', error);
  }
};

export const loadAndClearUnsentMessage = (
  conversationId: string
): string | null => {
  try {
    const unsentJson = sessionStorage.getItem(
      DRAFT_STORAGE_KEYS.UNSENT_MESSAGE(conversationId)
    );
    
    if (!unsentJson) return null;
    
    const unsent = JSON.parse(unsentJson);
    
    // Clear immediately after loading (one-time recovery)
    sessionStorage.removeItem(
      DRAFT_STORAGE_KEYS.UNSENT_MESSAGE(conversationId)
    );
    
    // Validate freshness (only recover messages from last 5 minutes)
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (Date.now() - unsent.savedAt > FIVE_MINUTES) {
      return null;
    }
    
    return unsent.message;
  } catch (error) {
    console.error('Failed to load unsent message:', error);
    return null;
  }
};

export const clearAllDrafts = (): void => {
  try {
    const keysToRemove: string[] = [];
    
    // Find all draft and unsent message keys
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('draft_') || key.startsWith('unsent_'))) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    console.log(`🗑️ Cleared ${keysToRemove.length} draft messages`);
  } catch (error) {
    console.error('Failed to clear all drafts:', error);
  }
};

// ==================== LOCAL STORAGE UTILITIES ====================

export const LOCAL_STORAGE_KEYS = {
  UI_PREFERENCES: 'ui-preferences', // Managed by Zustand uiStore
  LAST_ACTIVE_CONVERSATION: 'last_active_conversation',
  RECENT_MODELS: 'recent_models',
  COLLAPSED_SECTIONS: 'collapsed_sections',
} as const;

export const saveLastActiveConversation = (conversationId: string): void => {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEYS.LAST_ACTIVE_CONVERSATION,
      conversationId
    );
  } catch (error) {
    console.error('Failed to save last active conversation:', error);
  }
};

export const loadLastActiveConversation = (): string | null => {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_ACTIVE_CONVERSATION);
  } catch (error) {
    console.error('Failed to load last active conversation:', error);
    return null;
  }
};

export const clearLastActiveConversation = (): void => {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.LAST_ACTIVE_CONVERSATION);
  } catch (error) {
    console.error('Failed to clear last active conversation:', error);
  }
};

export const saveRecentModels = (models: string[]): void => {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEYS.RECENT_MODELS,
      JSON.stringify(models.slice(0, 10)) // Keep only last 10
    );
  } catch (error) {
    console.error('Failed to save recent models:', error);
  }
};

export const loadRecentModels = (): string[] => {
  try {
    const modelsJson = localStorage.getItem(LOCAL_STORAGE_KEYS.RECENT_MODELS);
    if (!modelsJson) return [];
    
    const models = JSON.parse(modelsJson);
    return Array.isArray(models) ? models : [];
  } catch (error) {
    console.error('Failed to load recent models:', error);
    return [];
  }
};

export const addRecentModel = (modelId: string): void => {
  try {
    const recentModels = loadRecentModels();
    
    // Remove if already exists (to move to front)
    const filteredModels = recentModels.filter(id => id !== modelId);
    
    // Add to beginning and limit to 10
    const updatedModels = [modelId, ...filteredModels].slice(0, 10);
    
    saveRecentModels(updatedModels);
  } catch (error) {
    console.error('Failed to add recent model:', error);
  }
};

// ==================== STORAGE MIGRATION UTILITIES ====================

export const migrateToHybridStorage = (): void => {
  try {
    console.log('🔄 Starting storage migration to hybrid approach...');
    
    // Clear old Zustand persisted stores
    const oldKeys = [
      'chat-storage',
      'context-storage',
      'auth-storage',
      'tempSessions',
    ];
    
    oldKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`🗑️ Removed old storage key: ${key}`);
      }
    });
    
    // Clear old temp message keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tempMessages_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed old temp message key: ${key}`);
    });
    
    // Clear sessionStorage (drafts will be recreated as needed)
    sessionStorage.clear();
    
    console.log('✅ Storage migration completed');
  } catch (error) {
    console.error('Storage migration failed:', error);
  }
};

export const needsStorageMigration = (): boolean => {
  try {
    return (
      localStorage.getItem('chat-storage') !== null ||
      localStorage.getItem('context-storage') !== null ||
      localStorage.getItem('auth-storage') !== null
    );
  } catch (error) {
    console.error('Failed to check storage migration status:', error);
    return false;
  }
};

// ==================== STORAGE HEALTH CHECK ====================

export const checkStorageHealth = (): {
  localStorage: boolean;
  sessionStorage: boolean;
  localStorageSize: number;
  sessionStorageSize: number;
  hasOldStorage: boolean;
} => {
  try {
    // Test localStorage
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    const localStorageAvailable = localStorage.getItem(testKey) === 'test';
    localStorage.removeItem(testKey);
    
    // Test sessionStorage
    sessionStorage.setItem(testKey, 'test');
    const sessionStorageAvailable = sessionStorage.getItem(testKey) === 'test';
    sessionStorage.removeItem(testKey);
    
    // Calculate approximate storage sizes
    let localStorageSize = 0;
    let sessionStorageSize = 0;
    
    if (localStorageAvailable) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key) || '';
          localStorageSize += key.length + value.length;
        }
      }
    }
    
    if (sessionStorageAvailable) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          const value = sessionStorage.getItem(key) || '';
          sessionStorageSize += key.length + value.length;
        }
      }
    }
    
    return {
      localStorage: localStorageAvailable,
      sessionStorage: sessionStorageAvailable,
      localStorageSize,
      sessionStorageSize,
      hasOldStorage: needsStorageMigration(),
    };
  } catch (error) {
    console.error('Storage health check failed:', error);
    return {
      localStorage: false,
      sessionStorage: false,
      localStorageSize: 0,
      sessionStorageSize: 0,
      hasOldStorage: false,
    };
  }
};

// ==================== EXPORT ALL UTILITIES ====================

export default {
  // SessionStorage utilities
  DRAFT_STORAGE_KEYS,
  saveDraftMessage,
  loadDraftMessage,
  clearDraftMessage,
  saveUnsentMessage,
  loadAndClearUnsentMessage,
  clearAllDrafts,
  
  // LocalStorage utilities
  LOCAL_STORAGE_KEYS,
  saveLastActiveConversation,
  loadLastActiveConversation,
  clearLastActiveConversation,
  saveRecentModels,
  loadRecentModels,
  addRecentModel,
  
  // Migration utilities
  migrateToHybridStorage,
  needsStorageMigration,
  
  // Health check
  checkStorageHealth,
};