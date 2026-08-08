import React, { useState, useEffect } from "react";
import { fetchSettings, updateSettings, addApiKey, fetchModels, fetchImageModels } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon } from "lucide-react";
import { SettingsSearch } from "./SettingsSearch";
import { ApiKeysTab } from "./ApiKeysTab";
import { ModelsTab } from "./ModelsTab";
import { RuntimeTab } from "./RuntimeTab";
import RuntimeManager from "@/components/models/RuntimeManager";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsProps {
  selectedLLM: string;
  onLLMChange: (value: string) => void;
  variant?: "icon" | "button";
  trigger?: React.ReactNode;
  selectedSearchEngine?: string;
  onSearchEngineChange?: (value: string) => void;
  availableModels?: string[];
  selectedModel?: string;
  onModelChange?: (value: string) => void;
  showRawResponse?: boolean;
  onRawResponseToggle?: (value: boolean) => void;
  /** When true, renders the settings tabs inline as a page instead of a Dialog modal. */
  inline?: boolean;
}

export function Settings({
  selectedLLM,
  onLLMChange,
  variant = "icon",
  selectedSearchEngine = "duckduckgo",
  onSearchEngineChange = () => {},
  availableModels = [],
  selectedModel = "",
  onModelChange = () => {},
  showRawResponse = false,
  onRawResponseToggle = () => {},
  trigger,
  inline = false,
}: SettingsProps) {
  const [openAIKey, setOpenAIKey] = useState("");
  const [ollamaEndpoint, setOllamaEndpoint] = useState("http://localhost:11434");
  const [googleKey, setGoogleKey] = useState("");
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [runtimeManagerOpen, setRuntimeManagerOpen] = useState(false);
  const { user } = useAuth();

  // Local state for search engine to ensure persistence works correctly
  const [localSearchEngine, setLocalSearchEngine] =
    useState(selectedSearchEngine);

  // Sync local state when prop updates
  useEffect(() => {
    setLocalSearchEngine(selectedSearchEngine);
  }, [selectedSearchEngine]);

  const handleSearchEngineChange = (value: string) => {
    setLocalSearchEngine(value);
    onSearchEngineChange(value);
  };

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
  const [imageModel, setImageModel] = useState("dall-e-3");

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
        setImageModel(settings.defaultImageModel || "dall-e-3");
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
      selectedSearchEngine: localSearchEngine,
      selectedModel,
      defaultImageProvider: imageProvider,
      defaultImageModel: imageModel,
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
            <TabsList className="grid w-full grid-cols-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs sm:text-sm shrink-0">
              <TabsTrigger value="inference" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Inference</TabsTrigger>
              <TabsTrigger value="provider" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Provider</TabsTrigger>
              <TabsTrigger value="models" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Models</TabsTrigger>
              {user?.role === "admin" && <TabsTrigger value="runtime" className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700">Runtime</TabsTrigger>}
            </TabsList>

            <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 mt-3 space-y-4">

              <TabsContent value="inference" className="space-y-4 m-0">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Generation Parameters</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="temperature" className="text-sm sm:text-base">Temperature: {temperature[0]}</Label>
                      <Slider id="temperature" min={0} max={2} step={0.1} value={temperature} onValueChange={setTemperature} className="w-full" />
                      <div className="text-xs sm:text-sm text-muted-foreground">Controls randomness in responses (0 = deterministic, 2 = very creative)</div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-tokens" className="text-sm sm:text-base">Max Tokens: {maxTokens[0]}</Label>
                      <Slider id="max-tokens" min={100} max={8000} step={100} value={maxTokens} onValueChange={setMaxTokens} className="w-full" />
                      <div className="text-xs sm:text-sm text-muted-foreground">Maximum length of the response</div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="top-p" className="text-sm sm:text-base">Top P: {topP[0]}</Label>
                      <Slider id="top-p" min={0} max={1} step={0.1} value={topP} onValueChange={setTopP} className="w-full" />
                      <div className="text-xs sm:text-sm text-muted-foreground">Controls diversity of responses (nucleus sampling)</div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="system-prompt" className="text-sm sm:text-base">System Prompt</Label>
                      <textarea id="system-prompt" className="flex min-h-[80px] sm:min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="You are a helpful AI assistant..." value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Default Models</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Default Text Model</Label>
                      <Select value={selectedLLM ? `${selectedLLM}:${selectedModel}` : ""} onValueChange={(v) => {
                        const [prov, ...rest] = v.split(":");
                        const modelName = rest.join(":");
                        if (prov && modelName) { onLLMChange(prov); onModelChange(modelName); }
                      }}>
                        <SelectTrigger><SelectValue placeholder={loadingModels ? "Loading..." : allTextModels.length === 0 ? "No default saved" : "Select a model"} /></SelectTrigger>
                        <SelectContent>
                          {allTextModels.length === 0 && !loadingModels ? (
                            <div className="px-2 py-4 text-xs text-muted-foreground text-center">No default saved</div>
                          ) : (
                            allTextModels.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Default Image Model</Label>
                      <Select value={imageProvider ? `${imageProvider}:${imageModel}` : ""} onValueChange={(v) => { const [prov, ...rest] = v.split(":"); const m = rest.join(":"); if (prov && m) { setImageProvider(prov); setImageModel(m); } }}>
                        <SelectTrigger><SelectValue placeholder={loadingModels ? "Loading..." : imageModels.length === 0 ? "No default saved" : "Select image model"} /></SelectTrigger>
                        <SelectContent>
                          {imageModels.length === 0 && !loadingModels ? (
                            <div className="px-2 py-4 text-xs text-muted-foreground text-center">No default saved</div>
                          ) : (
                            imageModels.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Default Web Search</Label>
                      <Select value={localSearchEngine} onValueChange={handleSearchEngineChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="bing">Bing</SelectItem>
                          <SelectItem value="perplexity">Perplexity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="provider" className="space-y-4 m-0">
                <ApiKeysTab />
                <SettingsSearch
                  selectedSearchEngine={localSearchEngine}
                  onSearchEngineChange={handleSearchEngineChange}
                />
              </TabsContent>

              <TabsContent value="models" className="space-y-4 h-full">
                <ModelsTab />
              </TabsContent>

              {user?.role === "admin" && <TabsContent value="runtime" className="space-y-4 h-full">
                <RuntimeTab onOpenRuntimeManager={() => setRuntimeManagerOpen(true)} />
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
