import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Settings2,
  Mic,
  Globe,
  Image,
  Code,
  Paperclip,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { FileService } from "../features/files/fileService";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ModelSelector } from "./models/ModelSelector";
import { generateImage } from "@/utils/api";

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
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevSearchRef = useRef(false);

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

  const handleSend = async () => {
    if (!value.trim() || busy) return;

    let ok = false;
    if (isImageMode) {
      ok = await onSend(value, [{ type: "generating_image", prompt: value, provider: selectedLLM, model: selectedModel }]);
    } else {
      ok = await onSend(value, uploadedFiles);
    }

    // Only clear the prompt on success — on failure, restore it so the user can retry
    if (ok) {
      setValue("");
      setUploadedFiles([]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      try {
        const result = await FileService.uploadFiles(
          e.target.files,
          conversationId || "",
        );
        if (result.success && result.results) {
          const newFiles = result.results;
          setUploadedFiles((prev) => [...prev, ...newFiles]);
        }
      } catch (error) {
        console.error("Upload failed", error);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-none backdrop-blur-sm bg-transparent pt-2">
      <div className="mx-auto flex flex-col rounded-3xl border border-zinc-200 bg-neutral-300 dark:border-zinc-800/50 dark:bg-neutral-900 shadow-inner transition-all duration-200 relative">
        {uploadedFiles.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1 bg-zinc-200 dark:bg-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 animate-in fade-in zoom-in duration-200"
              >
                <span className="truncate max-w-[150px]">{file.filename}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-1 hover:text-red-500 rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
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
      <div className="flex items-center justify-center text-[7px] text-neutral-500/50 mt-1 -mb-1">
        <p>LLM can make mistakes, please double check</p>
      </div>
    </div>
  );
}
