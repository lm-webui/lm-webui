// Base message interface that all message types should extend
export interface BaseMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string; // ISO 8601 timestamp
  metadata?: Record<string, any>;
}

// Extended chat message with UI-specific properties
export interface ChatMessage extends BaseMessage {
  isLoading?: boolean;
  model?: string;
  fileAttachments?: FileAttachment[];
  searchUsed?: boolean;
  rawResponse?: string;
  generatedImageUrl?: string;
  editedAt?: string;
}

// File attachment for multimodal chat
export interface FileAttachment {
  id: string;
  type: string; // "pdf", "docx", "txt", "md", "image", "audio", "video", etc.
  path: string; // File path/URL for backend access
  filename: string; // Original filename for display
  size?: number; // File size in bytes
  uploadedAt?: string; // ISO 8601 timestamp
  metadata?: Record<string, any>;
}

// Message for WebSocket streaming
export interface StreamingMessage {
  sessionId: string;
  messageId: string;
  content: string;
  type: 'token' | 'typing' | 'complete' | 'error' | 'cancelled';
  timestamp: string;
}

// Type guard utilities
export function isChatMessage(message: any): message is ChatMessage {
  return !!message && 
    typeof message === 'object' && 
    'id' in message && 
    'role' in message && 
    'content' in message && 
    'createdAt' in message;
}

export function isStreamingMessage(message: any): message is StreamingMessage {
  return message && typeof message === 'object' && 'sessionId' in message && 'type' in message;
}

// Type conversion utilities
export function toChatMessage(message: any): ChatMessage {
  if (isChatMessage(message)) {
    return message;
  }
  
  // Convert from legacy message formats
  return {
    id: message.id || crypto.randomUUID(),
    role: message.role || 'user',
    content: message.content || '',
    createdAt: message.created_at || message.createdAt || new Date().toISOString(),
    metadata: message.metadata || {},
    isLoading: message.isLoading,
    model: message.model,
    fileAttachments: message.fileAttachments || message.file_attachments,
    searchUsed: message.searchUsed,
    rawResponse: message.rawResponse,
    generatedImageUrl: message.generatedImageUrl,
    editedAt: message.editedAt || message.edited_at,
  };
}

export function fromChatMessage(message: ChatMessage): any {
  // Convert to legacy format if needed
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.createdAt,
    metadata: message.metadata,
    isLoading: message.isLoading,
    model: message.model,
    file_attachments: message.fileAttachments,
    search_used: message.searchUsed,
    raw_response: message.rawResponse,
    generated_image_url: message.generatedImageUrl,
    edited_at: message.editedAt,
  };
}