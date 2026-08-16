/**
 * InferenceTab — Generation Parameters + SmartModality Config defaults.
 * Controlled component: state lives in Settings.tsx (shared with the central
 * Save button and the Provider tab's model lists), passed in as props.
 */
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, SlidersHorizontal } from "lucide-react";

interface InferenceTabProps {
  temperature: number[];
  setTemperature: (v: number[]) => void;
  maxTokens: number[];
  setMaxTokens: (v: number[]) => void;
  topP: number[];
  setTopP: (v: number[]) => void;
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  selectedLLM?: string;
  onLLMChange?: (v: string) => void;
  selectedModel?: string;
  onModelChange?: (v: string) => void;
  loadingModels: boolean;
  allTextModels: string[];
  imageProvider: string;
  setImageProvider: (v: string) => void;
  imageModel: string;
  setImageModel: (v: string) => void;
  imageModels: string[];
  visionModel: string;
  setVisionModel: (v: string) => void;
  visionModels: string[];
  localSearchEngine: string;
  setLocalSearchEngine: (v: string) => void;
}

export function InferenceTab({
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  topP,
  setTopP,
  systemPrompt,
  setSystemPrompt,
  selectedLLM,
  onLLMChange,
  selectedModel,
  onModelChange,
  loadingModels,
  allTextModels,
  imageProvider,
  setImageProvider,
  imageModel,
  setImageModel,
  imageModels,
  visionModel,
  setVisionModel,
  visionModels,
  localSearchEngine,
  setLocalSearchEngine,
}: InferenceTabProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Generation Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-8">
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
        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2 -mt-6"><Cpu className="h-4 w-4" /> SmartModality Config</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 p-8 mx-6 my-1 rounded-3xl bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800 border-neutral-200 dark:border-neutral-700">
          <div className="space-y-2">
            <Label className="text-sm">Default Text Model</Label>
            <Select value={selectedLLM ? `${selectedLLM}:${selectedModel}` : ""} onValueChange={(v) => {
              const [prov, ...rest] = v.split(":");
              const modelName = rest.join(":");
              if (prov && modelName) { onLLMChange?.(prov); onModelChange?.(modelName); }
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
            <Label className="text-sm">Default Vision Model</Label>
            <Select value={visionModel} onValueChange={setVisionModel}>
              <SelectTrigger><SelectValue placeholder={loadingModels ? "Loading..." : visionModels.length === 0 ? "No vision model installed" : "Select vision model"} /></SelectTrigger>
              <SelectContent>
                {visionModels.length === 0 && !loadingModels ? (
                  <div className="px-2 py-4 text-xs text-muted-foreground text-center">No vision model installed — download one from Runtime Manager → GGUF</div>
                ) : (
                  visionModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Default Web Search</Label>
            <Select value={localSearchEngine} onValueChange={setLocalSearchEngine}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
                <SelectItem value="searxng">SearXNG</SelectItem>
                <SelectItem value="google_search">Google Search</SelectItem>
                <SelectItem value="perplexity">Perplexity</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
