import { generateImage as apiGenerateImage } from "@/utils/api";
import { createConversation, updateConversationTitle } from "@/utils/api";

export interface ImageRequest {
  message: string;
  provider: string;
  model: string;
  api_key?: string;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: Date;
  messageCount: number;
  messages?: any[];
}

export class ImageService {
  static async generateImage(
    request: ImageRequest,
    options: {
      isAuthenticated: boolean;
      currentConversationId: string;
      currentSessionId: string;
      conversations: Conversation[];
      selectedModel: string;
      modelMapping: Record<string, string>;
      setCurrentSessionId: (id: string) => void;
      setCurrentConversationId: (id: string) => void;
      setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
    }
  ): Promise<{
    imageUrl: string;
    conversationId: string;
  }> {
    const {
      isAuthenticated,
      currentConversationId,
      currentSessionId,
      conversations,
      selectedModel,
      modelMapping,
      setCurrentSessionId,
      setCurrentConversationId,
      setConversations,
    } = options;

    // Use currentConversationId if available, otherwise create one using the same logic as handleSendMessage
    let conversationId = currentConversationId;
    if (!conversationId) {
      if (isAuthenticated) {
        // For authenticated users, use backend-generated conversation ID with generic title
        const newConversation = await createConversation("New Chat");
        conversationId = newConversation.conversation_id;
        console.log("📝 Created backend conversation_id for image generation:", conversationId);

        // Update state so future messages use the same conversation
        setCurrentSessionId(conversationId);
        setCurrentConversationId(conversationId);

        // Add to conversations list with generic title
        const conversation: Conversation = {
          id: conversationId,
          title: newConversation.title,
          lastMessage: new Date(),
          messageCount: 0,
          messages: []
        };
        setConversations(prev => [conversation, ...prev]);
      } else {
        // Create temporary session for unauthenticated users
        conversationId = `temp_${Date.now()}`;
        console.log("📝 Created temp conversation_id for image generation:", conversationId);

        // Update state so future messages use the same conversation
        setCurrentSessionId(conversationId);
        setCurrentConversationId(conversationId);

        // Add to conversations list with generic title
        const newConversation: Conversation = {
          id: conversationId,
          title: "New Chat",
          lastMessage: new Date(),
          messageCount: 0,
          messages: []
        };
        setConversations(prev => [newConversation, ...prev]);
      }
    }

    console.log("🖼️ Generating image with conversation_id:", conversationId);
    const imageUrl = await apiGenerateImage(request, conversationId);

    // Only update conversation title if this is a new conversation (no existing messages)
    const existingConversation = conversations.find(c => c.id === conversationId);
    const isNewConversation = !existingConversation || existingConversation.messageCount === 0;

    if (isAuthenticated && isNewConversation) {
      const truncatedPrompt = request.message.length > 45
        ? request.message.substring(0, 45) + "..."
        : request.message;
      const conversationTitle = `Image: ${truncatedPrompt}`;

      console.log(`🎯 Updating new image conversation title: "${conversationTitle}"`);
      await updateConversationTitle(conversationId, conversationTitle);

      // Update local conversations array immediately to reflect title change in UI
      setConversations(prev => prev.map(c =>
        c.id === conversationId ? { ...c, title: conversationTitle } : c
      ));

      console.log(`✅ Image conversation title updated locally: "${conversationTitle}"`);
    }

    return {
      imageUrl,
      conversationId
    };
  }
}
