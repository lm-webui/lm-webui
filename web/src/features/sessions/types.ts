export interface Conversation {
  id: string;
  title: string;
  lastMessage: Date;
  messageCount: number;
  messages?: any[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  model?: string;
  searchUsed?: boolean;
  rawResponse?: string;
  generatedImageUrl?: string;
  fileAttachments?: Array<{
    id: number;
    file_path: string;
    file_type: string;
    metadata?: any;
  }> | undefined;
}

export interface UseSessionManagementOptions {
  isAuthenticated: boolean;
  onSessionsUpdate: (sessions: Conversation[]) => void;
  onSessionIdUpdate: (id: string) => void;
  onApiKeysUpdate: (keys: Record<string, boolean>) => void;
  onMessagesUpdate: (messages: Message[]) => void;
}

export interface SessionData {
  session_id: string;
  title: string;
  last_activity: string | Date;
  message_count: number;
}

export interface ConversationWithFiles {
  messages: any[];
  files: any[];
}
