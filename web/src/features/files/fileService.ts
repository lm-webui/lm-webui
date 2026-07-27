import { authFetch } from "../../utils/api";

export class FileService {
  static async uploadFiles(
    files: FileList,
    currentConversationId: string
  ): Promise<{
    success: boolean;
    fileNames: string;
    results?: any[];
  }> {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    // Add conversation context for media library linking
    if (currentConversationId) {
      formData.append('conversation_id', currentConversationId);
    }

    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';

    const result = await authFetch(`${API_BASE_URL}/api/upload/files`, {
      method: 'POST',
      body: formData,
    });
    
    if (result.success) {
      const fileNames = Array.from(files).map(file => file.name).join(', ');
      return {
        success: true,
        fileNames,
        results: result.results || [] // Return full results array
      };
    } else {
      return {
        success: false,
        fileNames: "",
        results: []
      };
    }
  }

  static generateFileContext(fileNames: string, filesCount: number): string {
    return `I've uploaded ${filesCount} file(s): ${fileNames}. Please analyze and process these files.`;
  }

  static generateFileProcessedContext(fileInfo: any, processingResult: any): string {
    return `I've processed the file "${fileInfo.filename}". Please analyze the content and provide insights.`;
  }

  static generateRAGContext(context: string): string {
    return `Based on the retrieved context: ${context}\n\nPlease provide a comprehensive answer.`;
  }
}
