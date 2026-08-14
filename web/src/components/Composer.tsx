import { useRef, useState, useEffect } from "react";
import {
  Send,
  Loader2,
  Settings2,
  Globe,
  Image,
  File,
  Code,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { FileService } from "../features/files/fileService";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "./ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModelSelector } from "./models/ModelSelector";
import { toast } from "sonner";

interface ComposerProps {
  onSend: (text: string, files: any[]) => Promise<boolean>;
  busy: boolean;
  conversationId?: string;
  isSearchEnabled: boolean;
  setIsSearchEnabled: (enabled: boolean) => void;
  isImageMode: boolean;
  setIsImageMode: (enabled: boolean) => void;
  isCodingMode: boolean;
  setIsCodingMode: (enabled: boolean) => void;
  selectedModel?: string;
  selectedLLM?: string;
  onLLMChange?: (llm: string) => void;
  onModelChange?: (model: string) => void;
  availableModels?: string[];
  initialValue?: string;
}

export default function Composer({
  onSend,
  busy,
  conversationId,
  isSearchEnabled,
  setIsSearchEnabled,
  isImageMode,
  setIsImageMode,
  isCodingMode,
  setIsCodingMode,
  selectedModel,
  selectedLLM,
  onLLMChange,
  onModelChange,
  availableModels,
  initialValue = "",
}: ComposerProps) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (initialValue) setValue(initialValue); }, [initialValue]);
  const [isUploading, setIsUploading] = useState(false);
  // Pending files (not yet uploaded) — held locally so abandoned files never hit the server.
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; previewUrl?: string }[]>([]);
  const urlsRef = useRef<string[]>([]); // object URLs to revoke on unmount
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevSearchRef = useRef(false);
  const [modelOpen, setModelOpen] = useState(false);
  const isMobile = useIsMobile();

  // Image mode switching — save text model, load image model, restore on exit
  const prevModelRef = useRef("");
  const prevLLMRef = useRef("");
  useEffect(() => {
    if (isImageMode) {
      prevModelRef.current = selectedModel || "";
      prevLLMRef.current = selectedLLM || "";
      import("@/utils/api").then(({ fetchSettings }) => {
        fetchSettings().then((s: any) => {
          const prov = s.defaultImageProvider || "";
          const modelName = s.defaultImageModel || "";
          if (prov && modelName) {
            onLLMChange?.(prov);
            onModelChange?.(modelName);
          }
        }).catch(() => {});
      });
    } else if (prevModelRef.current) {
      onLLMChange?.(prevLLMRef.current);
      onModelChange?.(prevModelRef.current);
    }
  }, [isImageMode]);

  // Image mode disables web search — save/restore state
  useEffect(() => {
    if (isImageMode) {
      prevSearchRef.current = isSearchEnabled;
      if (isSearchEnabled) setIsSearchEnabled(false);
    } else if (prevSearchRef.current) {
      setIsSearchEnabled(true);
    }
  }, [isImageMode]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [value]);

  const clearPendingFiles = () => {
    setUploadedFiles((prev) => {
      prev.forEach((u) => { if (u.previewUrl) URL.revokeObjectURL(u.previewUrl); });
      return [];
    });
  };

  // Revoke any object URLs on unmount.
  useEffect(() => {
    const urls = urlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const handleSend = async () => {
    if (!value.trim() || busy) return;

    let ok = false;
    if (isImageMode) {
      ok = await onSend(value, [{ type: "generating_image", prompt: value, provider: selectedLLM, model: selectedModel }]);
    } else {
      // Defer upload to send-time: upload pending files, then send with their refs.
      let refs: any[] = [];
      if (uploadedFiles.length) {
        setIsUploading(true);
        try {
          const result = await FileService.uploadFiles(uploadedFiles.map((u) => u.file), conversationId || "");
          if (!result.success || !result.results) {
            toast.error("Upload failed");
            setIsUploading(false);
            return;
          }
          refs = result.results;
        } catch (error) {
          console.error("Upload failed", error);
          toast.error("Upload failed");
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }
      ok = await onSend(value, refs);
    }

    // Only clear the prompt on success — on failure, restore it so the user can retry
    if (ok) {
      setValue("");
      clearPendingFiles();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const pending = Array.from(files).map((file) => {
        const isImg = file.type.startsWith("image/");
        if (isImg) {
          const previewUrl = URL.createObjectURL(file);
          urlsRef.current.push(previewUrl);
          return { file, previewUrl };
        }
        return { file };
      });
      setUploadedFiles((prev) => [...prev, ...pending]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="border-none backdrop-blur-sm bg-transparent pt-2">
      <Popover open={modelOpen} onOpenChange={setModelOpen}>
      <PopoverAnchor asChild>
      <div className="mx-auto flex flex-col rounded-3xl border border-zinc-200 bg-neutral-300 dark:border-zinc-800/50 dark:bg-neutral-900 shadow-inner transition-all duration-200 relative">
        {uploadedFiles.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
            {uploadedFiles.map(({ file, previewUrl }, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-zinc-200 dark:bg-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 animate-in fade-in zoom-in duration-200"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt={file.name} className="h-6 w-6 rounded object-cover" />
                ) : file.type.startsWith("image/") ? (
                  <Image className="h-4 w-4 shrink-0 text-zinc-400" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-zinc-400" />
                )}
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-1 hover:text-red-500 rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {isUploading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400 self-center" />}
          </div>
        )}

        <div className="flex-1 px-3 pt-2 ml-1 md:px-4 md:pt-4">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={"Ask LM WebUI..."}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-700/30 dark:placeholder:text-zinc-400/30 min-h-[24px] max-h-[50vh] overflow-y-auto leading-6"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between px-2 pb-2 pl-3 md:px-3 md:pb-3 md:pl-4">
          <div className="flex items-center gap-1">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-200"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || busy}
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>

            {/* Tools popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-zinc-500 mx-3 h-8 w-8"
                >
                  <Settings2 className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-56 p-2 rounded-2xl bg-neutral-200/90 dark:bg-neutral-900 border-zinc-300/50 dark:border-zinc-800/50"
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() =>
                      !isImageMode && setIsSearchEnabled(!isSearchEnabled)
                    }
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${isImageMode ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"}`}
                  >
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4" /> Search
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border-2 transition-colors ${isSearchEnabled ? "bg-cyan-500 border-cyan-500" : "border-zinc-400 dark:border-zinc-600"}`}
                    />
                  </button>
                  <button
                    onClick={() => setIsImageMode(!isImageMode)}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span className="flex items-center gap-2">
                      <Image className="h-4 w-4" /> Generate Image
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border-2 transition-colors ${isImageMode ? "bg-purple-500 border-purple-500" : "border-zinc-400 dark:border-zinc-600"}`}
                    />
                  </button>
                  <button
                    onClick={() => setIsCodingMode(!isCodingMode)}
                    className="flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span className="flex items-center gap-2">
                      <Code className="h-4 w-4" /> Coding Mode
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border-2 transition-colors ${isCodingMode ? "bg-emerald-500 border-emerald-500" : "border-zinc-400 dark:border-zinc-600"}`}
                    />
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Active tool badges inline */}
            {isSearchEnabled && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-neutral-600 px-2 py-0.5 font-medium">
                <Globe className="w-4 h-4" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-neutral-400 hover:text-neutral-300">
            <ModelSelector
              external
              open={modelOpen}
              onOpenChange={setModelOpen}
              side={isMobile ? "bottom" : "top"}
              selectedLLM={selectedLLM || "openai"}
              onLLMChange={onLLMChange || (() => {})}
              selectedModel={selectedModel || ""}
              onModelChange={onModelChange || (() => {})}
              availableModels={
                isImageMode
                  ? (availableModels || []).filter((m) =>
                      [
                        "dall-e",
                        "gpt-image",
                        "imagen",
                        "-image",
                        "gemini-3",
                        "gemini-2.5-flash-image",
                      ].some((k) => m.toLowerCase().includes(k)),
                    )
                  : availableModels || []
              }
            />
            <Button
              onClick={handleSend}
              disabled={busy || !value.trim()}
              size="icon"
              className={cn(
                "rounded-full h-10 w-10",
                value.trim()
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800",
              )}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
      </PopoverAnchor>
      </Popover>
      <div className="flex items-center justify-center text-[7px] text-neutral-500/50 mt-1 -mb-1">
        <p>LLM can make mistakes, please double check</p>
      </div>
    </div>
  );
}
