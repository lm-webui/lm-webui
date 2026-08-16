import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Wifi, WifiOff, Download } from "lucide-react";
import { generateImage, fetchSettings, updateSettings } from "@/utils/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
            // "local" routes to the ComfyUI runtime pipeline (backend provider "comfyui")
            connected: !!runtimes.comfyui?.installed,
            models: apiModels.local || ["sdxl", "flux-dev", "flux-schnell", "sd3", "ltx"],
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
    setQuality("auto");
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
          provider: provider === "local" ? "comfyui" : provider, model, prompt,
          conversation_id: convId,
          params: {
            size, quality, steps, seed: seed >= 0 ? seed + i : undefined,
            // negative prompt applies only to the local ComfyUI path
            ...(provider === "local" ? { negative } : {}),
          },
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

  const handleDownload = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = url.split("/").pop() || "image.png";
    link.click();
  };

  return (
    <div className="flex h-full flex-col bg-background overflow-y-auto py-6 px-12">
      <div className="flex items-center gap-2 pb-6">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Image Studio</h2>
      </div>

      <div className="mb-3 space-y-1.5">
        <Label>Prompt</Label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image..."
          className="flex w-full resize-none rounded-2xl border border-input bg-background shadow-inner p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={3} />
      </div>

      {provider === "local" && (
        <div className="mb-4 space-y-1.5">
          <Label>Negative prompt</Label>
          <Input value={negative} onChange={(e) => setNegative(e.target.value)}
            placeholder="What to avoid..." className="rounded-2xl" />
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]">
          <Label className="mb-1">Provider</Label>
          {loading ? (
            <div className="h-10 rounded-2xl border border-zinc-200 dark:border-zinc-700 flex items-center px-3 text-sm text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin mr-2" /> Loading...
            </div>
          ) : (
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="rounded-2xl">
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
          <Label className="mb-1">Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="rounded-2xl">
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
          <Label className="mb-1">Size</Label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
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
            <Label className="mb-1">Quality</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
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
          <Label className="mb-1">Batch</Label>
          <Select value={String(batch)} onValueChange={(v) => setBatch(Number(v))}>
            <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "local" && (
          <>
            <div className="w-20">
              <Label className="mb-1">Steps</Label>
              <Input type="number" min={1} max={100} value={steps}
                onChange={(e) => setSteps(Number(e.target.value))} className="text-center" />
            </div>
            <div className="w-20">
              <Label className="mb-1">Seed</Label>
              <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="text-center" />
            </div>
          </>
        )}
      </div>

      {providers[provider] && !providers[provider].connected && (
        <Badge variant="outline" className="mb-4 self-start text-amber-600 dark:text-amber-400 border-amber-500/30">
          {provider === "local"
            ? "ComfyUI isn't running — install/start it in Runtime Manager."
            : `${providers[provider].label} isn't configured — add a key in Settings → Provider.`}
        </Badge>
      )}

      <Button onClick={handleGenerate} disabled={generating || !prompt.trim()}
        className="mb-8 self-end rounded-full px-6">
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
            <div key={i} className="group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
              <img src={url} alt="" className="w-full object-cover" />
              <Button size="icon" variant="secondary"
                onClick={() => handleDownload(url)}
                className="absolute top-2 right-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
