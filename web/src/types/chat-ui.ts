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
  fileAttachments?: Array<{
    media_id?: number;
    filename?: string;
    file_type?: string;
    content_type?: string;
    file_path?: string;
    type?: string;
    mime?: string;
  }>;
  // Multimodal context attached by finalizeMessage (RAG/vision/web-search/transcript).
  searchUsed?: boolean;
  sources?: any[];
  retrievedImages?: string[];
  context_used?: any;
  documentsReferenced?: number;
  memoryUsed?: boolean;
  searchQuery?: string;
  citations?: any[];
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
