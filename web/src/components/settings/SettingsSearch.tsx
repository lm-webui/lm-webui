import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Wifi, WifiOff, RefreshCw, Save, Trash2 } from "lucide-react";
import { addApiKey, deleteApiKey, listApiKeys, testApiKey } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SettingsSearchProps {
  selectedSearchEngine: string;
  onSearchEngineChange: (value: string) => void;
}

export function SettingsSearch(_props: SettingsSearchProps) {
  const searchEngines = [
    { id: "duckduckgo", name: "DuckDuckGo", icon: Globe, needsKey: false },
    { id: "searxng", name: "SearXNG", icon: Globe, needsKey: false },
    { id: "google_search", name: "Google Search", icon: Globe, needsKey: true },
    { id: "google_cx", name: "Google CX", icon: Globe, needsKey: true },
    { id: "bing_search", name: "Bing Search", icon: Globe, needsKey: true },
    { id: "perplexity", name: "Perplexity", icon: Globe, needsKey: true },
    { id: "tavily", name: "Tavily", icon: Globe, needsKey: true },
  ];

  const [selectedProvider, setSelectedProvider] = useState("duckduckgo");
  const [apiKey, setApiKey] = useState("");
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});
  const [, setConnectionStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);

  useEffect(() => {
    const fetchStoredKeys = async () => {
      setIsLoadingApiKeys(true);
      try {
        const keys = await listApiKeys();
        const keysMap: Record<string, boolean> = {};
        keys.forEach((key: any) => { keysMap[key.provider] = true; });
        setStoredApiKeys(keysMap);
        setConnectionStatus(keysMap[selectedProvider] ? "connected" : "disconnected");
      } catch (error) {
        console.error("Failed to load API keys:", error);
      } finally {
        setIsLoadingApiKeys(false);
      }
    };
    fetchStoredKeys();
  }, [selectedProvider]);

  const currentEngine = searchEngines.find(e => e.id === selectedProvider);
  const isConfigured = storedApiKeys[selectedProvider];

  const handleSave = async () => {
    if (!apiKey.trim()) { toast.error("API key is required"); return; }
    try {
      await addApiKey(selectedProvider, apiKey);
      setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      setApiKey("");
      setConnectionStatus("connected");
      toast.success(`${currentEngine?.name} key saved`);
    } catch (error: any) {
      toast.error(`Failed to save ${currentEngine?.name} key`);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteApiKey(selectedProvider);
      setStoredApiKeys(prev => { const n = { ...prev }; delete n[selectedProvider]; return n; });
      setConnectionStatus("disconnected");
      toast.success(`${currentEngine?.name} key deleted`);
    } catch (error) {
      toast.error(`Failed to delete ${currentEngine?.name} key`);
    }
  };

  const handleTest = async () => {
    if (!isConfigured && !apiKey.trim()) {
      toast.error(`Enter a key for ${currentEngine?.name} to test`);
      return;
    }
    setIsTesting(true);
    setConnectionStatus("testing");
    try {
      if (!isConfigured && apiKey) {
        await addApiKey(selectedProvider, apiKey);
        setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      }
      const result = await testApiKey(selectedProvider);
      if (result.valid) {
        setConnectionStatus("connected");
        toast.success(`${currentEngine?.name} key is valid`);
      } else {
        setConnectionStatus("disconnected");
        toast.error(result.message || "Connection failed");
        if (!isConfigured && apiKey) {
          await deleteApiKey(selectedProvider).catch(() => {});
          setStoredApiKeys(prev => { const n = { ...prev }; delete n[selectedProvider]; return n; });
        }
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      toast.error(`Failed to connect to ${currentEngine?.name}`);
      if (!isConfigured && apiKey) {
        await deleteApiKey(selectedProvider).catch(() => {});
        setStoredApiKeys(prev => { const n = { ...prev }; delete n[selectedProvider]; return n; });
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Search Provider
        </CardTitle>
        <CardDescription>
          Configure API keys for search providers. DuckDuckGo works without configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingApiKeys ? (
          <div className="text-center py-8 text-zinc-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Search Engine</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {searchEngines.map((engine) => (
                    <SelectItem key={engine.id} value={engine.id}>
                      <div className="flex items-center gap-2">
                        <engine.icon className="h-4 w-4" />
                        <span>{engine.name}</span>
                        {(storedApiKeys[engine.id] || !engine.needsKey) && <Wifi className="h-3 w-3 text-green-500" />}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentEngine && <currentEngine.icon className="h-5 w-5" />}
                  <div>
                    <div className="font-medium text-sm">{currentEngine?.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {isTesting ? (
                        <Badge variant="secondary" className="text-xs">
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Testing...
                        </Badge>
                      ) : !currentEngine?.needsKey ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                          <Wifi className="h-3 w-3 mr-1" /> Always connected
                        </Badge>
                      ) : (
                        <Badge variant={isConfigured ? "default" : "secondary"} className="text-xs">
                          {isConfigured ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                          {isConfigured ? "Connected" : "Not configured"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {currentEngine && currentEngine.needsKey && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting} className="text-xs">
                      Test
                    </Button>
                    {isConfigured ? (
                      <Button variant="ghost" size="sm" onClick={handleDelete}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={handleSave} disabled={!apiKey?.trim()}
                        className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950">
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {currentEngine && !currentEngine.needsKey ? (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  DuckDuckGo works out of the box — no API key required.
                </div>
              ) : !isConfigured ? (
                <div className="space-y-2">
                  <Label className="text-sm">API Key</Label>
                  <Input type="password" placeholder="Enter API key" value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)} className="text-sm" />
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Your API key is stored securely and encrypted.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  API key is configured and stored securely.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
