import { ChatMode, FileAttachment } from '@/types/chat';

export function detectFileType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  const typeMap: Record<string, string> = {
    // Document types (RAG mode)
    'pdf': 'pdf',
    'docx': 'docx',
    'doc': 'docx',
    'txt': 'txt',
    'md': 'md',
    'rtf': 'rtf',
    
    // Image types (Vision mode)
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'webp': 'image',
    'bmp': 'image',
    'svg': 'image',
    
    // Spreadsheet types (RAG mode)
    'xlsx': 'xlsx',
    'xls': 'xlsx',
    'csv': 'csv',
    
    // Presentation types (RAG mode)
    'pptx': 'pptx',
    'ppt': 'pptx',
  };
  
  return typeMap[extension] || 'unknown';
}

/**
 * Check if file type is a document (for RAG mode)
 */
export function isDocumentType(fileType: string): boolean {
  const documentTypes = ['pdf', 'docx', 'txt', 'md', 'rtf', 'xlsx', 'csv', 'pptx'];
  return documentTypes.includes(fileType);
}

/**
 * Check if file type is an image (for Vision mode)
 */
export function isImageType(fileType: string): boolean {
  return fileType === 'image';
}

/**
 * Auto-detect chat mode based on attachments and requested mode
 */
export function detectChatMode(
  attachments?: FileAttachment[],
  requestedMode?: ChatMode
): ChatMode {
  // If no attachments, use requested mode or default to basic
  if (!attachments || attachments.length === 0) {
    return requestedMode || 'basic';
  }
  
  // Analyze attachment types
  const hasDocuments = attachments.some(att => isDocumentType(att.type));
  const hasImages = attachments.some(att => isImageType(att.type));
  
  // Auto-detect logic
  if (hasDocuments && (!requestedMode || requestedMode === 'basic')) {
    return 'rag';
  } else if (hasImages && (!requestedMode || requestedMode === 'basic')) {
    return 'vision';
  } else if (hasDocuments && hasImages) {
    // Both documents and images - prioritize RAG for now
    // In future, could implement hybrid mode
    return 'rag';
  }
  
  // Use requested mode if explicitly set and compatible
  return requestedMode || 'basic';
}

/**
 * Get mode change reason for user feedback
 */
export function getModeChangeReason(
  fromMode: ChatMode,
  toMode: ChatMode,
  attachments?: FileAttachment[]
): string {
  if (fromMode === toMode) {
    return 'no_change';
  }
  
  if (!attachments || attachments.length === 0) {
    return 'no_attachments';
  }
  
  const hasDocuments = attachments.some(att => isDocumentType(att.type));
  const hasImages = attachments.some(att => isImageType(att.type));
  
  if (toMode === 'rag' && hasDocuments) {
    return 'document_upload';
  } else if (toMode === 'vision' && hasImages) {
    return 'image_upload';
  } else if (toMode === 'basic') {
    return 'attachments_removed';
  }
  
  return 'auto_detection';
}

/**
 * Get human-readable mode description
 */
export function getModeDescription(mode: ChatMode): string {
  const descriptions: Record<ChatMode, string> = {
    basic: 'Standard chat without file processing',
    rag: 'Document analysis and retrieval',
    vision: 'Image analysis and description'
  };
  
  return descriptions[mode];
}

/**
 * Get mode badge color for UI
 */
export function getModeColor(mode: ChatMode): string {
  const colors: Record<ChatMode, string> = {
    basic: 'blue',
    rag: 'green', 
    vision: 'purple'
  };
  
  return colors[mode];
}

/**
 * Validate if mode is compatible with attachments
 */
export function validateModeCompatibility(
  mode: ChatMode,
  attachments?: FileAttachment[]
): boolean {
  if (!attachments || attachments.length === 0) {
    return mode === 'basic';
  }
  
  const hasDocuments = attachments.some(att => isDocumentType(att.type));
  const hasImages = attachments.some(att => isImageType(att.type));
  
  switch (mode) {
    case 'basic':
      return false; // Basic mode shouldn't have attachments
    case 'rag':
      return hasDocuments;
    case 'vision':
      return hasImages;
    default:
      return false;
  }
}
