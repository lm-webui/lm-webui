import { ChatConversation, ChatMessage } from '../types/chat-ui';

export const mapToMessage = (msg: any): ChatMessage => {
  return {
    id: msg.id,
    role: msg.role as any,
    content: msg.content,
    created_at: msg.created_at || (msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString()),
    metadata: msg.metadata || {},
    isLoading: msg.isLoading,
    generatedImageUrl: msg.generatedImageUrl || msg.metadata?.generatedImageUrl,
    type: msg.type,
    model: msg.model,
    fileAttachments: msg.fileAttachments || msg.metadata?.attachments || undefined,
  };
};

export const mapToConversation = (conv: any): ChatConversation => {
  const messages = (conv.messages || []).map(mapToMessage);
  
  return {
    id: conv.id,
    title: conv.title || 'Untitled Conversation',
    preview: conv.messages?.[conv.messages.length - 1]?.content.slice(0, 80) || 'No messages yet',
    updated_at: conv.updated_at || conv.created_at || new Date().toISOString(),
    message_count: messages.length,
    pinned: false,
    messages: messages,
  };
};

export function generateChatTitle(messages: ChatMessage[]): string {
  if (messages.length === 0) return "New Chat";

  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (!firstUserMessage) return "New Chat";

  let content = firstUserMessage.content.trim();
  content = content.replace(/^(hey|hi|hello|can you|please|help me|I want to|I need to|could you|would you)/i, '').trim();

  const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 3);
  let title = sentences[0]?.trim();

  if (!title) {
    // Fallback: use first few words of the raw message
    const words = firstUserMessage.content.trim().split(/\s+/).filter(w => w.length > 0);
    title = words.slice(0, 5).join(' ');
  }

  if (title.length > 60) {
    const words = title.split(' ');
    title = words.slice(0, 10).join(' ') + '...';
  }

  return title.replace(/[*_`#]/g, "").trim() || "New Chat";
}

export const CODE_LANGUAGE_PATTERNS = {
  javascript: /(?:function|const|let|var|=>|console\.log)/,
  python: /(?:def |import |from |print\(|if __name__)/,
  typescript: /(?:interface|type |: string|: number)/,
  sql: /(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)/i,
  bash: /(?:#!\/bin\/bash|sudo|cd |ls |grep)/,
  json: /^\s*[{\[].*[}\]]\s*$/s,
  css: /(?:\.[\w-]+\s*{|@media|display:|color:)/,
  html: /(?:<\/?[a-z][\s\S]*>)/i,
  jsx: /(?:return\s*\(|<[A-Z][\w]*|className=)/,
} as const;


export function detectMessageIntent(content: string) {
  // Combine all code patterns into one regex for detection
  const codePatterns = new RegExp(
    Object.values(CODE_LANGUAGE_PATTERNS)
      .map(pattern => pattern.source)
      .join('|'),
    'i'
  );

  const searchPatterns = /(?:what is|how to|search for|find|lookup|google|when did|where is)/i;
  const imageKeywords = /(?:create|generate|make|draw|design|show me).*(?:image|picture|photo|illustration|diagram|chart|graph)/i;

  return {
    isCode: codePatterns.test(content),
    isSearch: searchPatterns.test(content),
    isImage: imageKeywords.test(content),
  };
}
