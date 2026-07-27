import { useState } from "react";
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

    // Update Zustand store with loaded sessions — merge strategy:
    // - For sessions that DON'T exist in the store, add them with messages: []
    // - For sessions that DO exist, update title/metadata but KEEP existing messages
    const store = useChatStore.getState();
    const updatedConversations = { ...store.conversations };

    sessions.forEach(session => {
      if (!updatedConversations[session.id]) {
        updatedConversations[session.id] = {
          id: session.id,
          title: session.title,
          messages: [],
          created_at: session.lastMessage.toISOString(),
          isBackendConfirmed: true,
        };
      } else {
        // Update title/metadata but keep existing messages (may have been loaded)
        const existing = updatedConversations[session.id]!;
        updatedConversations[session.id] = {
          ...existing,
          title: session.title,
        };
      }
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
