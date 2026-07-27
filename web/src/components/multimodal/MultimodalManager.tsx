import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useActiveChatId, useCreateNewChat, useChatStore } from '@/store/chatStore';

interface MediaLibraryEntry {
  id: string;
  image_url: string;
  prompt: string;
  model: string;
  conversation_id: string | undefined;
  created_at: string;
}

interface MultimodalState {
  // Media Library
  mediaLibrary: MediaLibraryEntry[];
  isMediaLibraryLoading: boolean;
  
  // Current conversation images
  conversationImages: MediaLibraryEntry[];
  
  // Image generation state
  isGeneratingImage: boolean;
  lastGeneratedImage?: string;
}

interface MultimodalActions {
  // Media Library operations
  loadMediaLibrary: () => Promise<void>;
  loadConversationImages: (conversationId: string) => Promise<void>;
  deleteMediaEntry: (mediaId: string) => Promise<boolean>;
  
  // Image generation with media library
  generateImageWithMediaLibrary: (
    prompt: string, 
    model: string, 
    provider: string,
    conversationId?: string
  ) => Promise<string | null>;
  
  // Utility functions
  getImageContextForPrompt: (conversationId: string, currentPrompt: string) => Promise<string>;
}

const MultimodalContext = createContext<MultimodalState & MultimodalActions | undefined>(undefined);

const useMultimodal = () => {
  const context = useContext(MultimodalContext);
  if (!context) {
    throw new Error('useMultimodal must be used within a MultimodalProvider');
  }
  return context;
};

interface MultimodalProviderProps {
  children: React.ReactNode;
}

const MultimodalProvider: React.FC<MultimodalProviderProps> = ({ children }) => {
  const [state, setState] = useState<MultimodalState>({
    mediaLibrary: [],
    isMediaLibraryLoading: false,
    conversationImages: [],
    isGeneratingImage: false,
  });

  // Zustand hooks must be called at component level
  const activeChatId = useActiveChatId();
  const createNewChat = useCreateNewChat();

  // Load user's media library
  const loadMediaLibrary = useCallback(async () => {
    setState(prev => ({ ...prev, isMediaLibraryLoading: true }));
    
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';
      const response = await fetch(
        `${API_BASE_URL}/api/multimodal/media-library?limit=100&offset=0&include_generated=true`,
        {
          credentials: 'include',
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setState(prev => ({ 
            ...prev, 
            mediaLibrary: data.files || [],
            isMediaLibraryLoading: false 
          }));
        } else {
          console.error('Failed to load media library:', data.error);
          setState(prev => ({ ...prev, isMediaLibraryLoading: false }));
        }
      } else {
        console.error('Failed to load media library - HTTP error:', response.status);
        setState(prev => ({ ...prev, isMediaLibraryLoading: false }));
      }
    } catch (error) {
      console.error('Error loading media library:', error);
      setState(prev => ({ ...prev, isMediaLibraryLoading: false }));
    }
  }, []);

  // Load images for a specific conversation
  const loadConversationImages = useCallback(async (conversationId: string) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';
      const response = await fetch(`${API_BASE_URL}/api/multimodal/conversation/${conversationId}/images`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const images = await response.json();
        setState(prev => ({ ...prev, conversationImages: images }));
      } else {
        console.error('Failed to load conversation images');
      }
    } catch (error) {
      console.error('Error loading conversation images:', error);
    }
  }, []);

  // Delete a media library entry
  const deleteMediaEntry = useCallback(async (mediaId: string): Promise<boolean> => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';
      const response = await fetch(`${API_BASE_URL}/api/multimodal/media-library/${mediaId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Remove from local state
        setState(prev => ({
          ...prev,
          mediaLibrary: prev.mediaLibrary.filter(entry => entry.id !== mediaId),
          conversationImages: prev.conversationImages.filter(entry => entry.id !== mediaId),
        }));
        
        toast.success('Image deleted from media library');
        return true;
      } else {
        toast.error('Failed to delete image');
        return false;
      }
    } catch (error) {
      console.error('Error deleting media entry:', error);
      toast.error('Error deleting image');
      return false;
    }
  }, []);

  // Generate image with media library integration
  const generateImageWithMediaLibrary = useCallback(async (
    prompt: string,
    model: string,
    provider: string,
    conversationId?: string
  ): Promise<string | null> => {
    console.log("🎯 generateImageWithMediaLibrary CALLED", { prompt, model, provider, conversationId });
    setState(prev => ({ ...prev, isGeneratingImage: true }));

    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';
      console.log("🌐 API_BASE_URL:", API_BASE_URL);

      let finalConversationId = conversationId || activeChatId;
      console.log("🔍 Initial conversation resolution:", {
        input: conversationId,
        active: activeChatId,
        final: finalConversationId,
        needsCreate: !finalConversationId
      });

      if (!finalConversationId) {
        console.log("  🚨 NO CONVERSATION - CREATING NEW ONE");
        console.log("  🏗️ Calling createNewChat()...");
        finalConversationId = await createNewChat(); // FIX: Added await
        console.log("  ✅ createNewChat() returned:", finalConversationId);

        // Check Zustand state immediately
        const immediateState = useChatStore.getState().activeChatId;
        console.log("  📊 Zustand state after createNewChat():", immediateState);

        // Try Option 3: Skip state sync for now to confirm this is the issue
        console.log("  ⚠️ SIDESTEPPING STATE SYNC - Using created ID directly");
        // Comment out the Promise-based sync temporarily
        /*
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn("⏰ Timeout waiting for conversation state sync");
            reject(new Error('Zustand state sync timeout'));
          }, 1000);

          const unsubscribe = useChatStore.subscribe(
            (state) => {
              console.log("  🔄 State changed, new activeChatId:", state.activeChatId);
              if (state.activeChatId === finalConversationId) {
                console.log("  ✅ State synchronized!");
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              }
            }
          );

          // Check if already synchronized
          if (useChatStore.getState().activeChatId === finalConversationId) {
            console.log("  ⚡ Already synchronized");
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
        });
        */
      }

      console.log("  📤 FINAL conversation ID for API:", finalConversationId);

      const requestBody = {
        message: prompt,
        provider: provider,
        model: model,
        api_key: "", // Will be handled by backend
        conversation_id: finalConversationId,
      };

      console.log("  📡 Sending API request with conversation_id:", finalConversationId);

      const response = await fetch(`${API_BASE_URL}/api/generate/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.image_url) {
          // Optimistic update - add to media library immediately
          const optimisticEntry: MediaLibraryEntry = {
            id: `temp-${Date.now()}`,
            image_url: result.image_url,
            prompt: prompt,
            model: model,
            conversation_id: finalConversationId, // Use the final conversation ID
            created_at: new Date().toISOString(),
          };
          
          setState(prev => ({ 
            ...prev, 
            isGeneratingImage: false,
            lastGeneratedImage: result.image_url,
            mediaLibrary: [optimisticEntry, ...prev.mediaLibrary],
            conversationImages: [optimisticEntry, ...prev.conversationImages]
          }));
          
          // Refresh media library and conversation images in background
          Promise.all([
            loadMediaLibrary(),
            loadConversationImages(finalConversationId)
          ]).catch(error => {
            console.error('Background refresh failed:', error);
          });
          
          toast.success('🎨 Image generated and saved to media library!');
          return result.image_url;
        } else {
          throw new Error('No image URL returned');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
    } catch (error: any) {
      console.error('Error generating image:', error);
      setState(prev => ({ ...prev, isGeneratingImage: false }));
      
      // Handle specific error cases
      const errorMessage = error?.message || 'Failed to generate image';
      
      if (errorMessage.includes('content policy')) {
        toast.error('🚫 Content Policy Violation', {
          description: 'Your prompt was rejected by the safety system. Please try a different prompt.',
          duration: 6000,
        });
      } else if (errorMessage.includes('billing') || errorMessage.includes('quota')) {
        toast.error('💳 Billing Issue', {
          description: 'Please check your API usage limits and billing.',
          duration: 6000,
        });
      } else {
        toast.error(`Failed to generate image: ${errorMessage}`, {
          duration: 5000,
        });
      }
      
      return null;
    }
  }, [loadMediaLibrary, loadConversationImages, activeChatId, createNewChat]);

  // Get image context for a prompt (for multimodal chat)
  const getImageContextForPrompt = useCallback(async (conversationId: string, currentPrompt: string): Promise<string> => {
    // For now, we'll implement a simple client-side version
    // In a real implementation, this would call the backend
    
    const conversationImages = state.conversationImages.filter(img => img.conversation_id === conversationId);
    
    if (conversationImages.length === 0) {
      return currentPrompt;
    }
    
    // Check if prompt references images
    const promptLower = currentPrompt.toLowerCase();
    const imageKeywords = ['image', 'picture', 'photo', 'visual', 'see', 'look', 'this', 'that'];
    
    if (imageKeywords.some(keyword => promptLower.includes(keyword))) {
      let imageContext = '\n\nImages available in this conversation:\n';
      conversationImages.forEach((img, index) => {
        imageContext += `${index + 1}. "${img.prompt}" (generated with ${img.model})\n`;
      });
      
      return currentPrompt + imageContext + '\n\nPlease reference the appropriate images when responding.';
    }
    
    return currentPrompt;
  }, [state.conversationImages]);

  const value: MultimodalState & MultimodalActions = {
    ...state,
    loadMediaLibrary,
    loadConversationImages,
    deleteMediaEntry,
    generateImageWithMediaLibrary,
    getImageContextForPrompt,
  };

  return (
    <MultimodalContext.Provider value={value}>
      {children}
    </MultimodalContext.Provider>
  );
};

// Export only the provider and hook
export { MultimodalProvider, useMultimodal };
