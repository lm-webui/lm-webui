import { useState, useEffect, useCallback } from 'react';
import { ChatMode, FileAttachment, ModeChangeNotification } from '@/types/chat';
import { 
  detectChatMode, 
  getModeChangeReason, 
  getModeDescription,
  validateModeCompatibility 
} from '@/utils/chatModeDetector';

interface UseChatModeReturn {
  currentMode: ChatMode;
  modeDescription: string;
  modeChangeHistory: ModeChangeNotification[];
  updateMode: (attachments?: FileAttachment[], requestedMode?: ChatMode) => void;
  resetMode: () => void;
  isModeCompatible: boolean;
}

export function useChatMode(
  initialAttachments?: FileAttachment[],
  initialMode?: ChatMode
): UseChatModeReturn {
  const [currentMode, setCurrentMode] = useState<ChatMode>(initialMode || 'basic');
  const [modeChangeHistory, setModeChangeHistory] = useState<ModeChangeNotification[]>([]);
  const [attachments, setAttachments] = useState<FileAttachment[]>(initialAttachments || []);

  // Auto-detect mode when attachments change
  useEffect(() => {
    if (attachments) {
      updateMode(attachments, currentMode);
    }
  }, [attachments]);

  const updateMode = useCallback((
    newAttachments?: FileAttachment[], 
    requestedMode?: ChatMode
  ) => {
    const previousMode = currentMode;
    const detectedMode = detectChatMode(newAttachments, requestedMode);
    
    // Update attachments state
    if (newAttachments) {
      setAttachments(newAttachments);
    }
    
    // Only update if mode actually changed
    if (detectedMode !== previousMode) {
      setCurrentMode(detectedMode);
      
      // Record mode change for history and notifications
      const changeNotification: ModeChangeNotification = {
        from: previousMode,
        to: detectedMode,
        reason: getModeChangeReason(previousMode, detectedMode, newAttachments),
        timestamp: new Date()
      };
      
      setModeChangeHistory(prev => [...prev, changeNotification]);
      
      // Show passive notification to user
      showModeChangeNotification(changeNotification);
    }
  }, [currentMode]);

  const resetMode = useCallback(() => {
    updateMode([], 'basic');
  }, [updateMode]);

  const isModeCompatible = validateModeCompatibility(currentMode, attachments);
  const modeDescription = getModeDescription(currentMode);

  return {
    currentMode,
    modeDescription,
    modeChangeHistory,
    updateMode,
    resetMode,
    isModeCompatible
  };
}

function showModeChangeNotification(change: ModeChangeNotification): void {
  const messages: Record<string, string> = {
    'document_upload': `Switched to RAG mode for document analysis`,
    'image_upload': `Switched to Vision mode for image analysis`,
    'attachments_removed': `Switched to Basic mode`,
    'auto_detection': `Auto-switched to ${change.to} mode`
  };
  
  const message = messages[change.reason] || `Mode changed to ${change.to}`;
  
  // Use toast notification system if available
  if (typeof window !== 'undefined' && (window as any).toast) {
    (window as any).toast(message, { type: 'info', duration: 3000 });
  } else {
    // Fallback to console log
    console.log(`💬 ${message}`);
  }
}

export function useChatModeWithFiles() {
  const [uploadedFiles, setUploadedFiles] = useState<FileAttachment[]>([]);
  const chatMode = useChatMode(uploadedFiles);
  const addFile = useCallback((file: FileAttachment) => {
    setUploadedFiles(prev => [...prev, file]);
  }, []);
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  }, []);
  const clearFiles = useCallback(() => {
    setUploadedFiles([]);
  }, []);

  return {
    ...chatMode,
    uploadedFiles,
    addFile,
    removeFile,
    clearFiles
  };
}
