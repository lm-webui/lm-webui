import { useState } from "react";
import { toast } from "sonner";
import { FileService } from "./fileService";

export function useFileManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [ragContext, setRagContext] = useState<string>("");

  const handleFileUpload = async (files: FileList, conversationId: string = "") => {
    setIsLoading(true);
    
    try {
      const result = await FileService.uploadFiles(files, conversationId);
      
      if (result.success) {
        toast.success(`${files.length} file(s) uploaded successfully`);
      } else {
        toast.error('File upload failed');
      }
    } catch (error) {
      console.error('File upload failed:', error);
      toast.error('File upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileProcessed = (result: any) => {
    if (result.success) {
      toast.success("File processed successfully!");
    } else {
      toast.error("File processing failed");
    }
  };

  const handleContextRetrieved = (context: string) => {
    setRagContext(context);
    toast.success("Context retrieved from RAG system");
  };

  return {
    isLoading,
    setIsLoading,
    ragContext,
    setRagContext,
    handleFileUpload,
    handleFileProcessed,
    handleContextRetrieved,
  };
}
