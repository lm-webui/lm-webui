export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  editedAt?: string;
  metadata?: Record<string, any>;
  isLoading?: boolean;
  generatedImageUrl?: string;
  type?: string;
  model?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
  message_count: number;
  pinned: boolean;
  folder?: string;
  messages: ChatMessage[];
  isTitleGenerating?: boolean;
}

export interface ChatTemplate {
  id: string;
  name: string;
  content: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatFolder {
  id: string;
  name: string;
}
