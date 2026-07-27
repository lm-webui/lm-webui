// Chat modes supported by the unified system
export type ChatMode = "basic" | "rag" | "vision";

// File attachment interface for multimodal chat
export interface FileAttachment {
  id: string;
  type: string;      // "pdf", "docx", "txt", "md", "image", etc.
  path: string;      // File path/URL for backend access
  filename: string;  // Original filename for display
  size?: number;     // File size in bytes
  uploaded_at?: string; // Upload timestamp
}

// Unified chat request extending the existing ChatRequest
export interface UnifiedChatRequest {
  // Core chat parameters (from existing ChatRequest)
  message: string;
  provider: string;
  model: string;
  api_key?: string;
  conversation_history?: any[];
  signal?: AbortSignal;
  show_raw_response?: boolean;
  
  // Unified architecture additions
  mode?: ChatMode;           // Auto-detected or manually specified mode
  attachments?: FileAttachment[]; // File attachments for RAG/vision
  conversation_id?: string;  // Persistent conversation ID
}

// Unified chat response from backend
export interface UnifiedChatResponse {
  conversation_id: string;
  response: string;
  context_used: {
    memory: boolean;
    rag: boolean;
    vision: boolean;
  };
  mode: ChatMode;
  message_id: string;
}

// Context usage information for display
export interface ContextUsage {
  memory: boolean;
  rag: boolean;
  vision: boolean;
}

// Mode change notification for user feedback
export interface ModeChangeNotification {
  from: ChatMode;
  to: ChatMode;
  reason: string; // "file_upload", "file_removal", "manual", etc.
  timestamp: Date;
}
