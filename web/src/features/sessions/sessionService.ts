import { getUserSessions, listApiKeys, getConversationWithFiles } from "@/utils/api";
import { Conversation, Message, SessionData, ConversationWithFiles } from "./types";

export class SessionService {
  static async loadUserSessions(isAuthenticated: boolean): Promise<Conversation[]> {
    if (!isAuthenticated) {
      const tempSessions = localStorage.getItem('tempSessions');
      if (tempSessions) {
        return JSON.parse(tempSessions);
      }
      return [];
    }

    try {
      const userSessions: SessionData[] = await getUserSessions();
      return userSessions.map(session => ({
        id: session.session_id,
        title: session.title,
        lastMessage: new Date(session.last_activity || new Date()),
        messageCount: session.message_count || 0,
        messages: []
      }));
    } catch (error) {
      console.error("Failed to load user sessions:", error);
      return [];
    }
  }

  static async loadStoredApiKeys(): Promise<Record<string, boolean>> {
    try {
      const apiKeys = await listApiKeys();
      const keysMap: Record<string, boolean> = {};
      if (apiKeys && Array.isArray(apiKeys)) {
        apiKeys.forEach((key: any) => {
          keysMap[key.provider] = true;
        });
      }
      console.log("Loaded stored API keys:", keysMap);
      return keysMap;
    } catch (error) {
      console.error("Failed to load stored API keys:", error);
      return {};
    }
  }

  static async loadSessionMessages(sessionId: string): Promise<{
    messages: Message[];
    sessionId: string;
  }> {
    try {
      const { messages: conversationMessages, files: fileReferences }: ConversationWithFiles =
        await getConversationWithFiles(sessionId);

      if (!conversationMessages || !Array.isArray(conversationMessages)) {
        console.warn("No messages found in conversation:", conversationMessages);
        return { messages: [], sessionId };
      }

      // Format messages - Zustand will handle state updates separately
      const formattedMessages: Message[] = conversationMessages.map((msg: any) => {
        const messageFiles = fileReferences.filter((file: any) => file.message_id === msg.id);

        return {
          id: msg.id?.toString() || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: (msg.role === "user" || msg.role === "assistant") ? msg.role : "user",
          content: msg.content || "",
          timestamp: new Date(msg.created_at || new Date()),
          model: msg.type || "",
          fileAttachments: messageFiles.map((file: any) => ({
            id: file.id,
            file_path: file.file_path,
            file_type: file.file_type,
            metadata: file.metadata
          }))
        };
      });

      return { messages: formattedMessages, sessionId };
    } catch (error) {
      console.error("Failed to load session messages:", error);
      return { messages: [], sessionId };
    }
  }
}
