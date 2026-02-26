import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Download, HardDrive, ExternalLink, Loader2, RefreshCw, Trash2, Upload, 
  FolderOpen, AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

interface GGUFModel {
  name: string;
  size: string;
  size_bytes: number;
  path: string;
}

interface ResolvedFile {
  filename: string;
  size: number;
  url: string;
  human_size: string;
  compatibility?: {
    compatibility: string;
    vram_ok: boolean;
    cpu_ram_ok: boolean;
    warnings: string[];
    requirements: {
      vram_gb_required: number;
      cpu_ram_gb_required: number;
      note: string;
    };
    hardware: {
      gpu_available: boolean;
      gpu_vram_gb: number;
      cpu_ram_gb: number;
    };
  };
}

interface ResolveResponse {
  type: string;
  repo_id?: string;
  tag?: string;
  files?: ResolvedFile[];
  file_url?: string;
  filename?: string;
  size?: number;
  human_size?: string;
  compatibility?: any;
}

interface DownloadTask {
  task_id: string;
  status: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  filename: string;
  error?: string;
}

interface GGUFModelLoaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelLoad?: (modelName: string) => void;
}

const GGUFModelLoader: React.FC<GGUFModelLoaderProps> = ({ open, onOpenChange, onModelLoad }) => {
  const [input, setInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedData, setResolvedData] = useState<ResolveResponse | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [localModels, setLocalModels] = useState<GGUFModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [downloadTasks, setDownloadTasks] = useState<Record<string, DownloadTask>>({});
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadLocalModels();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const loadLocalModels = async () => {
    setIsLoadingModels(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.get(`${API_BASE_URL}/api/models/local`);
      setLocalModels(response.data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to load local models",
        variant: "destructive",
      });
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleResolve = async () => {
    if (!input.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL, repo, or repo:tag",
        variant: "destructive",
      });
      return;
    }

    setIsResolving(true);
    setResolvedData(null);
    
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.post(`${API_BASE_URL}/api/models/resolve`, {
        input: input.trim()
      });
      
      setResolvedData(response.data);
    } catch (error: any) {
      toast({
        title: "Resolve failed",
        description: error.response?.data?.detail || "Failed to resolve input",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleDownload = async (file: ResolvedFile) => {
    if (!file.url) {
      toast({
        title: "Error",
        description: "No download URL available",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.post(`${API_BASE_URL}/api/models/download`, {
        file_url: file.url,
        filename: file.filename
      });

      const taskId = response.data.task_id;
      
      // Connect to WebSocket for progress updates
      connectWebSocket(taskId);
      
      toast({
        title: "Download started",
        description: `Downloading ${file.filename}`,
      });
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.response?.data?.detail || "Failed to start download",
        variant: "destructive",
      });
      setIsDownloading(false);
    }
    // Note: setIsDownloading(false) is now handled by WebSocket completion
  };

  const connectWebSocket = (taskId: string) => {
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
    // If API_BASE_URL is empty (relative path), construct WS URL from window.location
    const baseUrl = API_BASE_URL || window.location.origin;
    const wsUrl = baseUrl.replace(/^http/, 'ws') + `/api/models/download-ws/${taskId}`;
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onmessage = (event) => {
      const taskInfo = JSON.parse(event.data);
      // Use task_id as the key for state management
      setDownloadTasks(prev => ({
        ...prev,
        [taskInfo.task_id]: taskInfo
      }));
      
      if (taskInfo.status === "completed") {
        setIsDownloading(false);
        toast({
          title: "Download completed",
          description: `Downloaded ${taskInfo.filename} successfully`,
        });
        loadLocalModels();
        // Remove completed task from state after a delay
        setTimeout(() => {
          setDownloadTasks(prev => {
            const newTasks = { ...prev };
            delete newTasks[taskInfo.task_id];
            return newTasks;
          });
        }, 3000);
      } else if (taskInfo.status === "failed") {
        setIsDownloading(false);
        toast({
          title: "Download failed",
          description: taskInfo.error || "Download failed",
          variant: "destructive",
        });
        // Remove failed task from state after a delay
        setTimeout(() => {
          setDownloadTasks(prev => {
            const newTasks = { ...prev };
            delete newTasks[taskInfo.task_id];
            return newTasks;
          });
        }, 3000);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    wsRef.current.onclose = () => {
      console.log("WebSocket connection closed");
    };
  };

  const getCompatibilityBadge = (compatibility: string, appleSiliconInfo?: any) => {
    switch (compatibility) {
      case "compatible":
        // Check if there are Apple Silicon specific warnings
        if (appleSiliconInfo?.quant_support && !appleSiliconInfo.quant_support.supported) {
          return { variant: "secondary" as const, icon: AlertTriangle, text: "Apple Silicon Warning" };
        }
        return { variant: "default" as const, icon: CheckCircle, text: "Compatible" };
      case "warning":
        return { variant: "secondary" as const, icon: AlertTriangle, text: "Warning" };
      case "incompatible":
        return { variant: "destructive" as const, icon: XCircle, text: "Incompatible" };
      default:
        return { variant: "outline" as const, icon: Info, text: "Unknown" };
    }
  };

  const toggleFileExpanded = (filename: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [filename]: !prev[filename]
    }));
  };

  const handleLoadModel = async (modelName: string) => {
    if (onModelLoad) {
      onModelLoad(modelName);
    }
    
    toast({
      title: "Model loaded",
      description: `Loaded model: ${modelName}. Switching to GGUF provider.`,
    });
    
    onOpenChange(false);
  };

  const handleDeleteModel = async (modelName: string) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      
      if (confirm(`Are you sure you want to delete ${modelName}? This action cannot be undone.`)) {
        await axios.delete(`${API_BASE_URL}/api/models/${encodeURIComponent(modelName)}`);
        
        toast({
          title: "Model deleted",
          description: `Model ${modelName} has been deleted successfully`,
        });
        loadLocalModels();
      }
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.response?.data?.detail || "Failed to delete model",
        variant: "destructive",
      });
    }
  };

  const handleRefreshModels = () => {
    loadLocalModels();
    toast({
      title: "Refreshed",
      description: "Local models list updated",
    });
  };

  const openHuggingFaceGGUF = () => {
    window.open("https://huggingface.co/models?search=gguf", "_blank");
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.gguf')) {
      toast({
        title: "Invalid file",
        description: "Please select a .gguf file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_BASE_URL}/api/models/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast({
        title: "Upload successful",
        description: `Uploaded ${file.name} successfully`,
      });
      loadLocalModels();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.response?.data?.detail || "Failed to upload model",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gguf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    };
    input.click();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const ggufFile = files.find(file => file.name.endsWith('.gguf'));
    
    if (ggufFile) {
      handleFileUpload(ggufFile);
    } else {
      toast({
        title: "Invalid file",
        description: "Please drop a .gguf file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const renderResolvedFiles = () => {
    if (!resolvedData?.files) return null;

    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Available GGUF Files</h3>
        <ScrollArea className="h-[200px] rounded-md border">
          <div className="p-2 space-y-2">
            {resolvedData.files.map((file) => {
              const badgeInfo = file.compatibility ? getCompatibilityBadge(file.compatibility.compatibility) : null;
              const isExpanded = expandedFiles[file.filename];
              const task = Object.values(downloadTasks).find(t => t.filename === file.filename);
              
              return (
                <div key={file.filename} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">{file.human_size}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {badgeInfo && (
                        <Badge variant={badgeInfo.variant} className="flex items-center gap-1">
                          <badgeInfo.icon className="h-3 w-3" />
                          {badgeInfo.text}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleFileExpanded(file.filename)}
                        className="h-6 w-6 p-0"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {file.compatibility && (
                        <div className="text-xs text-muted-foreground">
                          <div>VRAM required: {file.compatibility.requirements.vram_gb_required}GB</div>
                          <div>RAM required: {file.compatibility.requirements.cpu_ram_gb_required}GB</div>
                          {file.compatibility.warnings.length > 0 && (
                            <div className="text-amber-400">
                              {file.compatibility.warnings[0]}
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        size="sm"
                        onClick={() => handleDownload(file)}
                        disabled={!!task || isDownloading}
                        className="w-full"
                      >
                        {task ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        {task ? 'Downloading...' : 'Download'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  };

  const renderDirectDownload = () => {
    if (!resolvedData || resolvedData.type !== "direct") return null;

    const file = resolvedData;
    const badgeInfo = file.compatibility ? getCompatibilityBadge(file.compatibility.compatibility) : null;
    const task = Object.values(downloadTasks).find(t => t.filename === file.filename);

    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Direct Download</h3>
        <div className="border rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{file.filename}</div>
              <div className="text-xs text-muted-foreground">{file.human_size}</div>
            </div>
            {badgeInfo && (
              <Badge variant={badgeInfo.variant} className="flex items-center gap-1">
                <badgeInfo.icon className="h-3 w-3" />
                {badgeInfo.text}
              </Badge>
            )}
          </div>

          {file.compatibility && (
            <div className="text-xs text-muted-foreground mb-2">
              <div>VRAM required: {file.compatibility.requirements.vram_gb_required}GB</div>
              <div>RAM required: {file.compatibility.requirements.cpu_ram_gb_required}GB</div>
              {file.compatibility.warnings.length > 0 && (
              <div className="text-amber-400">
                {file.compatibility.warnings[0]}
              </div>
              )}
            </div>
          )}

          <Button
            onClick={() => handleDownload(file as unknown as ResolvedFile)}
            disabled={!!task || isDownloading}
            className="w-full"
          >
            {task ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {task ? 'Downloading...' : 'Download'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-100/90 dark:bg-neutral-900/90 backdrop-blur-sm max-w-xl md:max-w-3xl">
        <DialogHeader className="p-2 mt-4">
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Load GGUF Model
          </DialogTitle>
          <DialogDescription>
            Download and manage local GGUF models for offline inference
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4 max-w-lg md:max-w-3xl">
          {/* Resolve Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Paste HuggingFace repo, repo:tag, or direct GGUF URL"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isResolving}
                className="flex-1 opacity-50"
              />
              <Button
                onClick={handleResolve}
                disabled={isResolving || !input.trim()}
                className="whitespace-nowrap"
              >
                {isResolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Info className="h-4 w-4" />
                )}
                Resolve
              </Button>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <button
                onClick={openHuggingFaceGGUF}
                className="text-blue-500 hover:text-blue-600 underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                See GGUF models available on HuggingFace
              </button>
            </div>
          </div>

          {/* Resolved Files */}
          {renderResolvedFiles()}
          {renderDirectDownload()}

          {/* Upload Section */}
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Upload GGUF Model</h3>
            <div
              className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-950' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleManualUpload}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag & drop a .gguf file here, or click to browse
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualUpload();
                }}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <FolderOpen className="h-4 w-4 mr-2" />
                )}
                {isUploading ? 'Uploading...' : 'Browse Files'}
              </Button>
            </div>
          </div>

          {/* Local Models List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Local Models</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshModels}
                disabled={isLoadingModels}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingModels ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <ScrollArea className="h-48 rounded-2xl border">
              {isLoadingModels ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading models...
                </div>
              ) : localModels.length === 0 && Object.keys(downloadTasks).length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No local GGUF models found
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {/* Active Downloads */}
                  {Object.values(downloadTasks).map((task) => (
                    <div
                      key={task.task_id}
                      className="p-2 rounded-md bg-accent/50 border border-accent"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm font-medium truncate">{task.filename}</div>
                          <div className="text-xs text-muted-foreground">Downloading...</div>
                        </div>
                        <div className="space-y-1">
                          <Progress value={task.progress} className="h-1" />
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>{Math.round(task.progress)}%</span>
                            <span>{Math.round(task.downloaded_bytes / 1024 / 1024)}MB / {Math.round(task.total_bytes / 1024 / 1024)}MB</span>
                          </div>
                        </div>
                        {task.error && (
                          <div className="text-xs text-destructive mt-1">{task.error}</div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Local Models */}
                  {localModels
                    .filter(model => !Object.values(downloadTasks).some(t => t.filename === model.name))
                    .map((model) => (
                      <div
                        key={model.name}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-accent group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{model.name}</div>
                          <div className="text-xs text-muted-foreground">{model.size}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLoadModel(model.name)}
                            className="whitespace-nowrap"
                          >
                            "Load"
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteModel(model.name)}
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GGUFModelLoader;
