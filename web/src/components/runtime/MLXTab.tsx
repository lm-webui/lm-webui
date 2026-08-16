/**
 * MLXTab — Apple Silicon MLX engine management.
 * Controlled component: state + handlers live in RuntimeManager and are passed in.
 */
import { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Cpu, CloudDownload, Loader2, CheckCircle, Search, FolderOpen,
  ChevronDown, Copy, Download, Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface MLXStatus {
  runtime: string;
  available: boolean;
  hardware_detected: boolean;
  mlx_installed: boolean;
  models_available: number;
  models?: string[];
  models_dir?: string;
  reason?: string;
}

interface StatusIconProps { ready: boolean; tip: string; }

interface MLXTabProps {
  mlxStatus: MLXStatus | null;
  loadingMlx: boolean;
  mlxQuery: string;
  setMlxQuery: (v: string) => void;
  mlxRows: string[];
  installingMlx: boolean;
  installMlx: () => void;
  deleteMlxModel: (name: string) => void;
  setDownloadModal: (v: "gguf" | "vision" | "mlx" | null) => void;
  copyToClipboard: (text: string) => void;
  StatusIcon: ComponentType<StatusIconProps>;
  onModelLoad?: ((model: string, provider?: string) => void) | undefined;
  onOpenChange: (open: boolean) => void;
}

export function MLXTab({
  mlxStatus, loadingMlx, mlxQuery, setMlxQuery, mlxRows, installingMlx,
  installMlx, deleteMlxModel, setDownloadModal, copyToClipboard,
  StatusIcon, onModelLoad, onOpenChange,
}: MLXTabProps) {
  return (
    <>
      {mlxStatus?.available === false ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Cpu className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">MLX is only available on Apple Silicon (M-series) devices</p>
          <p className="text-xs text-muted-foreground mt-1">This device doesn't support MLX models. Use GGUF or Image-Gen instead.</p>
        </div>
      ) : (
        <Card className={mlxStatus?.mlx_installed ? "border-green-200 dark:border-green-800" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                MLX <span className="font-normal text-muted-foreground">Apple Silicon</span>
              </CardTitle>
              {mlxStatus?.mlx_installed ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle className="h-3 w-3 mr-1" /> Ready
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-600">
                  <Cpu className="h-3 w-3 mr-1" /> Not Installed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingMlx ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* Capabilities */}
                <div className="rounded-xl border p-3">
                  <Label className="text-xs font-medium mb-2 block">Capabilities</Label>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-muted-foreground" /> Chat</span>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-6 gap-1" onClick={() => setDownloadModal("mlx")}>
                          <CloudDownload className="h-3 w-3" /> Download model
                        </Button>
                        <StatusIcon ready={(mlxStatus?.models_available || 0) > 0} tip={(mlxStatus?.models_available || 0) > 0 ? "Ready to use, select a model" : "Download a model to activate. If this persists, refresh or reinstall."} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Not installed callout */}
                {!mlxStatus?.mlx_installed && (
                  <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/40 p-3 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      MLX needs to be installed via pip, then download a model from HuggingFace.
                    </p>
                    <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span><span className="text-muted-foreground">$</span> pip install mlx mlx-lm mlx-optiq</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard("pip install mlx mlx-lm mlx-optiq")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span><span className="text-muted-foreground">$</span> mlx_lm.fetch --hf-path mlx-community/Llama-3.2-3B-Instruct-4bit</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard("mlx_lm.fetch --hf-path mlx-community/Llama-3.2-3B-Instruct-4bit")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Button size="sm" onClick={installMlx} disabled={installingMlx} className="w-full gap-1">
                      {installingMlx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      {installingMlx ? "Installing..." : "Install MLX"}
                    </Button>
                  </div>
                )}

                {/* Runtime Details */}
                <Collapsible className="mt-4">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                    <ChevronDown className="h-4 w-4" />
                    Runtime Details
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Hardware</span>
                      <span>{mlxStatus?.hardware_detected ? "Apple Silicon (M-series)" : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>mlx installed</span>
                      <span className={mlxStatus?.mlx_installed ? "text-green-600" : "text-amber-600"}>
                        {mlxStatus?.mlx_installed ? "yes" : "no"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Models</span>
                      <span>{mlxStatus?.models_available ?? 0}</span>
                    </div>
                    {mlxStatus?.models_dir && (
                      <div className="flex items-center justify-between">
                        <span>Models dir</span>
                        <span className="font-mono truncate max-w-[60%]">{mlxStatus.models_dir}</span>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Models */}
                {mlxStatus?.mlx_installed && (
                  <div className="mt-4">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input aria-label="Search MLX models" placeholder="Search MLX models…" value={mlxQuery}
                        onChange={(e) => setMlxQuery(e.target.value)} className="pl-9" />
                    </div>
                    {mlxRows.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No MLX models loaded</p>
                        <p className="text-xs mt-1">Download a model from HuggingFace.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                        {mlxRows.map((m: string) => (
                          <div key={m} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <Cpu className="h-4 w-4 text-purple-500 flex-shrink-0" />
                              <span className="font-medium text-sm truncate">{m}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteMlxModel(m)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                              <Button size="sm" onClick={() => { onModelLoad?.(m, "mlx"); onOpenChange(false); toast.success("Switched to " + m); }}>
                                Load
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
