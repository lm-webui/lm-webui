import { ChatMessage, toChatMessage } from './Message';

// Base conversation interface
export interface BaseConversation {
  id: string;
  title: string;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  metadata?: Record<string, any>;
}

// Extended chat conversation with UI-specific properties
export interface ChatConversation extends BaseConversation {
  messages: ChatMessage[];
  isBackendConfirmed?: boolean;
  isTitleGenerating?: boolean;
  preview?: string;
  messageCount?: number;
  pinned?: boolean;
  folder?: string;
}

// Conversation for WebSocket sessions
export interface SessionConversation extends BaseConversation {
  sessionId: string;
  userId?: string;
  isActive: boolean;
  lastActivityAt: string;
}

// Conversation summary for lists
export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
  folder?: string;
  lastMessage?: {
    content: string;
    role: string;
    timestamp: string;
  };
}

// Type guard utilities
export function isChatConversation(conversation: any): conversation is ChatConversation {
  return !!conversation && 
    typeof conversation === 'object' && 
    'id' in conversation && 
    'title' in conversation && 
    'createdAt' in conversation && 
    'updatedAt' in conversation && 
    'messages' in conversation;
}

export function isSessionConversation(conversation: any): conversation is SessionConversation {
  return conversation && typeof conversation === 'object' && 'sessionId' in conversation && 'isActive' in conversation;
}

export function isConversationSummary(conversation: any): conversation is ConversationSummary {
  return conversation && typeof conversation === 'object' && 'preview' in conversation && 'messageCount' in conversation;
}

// Type conversion utilities
export function toChatConversation(conversation: any): ChatConversation {
  if (isChatConversation(conversation)) {
    return conversation;
  }
  
  // Convert from legacy conversation formats
  const messages = Array.isArray(conversation.messages) 
    ? conversation.messages.map((msg: any) => toChatMessage(msg))
    : [];
  
  return {
    id: conversation.id || `conv_${Date.now()}`,
    title: conversation.title || 'New Chat',
    createdAt: conversation.created_at || conversation.createdAt || new Date().toISOString(),
    updatedAt: conversation.updated_at || conversation.updatedAt || new Date().toISOString(),
    messages,
    metadata: conversation.metadata || {},
    isBackendConfirmed: conversation.is_backend_confirmed ?? conversation.isBackendConfirmed,
    isTitleGenerating: conversation.is_title_generating ?? conversation.isTitleGenerating,
    preview: conversation.preview,
    messageCount: conversation.message_count ?? conversation.messageCount ?? messages.length,
    pinned: conversation.pinned ?? false,
    folder: conversation.folder,
  };
}

export function fromChatConversation(conversation: ChatConversation): any {
  // Convert to legacy format if needed
  return {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    messages: conversation.messages,
    metadata: conversation.metadata,
    is_backend_confirmed: conversation.isBackendConfirmed,
    is_title_generating: conversation.isTitleGenerating,
    preview: conversation.preview,
    message_count: conversation.messageCount || conversation.messages?.length || 0,
    pinned: conversation.pinned,
    folder: conversation.folder,
  };
}

export function toConversationSummary(conversation: any): ConversationSummary {
  if (isConversationSummary(conversation)) {
    return conversation;
  }
  
  const chatConv = toChatConversation(conversation);
  const lastMessage = chatConv.messages.length > 0 
    ? chatConv.messages[chatConv.messages.length - 1]
    : undefined;
  
  const summary: ConversationSummary = {
    id: chatConv.id,
    title: chatConv.title,
    preview: chatConv.preview || lastMessage?.content?.substring(0, 100) || '',
    updatedAt: chatConv.updatedAt,
    messageCount: chatConv.messageCount || chatConv.messages.length,
    pinned: chatConv.pinned || false,
  };
  
  // Only add folder if it exists
  if (chatConv.folder !== undefined) {
    summary.folder = chatConv.folder;
  }
  
  // Only add lastMessage if it exists
  if (lastMessage) {
    summary.lastMessage = {
      content: lastMessage.content,
      role: lastMessage.role,
      timestamp: lastMessage.createdAt,
    };
  }
  
  return summary;
}