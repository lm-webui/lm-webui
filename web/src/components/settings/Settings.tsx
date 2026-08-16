import React, { useState, useEffect } from "react";
import { fetchSettings, updateSettings, addApiKey, fetchModels, fetchImageModels, authFetch } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from "lucide-react";
import { SettingsSearch } from "./SettingsSearch";
import { ApiKeysTab } from "./ApiKeysTab";
import { ModelsTab } from "./ModelsTab";
import { InferenceTab } from "./InferenceTab";
import { RuntimeTab } from "./RuntimeTab";
import RuntimeManager from "@/components/runtime/RuntimeManager";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsProps {
  selectedLLM: string;
  onLLMChange: (value: string) => void;
  variant?: "icon" | "button";
  trigger?: React.ReactNode;
  availableModels?: string[];
  selectedModel?: string;
  onModelChange?: (value: string) => void;
  showRawResponse?: boolean;
  onRawResponseToggle?: (value: boolean) => void;
  /** When true, renders the settings tabs inline as a page instead of a Dialog modal. */
  inline?: boolean;
  /** Navigate to the full Runtime Manager page (instead of the inline modal). */
  onOpenRuntimeManager?: () => void;
}

export function Settings({
  selectedLLM,
  onLLMChange,
  variant = "icon",
  selectedModel = "",
  onModelChange = () => {},
  trigger,
  inline = false,
  onOpenRuntimeManager,
}: SettingsProps) {
  const [openAIKey, setOpenAIKey] = useState("");
  const [ollamaEndpoint, setOllamaEndpoint] = useState("http://localhost:11434");
  const [googleKey, setGoogleKey] = useState("");
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [runtimeManagerOpen, setRuntimeManagerOpen] = useState(false);
  const { user } = useAuth();

  // Enhanced settings
  const [temperature, setTemperature] = useState([0.7]);
  const [maxTokens, setMaxTokens] = useState([2048]);
  const [topP, setTopP] = useState([0.9]);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions.",
  );

  const [autoTitleGeneration, setAutoTitleGeneration] = useState(true);
  const [allTextModels, setAllTextModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [imageProvider, setImageProvider] = useState("openai");
  const [imageModel, setImageModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [localSearchEngine, setLocalSearchEngine] = useState("duckduckgo");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchSettings();
        setOpenAIKey(settings.openAIKey || "");
        setOllamaEndpoint(settings.ollamaEndpoint || "http://localhost:11434");

                        setGoogleKey(settings.googleKey || "");
        setStreamingEnabled(settings.streamingEnabled !== false);
        setTemperature([settings.temperature || 0.7]);
        setMaxTokens([settings.max_tokens || settings.maxTokens || 2048]);
        setTopP([settings.topP || 0.9]);
        setSystemPrompt(settings.systemPrompt || systemPrompt);
        setAutoTitleGeneration(settings.autoTitleGeneration !== false);
        setImageProvider(settings.defaultImageProvider || "openai");
        setImageModel(settings.defaultImageModel || "");
        setVisionModel(settings.defaultVisionModel || "");
        setLocalSearchEngine(settings.selectedSearchEngine || "duckduckgo");
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    if (isOpen || inline) {
      loadSettings();
      setLoadingModels(true);
      Promise.all([
        fetchModels(undefined, { allProviders: true }).then((res: any) => {
          const grouped = res as Record<string, string[]>;
          const all: string[] = [];
          Object.entries(grouped).forEach(([prov, models]) => {
            models.forEach((m: string) => all.push(prov + ":" + m));
          });
          setAllTextModels(all);
        }).catch(() => {}),
        fetchImageModels().then((res: any) => {
          const grouped = res as Record<string, string[]>;
          const all: string[] = [];
          Object.entries(grouped).forEach(([prov, models]) => {
            models.forEach((m: string) => all.push(`${prov}:${m}`));
          });
          setImageModels(all);
          // Default to a real available model when none is saved (like the text default)
          const first = all[0];
          if (first) {
            setImageModel((prev) => {
              if (prev) return prev;
              const parts = first.split(":");
              const prov = parts[0];
              const model = parts.slice(1).join(":");
              if (prov && model) {
                setImageProvider(prov);
                return model;
              }
              return prev;
            });
          }
        }).catch(() => {}),
        authFetch("/api/runtimes/vision/status").then((res: any) => {
          setVisionModels((res?.bundles || []).map((b: any) => b.name));
        }).catch(() => {}),
      ]).finally(() => setLoadingModels(false));
    }
  }, [isOpen, inline]);

  const saveSettings = async () => {
    const settings = {
      selectedLLM,
      openAIKey,
      ollamaEndpoint,
                        googleKey,
      streamingEnabled,
      temperature: temperature[0],
      max_tokens: maxTokens[0],
      topP: topP[0],
      systemPrompt,
      selectedModel,
      selectedSearchEngine: localSearchEngine,
      defaultImageProvider: imageProvider,
      defaultImageModel: imageModel,
      defaultVisionModel: visionModel,
      autoTitleGeneration,
    };

    try {
      await updateSettings(settings);

      // Save API keys to encrypted database only
      try {
        if (openAIKey) await addApiKey("openai", openAIKey);
        if (googleKey) await addApiKey("google", googleKey);
      } catch (apiKeyError) {
        console.warn(
          "Failed to save API keys to encrypted database:",
          apiKeyError,
        );
        // Continue with settings save even if API key save fails
      }

      setIsOpen(false);
      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    }
  };

  const content = (
    <>
      {inline ? (
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Settings</h2>
        </div>
      ) : (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left pb-2 shrink-0">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight mb-1">
            Settings
          </DialogTitle>
          <DialogDescription className="text-[9px] md:text-sm text-zinc-500 dark:text-zinc-400">
            Configure your AI assistant with advanced options and
            integrations.
          </DialogDescription>
        </div>
      )}
        <Tabs
            defaultValue="inference"
            className="w-full flex flex-col overflow-hidden min-h-0 flex-1"
          >
            <TabsList className={`grid w-full ${user?.role === "admin" ? "grid-cols-4" : "grid-cols-3"} rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs sm:text-sm shrink-0`}>
              <TabsTrigger value="inference" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Inference</TabsTrigger>
              <TabsTrigger value="provider" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Provider</TabsTrigger>
              <TabsTrigger value="models" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Models</TabsTrigger>
              {user?.role === "admin" && <TabsTrigger value="runtime" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Runtime</TabsTrigger>}
            </TabsList>

            <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 mt-3 space-y-4">

              <TabsContent value="inference" className="space-y-4 m-0">
                <InferenceTab
                  temperature={temperature}
                  setTemperature={setTemperature}
                  maxTokens={maxTokens}
                  setMaxTokens={setMaxTokens}
                  topP={topP}
                  setTopP={setTopP}
                  systemPrompt={systemPrompt}
                  setSystemPrompt={setSystemPrompt}
                  selectedLLM={selectedLLM}
                  onLLMChange={onLLMChange}
                  selectedModel={selectedModel}
                  onModelChange={onModelChange}
                  loadingModels={loadingModels}
                  allTextModels={allTextModels}
                  imageProvider={imageProvider}
                  setImageProvider={setImageProvider}
                  imageModel={imageModel}
                  setImageModel={setImageModel}
                  imageModels={imageModels}
                  visionModel={visionModel}
                  setVisionModel={setVisionModel}
                  visionModels={visionModels}
                  localSearchEngine={localSearchEngine}
                  setLocalSearchEngine={setLocalSearchEngine}
                />
              </TabsContent>

              <TabsContent value="provider" className="space-y-4 m-0">
                <ApiKeysTab />
                <SettingsSearch
                />
              </TabsContent>

              <TabsContent value="models" className="space-y-4 h-full">
                <ModelsTab />
              </TabsContent>

              {user?.role === "admin" && <TabsContent value="runtime" className="space-y-4 h-full">
                <RuntimeTab onOpenRuntimeManager={onOpenRuntimeManager || (() => setRuntimeManagerOpen(true))} />
              </TabsContent>}
            </div>
          </Tabs>

          <div className="flex justify-end items-center pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="border-zinc-200 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button onClick={saveSettings}>Save Settings</Button>
            </div>
          </div>
    </>
  );

  if (inline) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        {content}
      </div>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {trigger ? (
            trigger
          ) : variant === "icon" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 rounded-3xl hover:rounded-3xl hover:shadow-inner hover:bg-zinc-200 dark:hover:bg-zinc-800 px-2 py-2"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="min-h-[85vh] max-h-[85vh] sm:max-w-2xl overflow-hidden flex flex-col bg-neutral-100/90 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          {content}
        </DialogContent>
      </Dialog>

      {user?.role === "admin" && <RuntimeManager
        open={runtimeManagerOpen}
        onOpenChange={setRuntimeManagerOpen}
        onModelLoad={(model, provider) => { if (provider) onLLMChange(provider); onModelChange(model); }}
      />}
    </>
  );
}
