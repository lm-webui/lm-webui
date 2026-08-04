import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Wifi, WifiOff } from "lucide-react";
import { generateImage, fetchSettings, updateSettings } from "@/utils/api";
import { PROVIDERS } from "@/utils/modelProviders";
import { toast } from "sonner";

interface ProviderStatus {
  label: string;
  icon: string;
  connected: boolean;
  models: string[];
}

export default function ImageWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [steps, setSteps] = useState(20);
  const [seed, setSeed] = useState(-1);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [batch, setBatch] = useState(1);
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const BASE = import.meta.env.VITE_BACKEND_URL || "";

  // Load saved default image model preferences on mount
  useEffect(() => {
    fetchSettings().then((s: any) => {
      if (s.defaultImageProvider) setProvider(s.defaultImageProvider);
      if (s.defaultImageModel) setModel(s.defaultImageModel);
    }).catch(() => {});
  }, []);

  // Debounced save of image preferences (merges with existing settings)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSettings().then((existing: any) => {
        updateSettings({
          ...existing,
          defaultImageProvider: provider,
          defaultImageModel: model,
        }).catch(() => {});
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [provider, model]);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, modelsRes, rtRes] = await Promise.all([
          fetch(`${BASE}/api/images/status`, { credentials: "include" }),
          fetch(`${BASE}/api/images/models`, { credentials: "include" }),
          fetch(`${BASE}/api/runtimes`, { credentials: "include" }),
        ]);
        const status = await statusRes.json();
        const modelsData = await modelsRes.json();
        const rtData = await rtRes.json();
        const runtimes: Record<string, any> = {};
        for (const r of rtData.runtimes || []) runtimes[r.type] = r;
        const apiModels = modelsData.models || {};

        setProviders({
          openai: {
            label: PROVIDERS.openai!.name, icon: "cloud",
            connected: status.providers?.openai === "ready",
            models: apiModels.openai || ["dall-e-3", "dall-e-2"],
          },
          google: {
            label: PROVIDERS.google!.name, icon: "cloud",
            connected: status.providers?.google === "ready",
            models: apiModels.google || ["imagen-3", "gemini-2.5-flash-image"],
          },
          local: {
            label: "Local", icon: "server",
            connected: runtimes.ollama?.installed || runtimes.gguf?.installed,
            models: apiModels.local || ["sdxl", "flux-dev", "flux-schnell", "ltx"],
          },
        });
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const SIZE_PRESETS: Record<string, { value: string; label: string }[]> = {
    openai: [
      { value: "1024x1024", label: "Square (1024×1024)" },
      { value: "1792x1024", label: "Landscape (1792×1024)" },
      { value: "1024x1792", label: "Portrait (1024×1792)" },
    ],
    google: [
      { value: "1:1", label: "Square (1:1)" },
      { value: "4:3", label: "Landscape (4:3)" },
      { value: "16:9", label: "Landscape Wide (16:9)" },
      { value: "3:4", label: "Portrait (3:4)" },
      { value: "9:16", label: "Portrait Tall (9:16)" },
    ],
    local: [
      { value: "1024x1024", label: "Square (1024×1024)" },
      { value: "1536x1024", label: "Landscape (1536×1024)" },
      { value: "1024x1536", label: "Portrait (1024×1536)" },
    ],
  };

  const handleProviderChange = (p: string) => {
    setProvider(p);
    const models = providers[p]?.models || [];
    if (models.length) setModel(models[0]!);
    const sizes = (SIZE_PRESETS[p] || SIZE_PRESETS.openai)!;
    if (sizes.length) setSize(sizes[0]!.value);
    if (p === "google") setQuality("auto");
    else setQuality("auto");
  };

  // Once providers load, set initial model if not already set
  useEffect(() => {
    if (!loading && providers[provider]?.models.length && !providers[provider]?.models.includes(model)) {
      setModel(providers[provider]!.models[0]!);
    }
  }, [loading]);

  // Listen for drag-back from Gallery
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const d = e.detail;
      if (d.prompt) setPrompt(d.prompt);
      if (d.model) setModel(d.model);
      if (d.size) setSize(d.size);
      if (d.steps) setSteps(Number(d.steps));
      if (d.seed !== undefined) setSeed(Number(d.seed));
    };
    window.addEventListener("studio-load", handler as EventListener);
    return () => window.removeEventListener("studio-load", handler as EventListener);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    const convId = `batch_${Date.now()}`;
    try {
      for (let i = 0; i < batch; i++) {
        const imageUrl = await generateImage({
          provider, model, prompt,
          conversation_id: convId,
          params: { size, quality, steps, seed: seed >= 0 ? seed + i : undefined },
        } as any);
        if (imageUrl) setResults((prev) => [imageUrl, ...prev]);
        if (i < batch - 1) await new Promise(r => setTimeout(r, 300));
      }
      window.dispatchEvent(new Event("gallery-refresh"));
      toast.success(`Generated ${batch} image${batch > 1 ? "s" : ""} — check Gallery`);
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-zinc-800 dark:text-zinc-100">Studio</h2>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-zinc-500">Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image..."
          className="w-full resize-none rounded-xl border border-zinc-200 bg-neutral-100 p-4 text-sm outline-none focus:outline-none dark:border-zinc-700 dark:bg-neutral-800 dark:text-zinc-100"
          rows={3} />
      </div>

      {provider === "comfyui" && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Negative prompt</label>
          <input value={negative} onChange={(e) => setNegative(e.target.value)}
            placeholder="What to avoid..."
            className="w-full rounded-xl border border-zinc-200 bg-neutral-100 px-4 py-2 text-sm outline-none focus:outline-none dark:border-zinc-700 dark:bg-neutral-800 dark:text-zinc-100" />
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Provider</label>
          {loading ? (
            <div className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center px-3 text-sm text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...
            </div>
          ) : (
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(providers).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="flex items-center gap-2">
                    <span className="flex items-center gap-2">
                      {v.connected
                        ? <Wifi className="h-3 w-3 text-green-500" />
                        : <WifiOff className="h-3 w-3 text-zinc-400" />
                      }
                      <span className={v.connected ? "" : "text-zinc-400"}>{v.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Model</label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(providers[provider]?.models || []).map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              {(SIZE_PRESETS[provider] || SIZE_PRESETS.openai)!.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "openai" && (
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-zinc-500">Quality</label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="w-16">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Batch</label>
          <Select value={String(batch)} onValueChange={(v) => setBatch(Number(v))}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "comfyui" && (
          <>
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-zinc-500">Steps</label>
              <input type="number" min={1} max={100} value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-200 bg-neutral-100 px-2 py-2 text-sm text-center outline-none focus:outline-none dark:border-zinc-700 dark:bg-neutral-800 dark:text-zinc-100" />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-zinc-500">Seed</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-200 bg-neutral-100 px-2 py-2 text-sm text-center outline-none focus:outline-none dark:border-zinc-700 dark:bg-neutral-800 dark:text-zinc-100" />
            </div>
          </>
        )}
      </div>

      <Button onClick={handleGenerate} disabled={generating || !prompt.trim()}
        className="mb-8 self-start rounded-full px-6">
        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {generating ? "Generating..." : "Generate"}
      </Button>

      {results.length === 0 && !generating ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No image generated yet</p>
          <p className="text-xs mt-1">Start creating your first image.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((url, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <img src={url} alt="" className="w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
