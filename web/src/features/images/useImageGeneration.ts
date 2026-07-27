import { toast } from "sonner";
import { ImageService, ImageRequest, Conversation } from "./imageService";
import { 
  useStartImageGeneration,
  useCompleteImageGeneration,
  useAddProcessingImage,
  useRemoveProcessingImage,
  useSetError,
  useClearError
} from "@/store/chatStore";

export function useImageGeneration() {
  const startImageGeneration = useStartImageGeneration();
  const completeImageGeneration = useCompleteImageGeneration();
  const addProcessingImage = useAddProcessingImage();
  const removeProcessingImage = useRemoveProcessingImage();
  const setError = useSetError();
  const clearError = useClearError();

  const handleAutoAction = async (
    action: string,
    prompt: string,
    options: {
      isAuthenticated: boolean;
      currentConversationId: string;
      currentSessionId: string;
      conversations: Conversation[];
      selectedLLM: string;
      selectedModel: string;
      modelMapping: Record<string, string>;
      supportedImageModels: string[];
      setCurrentSessionId: (id: string) => void;
      setCurrentConversationId: (id: string) => void;
      setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
      setMessages: (updater: (prev: any[]) => any[]) => void;
      setIsLoading: (loading: boolean) => void;
      loadUserSessions: () => Promise<void>;
    }
  ) => {
    try {
      const {
        isAuthenticated,
        currentConversationId,
        currentSessionId,
        conversations,
        selectedLLM,
        selectedModel,
        modelMapping,
        supportedImageModels,
        setCurrentSessionId,
        setCurrentConversationId,
        setConversations,
        setMessages,
        setIsLoading,
        loadUserSessions
      } = options;

      const modelIdForAPI = modelMapping[selectedModel] || selectedModel;
      const request: ImageRequest = {
        message: prompt,
        provider: selectedLLM,
        model: modelIdForAPI,
        api_key: "",
      };

      if (action === "image") {
        // Validate image generation model using dynamic list
        const modelIdForValidation = modelMapping[selectedModel] || selectedModel;
        if (!supportedImageModels.some(model => model.toLowerCase() === modelIdForValidation.toLowerCase())) {
          toast.error(`❌ Unsupported Image Generation Model`, {
            description: `Please select a supported image model. Current model: ${selectedModel}`,
            duration: 8000
          });
          return;
        }

        // Start image generation with enhanced error handling
        let conversationId = currentConversationId;
        startImageGeneration(conversationId);
        const placeholderUrl = `placeholder_${Date.now()}`;
        addProcessingImage(placeholderUrl); // Add placeholder for tracking

        try {
          const result = await ImageService.generateImage(request, {
            isAuthenticated,
            currentConversationId,
            currentSessionId,
            conversations,
            selectedModel,
            modelMapping,
            setCurrentSessionId,
            setCurrentConversationId,
            setConversations,
          });

          if (result.imageUrl) {
            // Update processing state
            removeProcessingImage(result.imageUrl); // Remove placeholder
            addProcessingImage(result.imageUrl); // Add actual URL for background processing

            completeImageGeneration(result.conversationId);
            toast.success("🎨 Image generated successfully!");

            // Refresh conversations list
            if (isAuthenticated) {
              await loadUserSessions();
            }

            // Add success message with image URL in generatedImageUrl field
            const successMessage = {
              id: (Date.now() + 2).toString(),
              role: "assistant" as const,
              content: `✅ **Image Generated Successfully!**\n\nI've automatically detected your request and generated the image for you. Here it is:`,
              timestamp: new Date(),
              model: selectedModel,
              generatedImageUrl: result.imageUrl,
            };
            setMessages(prev => [...prev, successMessage]);
            return; // Don't add the generic success message below
          }
        } catch (error: any) {
          // Enhanced error handling with store integration
          completeImageGeneration(conversationId);
          removeProcessingImage(placeholderUrl);

          setError(error);
          console.error("Image generation failed:", error);

          // Provide specific error handling for unsupported models
          if (error.message?.includes("not support image generation") ||
              error.message?.includes("does not support") ||
              error.message?.includes("Image generation not supported")) {
            toast.error(`❌ Model Error: ${selectedModel} ${error.message}`, {
              duration: 8000,
              description: `Please select a supported image model. Current model: ${selectedModel}`,
            });
          } else if (error.message?.includes("billing") || error.message?.includes("quota")) {
            toast.error(`💳 Billing Issue: ${error.message}`, {
              duration: 6000,
              description: "Please check your OpenAI billing and API usage limits.",
            });
          } else if (error.message?.includes("content policy")) {
            toast.error(`🚫 Content Policy: ${error.message}`, {
              duration: 6000,
              description: "Please try a different prompt that complies with OpenAI's content policy.",
            });
          } else {
            toast.error(`Failed to generate image: ${error.message || 'Unknown error'}`, {
              duration: 5000,
            });
          }
          return; // Exit early on error
        }
      }
    } catch (error: any) {
      const errorMessage = error?.message || `Failed to generate ${action}`;

      // Provide specific error handling for unsupported models
      if (errorMessage.includes("not support image generation") ||
          errorMessage.includes("does not support") ||
          errorMessage.includes("Image generation not supported")) {
        toast.error(`❌ Model Error: ${options.selectedModel} ${errorMessage}`, {
          duration: 8000,
          description: `Please select DALL-E-2 or DALL-E-3 from the model dropdown for image generation.`
        });
      } else if (errorMessage.includes("billing") || errorMessage.includes("quota")) {
        toast.error(`💳 Billing Issue: ${errorMessage}`, {
          duration: 6000,
          description: "Please check your OpenAI billing and API usage limits."
        });
      } else if (errorMessage.includes("content policy")) {
        toast.error(`🚫 Content Policy: ${errorMessage}`, {
          duration: 6000,
          description: "Please try a different prompt that complies with OpenAI's content policy."
        });
      } else {
        toast.error(`Failed to generate ${action}: ${errorMessage}`, {
          duration: 5000
        });
      }

      console.error(`Error generating ${action}:`, error);
    } finally {
      options.setIsLoading(false);
    }
  };

  return {
    handleAutoAction,
  };
}
