/**
 * ImageGenTab — ComfyUI image-generation engine management.
 * Controlled component: state + handlers live in RuntimeManager and are passed in.
 * The checkpoint download Dialog lives in RuntimeManager (shared state), not here.
 *
 * ComfyUI is a *managed* engine (installed and run from here, like MLX) rather than
 * something the user runs separately and points us at. The external-endpoint path is kept
 * as a documented fallback for people who already run ComfyUI elsewhere.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Image, CheckCircle, XCircle, ExternalLink, Download, Trash2, ChevronDown, Copy,
  Play, Square, Loader2, AlertTriangle,
} from "lucide-react";

export interface ComfyuiStatus {
  installed: boolean;
  running: boolean;
  ready?: boolean;
  version?: string | null;
  device?: string | null;
  device_type?: string | null;
  vram_gb?: number | null;
  checkpoints: string[];
  endpoint: string;
  port: number;
  engine_dir?: string;
  last_error?: string;
}

export interface ComfyuiInstallState {
  status: string; // idle | running | completed | failed
  step: string;
  error?: string | null;
  log_tail?: string;
}

interface DetectedExternal {
  type: string;
  installed: boolean;
  status: string;
  port?: number;
  endpoint?: string;
}

interface ImageGenTabProps {
  comfyuiStatus: ComfyuiStatus | null;
  comfyuiInstall: ComfyuiInstallState | null;
  installComfyui: () => void;
  startComfyui: () => void;
  stopComfyui: () => void;
  uninstallComfyui: () => void;
  openComfyDownload: () => void;
  comfyuiEndpoint: string;
  setComfyuiEndpoint: (v: string) => void;
  connectComfyui: () => void;
  disconnectComfyui: () => void;
  detectedExternals: DetectedExternal[];
  copyToClipboard: (text: string) => void;
}

export function ImageGenTab({
  comfyuiStatus, comfyuiInstall, installComfyui, startComfyui, stopComfyui,
  uninstallComfyui, openComfyDownload, comfyuiEndpoint, setComfyuiEndpoint,
  connectComfyui, disconnectComfyui, detectedExternals, copyToClipboard,
}: ImageGenTabProps) {
  const [setupOpen, setSetupOpen] = useState(false);

  const state: "missing" | "installing" | "stopped" | "running" | "starting" | "broken" =
    comfyuiInstall?.status === "running" ? "installing"
    : comfyuiInstall?.status === "failed" ? "broken"
    : !comfyuiStatus?.installed ? "missing"
    : comfyuiStatus?.running ? "running"
    : "stopped";

  const checkpoints = comfyuiStatus?.checkpoints ?? [];
  const endpoint = comfyuiStatus?.endpoint || comfyuiEndpoint;

  return (
    <Card className={state === "running" ? "border-green-200 dark:border-green-800" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-pink-500" />
            <CardTitle className="text-base">Image-Gen</CardTitle>
            {state === "running" && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="h-3 w-3 mr-1" /> Running
              </Badge>
            )}
            {state === "stopped" && <Badge variant="secondary">Stopped</Badge>}
            {state === "installing" && (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Installing
              </Badge>
            )}
            {state === "missing" && (
              <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Not installed</Badge>
            )}
            {state === "broken" && (
              <Badge variant="secondary">
                <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" /> Install failed
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Managed ComfyUI engine for local image generation. Install once, then start and stop it here.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ── Not installed ─────────────────────────────────────────── */}
        {state === "missing" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Installs ComfyUI into the app's data directory with its own virtualenv.
              The download is large (PyTorch, 2–5 GB) and takes several minutes.
            </p>
            <Button size="sm" className="gap-1" onClick={installComfyui}>
              <Download className="h-3 w-3" /> Install ComfyUI
            </Button>
          </div>
        )}

        {/* ── Installing / failed ───────────────────────────────────── */}
        {(state === "installing" || state === "broken") && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {state === "installing" && <Loader2 className="h-3 w-3 animate-spin" />}
              <span>{comfyuiInstall?.step || "starting"}…</span>
            </div>
            {comfyuiInstall?.error && (
              <pre className="text-xs whitespace-pre-wrap break-all bg-neutral-100 dark:bg-neutral-800 p-2 rounded max-h-40 overflow-y-auto">
                {comfyuiInstall.error}
              </pre>
            )}
            {comfyuiInstall?.log_tail && (
              <div className="text-xs text-muted-foreground font-mono truncate" title={comfyuiInstall.log_tail}>
                {comfyuiInstall.log_tail}
              </div>
            )}
            {state === "broken" && (
              <Button size="sm" variant="outline" className="gap-1" onClick={installComfyui}>
                <Download className="h-3 w-3" /> Retry install
              </Button>
            )}
          </div>
        )}

        {/* ── Running ───────────────────────────────────────────────── */}
        {state === "running" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Running at {endpoint}
              {comfyuiStatus?.version && (
                <span className="text-muted-foreground">· v{comfyuiStatus.version}</span>
              )}
            </div>
            {comfyuiStatus?.device && (
              <div className="text-xs text-muted-foreground">
                {comfyuiStatus.device}
                {comfyuiStatus.vram_gb ? ` · ${comfyuiStatus.vram_gb} GB VRAM` : ""}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {checkpoints.length === 0
                ? "No image models installed yet — download one to start generating."
                : `${checkpoints.length} model${checkpoints.length === 1 ? "" : "s"}: ${checkpoints.join(", ")}`}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={openComfyDownload}>
                <Download className="h-3 w-3" /> Download model
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={stopComfyui}>
                <Square className="h-3 w-3" /> Stop
              </Button>
            </div>
          </div>
        )}

        {/* ── Installed but stopped ─────────────────────────────────── */}
        {state === "stopped" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Installed{comfyuiStatus?.engine_dir ? ` at ${comfyuiStatus.engine_dir}` : ""}, not running.
              {comfyuiStatus?.last_error ? ` Last error: ${comfyuiStatus.last_error}` : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7 gap-1" onClick={startComfyui}>
                <Play className="h-3 w-3" /> Start
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={openComfyDownload}>
                <Download className="h-3 w-3" /> Download model
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={uninstallComfyui}>
                <Trash2 className="h-3 w-3" /> Uninstall
              </Button>
            </div>
          </div>
        )}

        {/* ── External fallback ─────────────────────────────────────── */}
        <Collapsible open={setupOpen} onOpenChange={setSetupOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={`h-3 w-3 transition-transform ${setupOpen ? "rotate-180" : ""}`} />
            Use an external ComfyUI instead
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Already running ComfyUI somewhere else (another machine, or outside the app)?
                Point image generation at it. The managed engine above is ignored while this is set.
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor="comfyui-endpoint" className="sr-only">ComfyUI endpoint</Label>
                <Input
                  id="comfyui-endpoint" name="endpoint" type="url" value={comfyuiEndpoint}
                  onChange={(e) => setComfyuiEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:8188" className="flex-1"
                />
                <Button size="sm" onClick={connectComfyui}>Connect</Button>
                {detectedExternals.find((d) => d.type === "comfyui") && (
                  <Button size="sm" variant="outline" onClick={disconnectComfyui}>Clear</Button>
                )}
              </div>
              <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate">
                    <span className="text-muted-foreground">$</span> python main.py --listen 127.0.0.1 --port 8188
                  </span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                    onClick={() => copyToClipboard("python main.py --listen 127.0.0.1 --port 8188")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Bind 127.0.0.1, not 0.0.0.0 — ComfyUI has no authentication.
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => window.open(comfyuiEndpoint, "_blank")}>
                <ExternalLink className="h-3 w-3" /> Open Image-Gen UI
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
