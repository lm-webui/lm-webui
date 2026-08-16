/**
 * ImageGenTab — ComfyUI image-generation engine management.
 * Controlled component: state + handlers live in RuntimeManager and are passed in.
 * The checkpoint download Dialog lives in RuntimeManager (shared state), not here.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Image, CheckCircle, XCircle, ExternalLink, Download, Trash2, ChevronDown, Copy } from "lucide-react";

interface DetectedExternal {
  type: string;
  installed: boolean;
  status: string;
  port?: number;
  endpoint?: string;
}

interface ImageGenTabProps {
  comfyuiConnected: boolean;
  comfyuiEndpoint: string;
  setComfyuiEndpoint: (v: string) => void;
  detectedExternals: DetectedExternal[];
  connectComfyui: () => void;
  disconnectComfyui: () => void;
  openComfyDownload: () => void;
  copyToClipboard: (text: string) => void;
}

export function ImageGenTab({
  comfyuiConnected, comfyuiEndpoint, setComfyuiEndpoint, detectedExternals,
  connectComfyui, disconnectComfyui, openComfyDownload, copyToClipboard,
}: ImageGenTabProps) {
  return (
    <Card className={comfyuiConnected ? "border-green-200 dark:border-green-800" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-pink-500" />
            <CardTitle className="text-base">Image-Gen</CardTitle>
            {comfyuiConnected || detectedExternals.find(d => d.type === "comfyui") ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="h-3 w-3 mr-1" /> Running
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" /> Not Detected
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          AI image generation with ComfyUI workflows. Install on host, then connect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {comfyuiConnected || detectedExternals.find(d => d.type === "comfyui") ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              ComfyUI running at {comfyuiEndpoint}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => window.open(comfyuiEndpoint, "_blank")}>
                <ExternalLink className="h-3 w-3" /> Open Image-Gen
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={openComfyDownload}>
                <Download className="h-3 w-3" /> Download model
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={disconnectComfyui}>
                <Trash2 className="h-3 w-3" /> Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Label htmlFor="comfyui-endpoint" className="sr-only">ComfyUI endpoint</Label>
              <Input id="comfyui-endpoint" name="endpoint" type="url" value={comfyuiEndpoint} onChange={(e) => setComfyuiEndpoint(e.target.value)}
                placeholder="http://host.docker.internal:8188" className="flex-1" />
              <Button size="sm" onClick={connectComfyui}>Connect</Button>
            </div>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3 w-3" />
                Setup Instructions
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1 mt-2">
                  <div className="flex items-center justify-between">
                    <span><span className="text-muted-foreground">$</span> git clone https://github.com/comfyanonymous/ComfyUI</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                      onClick={() => copyToClipboard("git clone https://github.com/comfyanonymous/ComfyUI")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span><span className="text-muted-foreground">$</span> cd ComfyUI && pip install -r requirements.txt</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                      onClick={() => copyToClipboard("cd ComfyUI && pip install -r requirements.txt")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span><span className="text-muted-foreground">$</span> python main.py --port 8188 --listen 0.0.0.0</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                      onClick={() => copyToClipboard("python main.py --port 8188 --listen 0.0.0.0")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
