import { toast } from "sonner";
import { SessionService } from "./sessionService";
import { UseSessionManagementOptions } from "./types";
import { useChatStore, useActiveChatId, useSetActiveChat, useCreateNewChat } from "@/store/chatStore";

export function useSessionManagement(options: UseSessionManagementOptions) {
  // Zustand state management
  const activeChatId = useActiveChatId();
  const setActiveChat = useSetActiveChat();
  const createNewChat = useCreateNewChat();

  const loadUserSessions = async () => {
    const sessions = await SessionService.loadUserSessions(options.isAuthenticated);

    // Rebuild the conversation map from the authoritative backend list (which is
    // scoped to the current user). Anything not returned is dropped, so a previous
    // user's conversations can't linger after logout/login. Existing messages are
    // preserved for sessions that match the current user's.
    const store = useChatStore.getState();
    const updatedConversations: Record<string, any> = {};

    sessions.forEach(session => {
      const existing = store.conversations[session.id];
      updatedConversations[session.id] = existing
        ? { ...existing, title: session.title }
        : {
            id: session.id,
            title: session.title,
            messages: [],
            created_at: session.lastMessage.toISOString(),
            isBackendConfirmed: true,
          };
    });

    useChatStore.setState({ conversations: updatedConversations });
    options.onSessionsUpdate(sessions);
  };

  const loadStoredApiKeys = async () => {
    const apiKeys = await SessionService.loadStoredApiKeys();
    options.onApiKeysUpdate(apiKeys);
  };

  const loadSessionMessages = async (sessionId: string) => {
    const { messages } = await SessionService.loadSessionMessages(sessionId);

    // Update Zustand store with loaded messages
    const store = useChatStore.getState();
    if (store.conversations[sessionId]) {
      const updatedConversations = {
        ...store.conversations,
        [sessionId]: {
          ...store.conversations[sessionId],
          messages: messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            created_at: msg.timestamp?.toISOString() || new Date().toISOString(),
            timestamp: msg.timestamp
          }))
        }
      };
      useChatStore.setState({ conversations: updatedConversations });
    }

    setActiveChat(sessionId);
    options.onMessagesUpdate(messages);
  };

  const handleNewChat = async () => {
    try {
      const newChatId = await createNewChat();
      setActiveChat(newChatId);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      toast.error("Failed to create new chat");
    }
  };

  return {
    currentSessionId: activeChatId || "",
    setCurrentSessionId: setActiveChat,
    currentConversationId: activeChatId || "",
    setCurrentConversationId: setActiveChat,
    loadUserSessions,
    loadStoredApiKeys,
    loadSessionMessages,
    handleNewChat,
  };
}
