import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Wifi, WifiOff, RefreshCw, Save, Trash2 } from "lucide-react";
import { addApiKey, deleteApiKey, listApiKeys, testApiKey, testSearxngUrl, fetchSettings, updateSettings } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SettingsSearch({ engine, setEngine }: {
  // Controlled by the parent dialog: the Inference tab's "Default Web Search" select edits the same
  // setting, and the dialog's Save writes it back. Two local copies meant whichever the user did
  // not touch last would overwrite the other on save.
  engine: string;
  setEngine: (id: string) => void;
}) {
  const searchEngines = [
    { id: "duckduckgo", name: "DuckDuckGo", icon: Globe, needsKey: false },
    { id: "searxng", name: "SearXNG", icon: Globe, needsKey: false },
    { id: "google_search", name: "Google Search", icon: Globe, needsKey: true },
    { id: "perplexity", name: "Perplexity", icon: Globe, needsKey: true },
  ];

  const selectedProvider = engine;
  const [apiKey, setApiKey] = useState("");
  const [cx, setCx] = useState("");
  const [searxngUrl, setSearxngUrl] = useState("");
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});
  // The SearXNG probe result, and only that — a well-formed URL is not evidence that anything is
  // listening on it, so the badge must show this rather than the URL's shape. Do not write it from
  // the API-key paths: they run on mount and on every engine switch, and would overwrite a real
  // verdict with an "is a key stored" answer that means nothing for SearXNG.
  const [searxngStatus, setSearxngStatus] = useState<"connected" | "disconnected" | null>(null);
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

  const isSearxngConfigured = (() => {
    const u = searxngUrl.trim();
    if (!u) return false;
    try { return /^https?:\/\//.test(new URL(u).href); } catch { return false; }
  })();

  const isGoogle = selectedProvider === "google_search";

  const handleSave = async () => {
    if (!apiKey.trim()) { toast.error("API key is required"); return; }
    if (isGoogle && !cx.trim()) { toast.error("Google Search also requires the Search Engine ID (cx)"); return; }
    try {
      await addApiKey(selectedProvider, apiKey, isGoogle ? cx.trim() : undefined);
      setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      setApiKey("");
      setCx("");
      toast.success(`${currentEngine?.name} key saved`);
    } catch {
      toast.error(`Failed to save ${currentEngine?.name} key`);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteApiKey(selectedProvider);
      setStoredApiKeys(prev => { const n = { ...prev }; delete n[selectedProvider]; return n; });
      toast.success(`${currentEngine?.name} key deleted`);
    } catch {
      toast.error(`Failed to delete ${currentEngine?.name} key`);
    }
  };

  // Load the SearXNG URL for the current user. The engine itself comes from the parent dialog.
  useEffect(() => {
    fetchSettings().then((s: any) => {
      setSearxngUrl(s.searxngUrl || "");
    }).catch(() => {});
  }, []);

  const handleEngineChange = (id: string) => {
    setEngine(id);           // keeps the Inference tab's select and the dialog's Save in step
    setSearxngStatus(null);  // a verdict from the previous engine's probe doesn't carry over
    updateSettings({ selectedSearchEngine: id }).catch(() => {});
  };

  const handleSaveSearxngUrl = async () => {
    try {
      await updateSettings({ searxngUrl: searxngUrl.trim() });
      setSearxngStatus(null);  // the saved URL has not been probed
      toast.success("SearXNG URL saved");
    } catch {
      toast.error("Failed to save SearXNG URL");
    }
  };

  const handleTestSearxng = async () => {
    if (!isSearxngConfigured) {
      toast.error("Enter a valid SearXNG URL first");
      return;
    }
    setIsTesting(true);
    try {
      const result = await testSearxngUrl(searxngUrl.trim());
      setSearxngStatus(result.valid ? "connected" : "disconnected");
      if (result.valid) toast.success(result.message || "SearXNG reachable");
      else toast.error(result.message || "SearXNG not reachable");
    } catch {
      setSearxngStatus("disconnected");
      toast.error("Failed to reach SearXNG");
    } finally {
      setIsTesting(false);
    }
  };

  const handleTest = async () => {
    if (!isConfigured && !apiKey.trim()) {
      toast.error(`Enter a key for ${currentEngine?.name} to test`);
      return;
    }
    if (isGoogle && !cx.trim()) {
      toast.error("Google Search also requires the Search Engine ID (cx)");
      return;
    }
    setIsTesting(true);
    try {
      if (!isConfigured && apiKey) {
        await addApiKey(selectedProvider, apiKey, isGoogle ? cx.trim() : undefined);
        setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      }
      const result = await testApiKey(selectedProvider);
      if (result.valid) {
        toast.success(`${currentEngine?.name} key is valid`);
      } else {
        toast.error(result.message || "Connection failed");
        if (!isConfigured && apiKey) {
          await deleteApiKey(selectedProvider).catch(() => {});
          setStoredApiKeys(prev => { const n = { ...prev }; delete n[selectedProvider]; return n; });
        }
      }
    } catch {
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
          Configure API keys for search providers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingApiKeys ? (
          <div className="text-center py-8 text-zinc-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Search Engine</Label>
              <Select value={selectedProvider} onValueChange={handleEngineChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {searchEngines.map((engine) => (
                    <SelectItem key={engine.id} value={engine.id}>
                      <div className="flex items-center gap-2">
                        <engine.icon className="h-4 w-4" />
                        <span>{engine.name}</span>
                        {(engine.id === "searxng"
                          ? isSearxngConfigured
                          : storedApiKeys[engine.id] || !engine.needsKey) && <Wifi className="h-3 w-3 text-green-500" />}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 p-4 rounded-3xl bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800 border-neutral-200 dark:border-neutral-700">
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
                      ) : currentEngine?.id === "searxng" ? (
                        !isSearxngConfigured ? (
                          <Badge variant="secondary" className="text-xs">
                            <WifiOff className="h-3 w-3 mr-1" /> Not configured
                          </Badge>
                        ) : searxngStatus === "connected" ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                            <Wifi className="h-3 w-3 mr-1" /> Connected
                          </Badge>
                        ) : searxngStatus === "disconnected" ? (
                          <Badge variant="destructive" className="text-xs">
                            <WifiOff className="h-3 w-3 mr-1" /> Not reachable
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Wifi className="h-3 w-3 mr-1" /> Configured
                          </Badge>
                        )
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

                {currentEngine && (currentEngine.needsKey || currentEngine.id === "searxng") && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm"
                      onClick={currentEngine.id === "searxng" ? handleTestSearxng : handleTest}
                      disabled={isTesting} className="text-xs">
                      Test
                    </Button>
                    {currentEngine.id === "searxng" ? null : isConfigured ? (
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

              {currentEngine?.id === "searxng" ? (
                <div className="space-y-2">
                  <Label className="text-sm">SearXNG URL</Label>
                  <div className="flex gap-2">
                    <Input type="text" placeholder="http://127.0.0.1:8080" value={searxngUrl}
                      onChange={(e) => { setSearxngUrl(e.target.value); setSearxngStatus(null); }}
                      className="text-sm" />
                    <Button variant="outline" size="sm" onClick={handleSaveSearxngUrl} className="text-xs shrink-0">Save</Button>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Base URL of your SearXNG instance (must have the JSON API enabled).
                  </div>
                </div>
              ) : currentEngine && !currentEngine.needsKey ? (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  DuckDuckGo works out of the box, no API key required.
                </div>
              ) : !isConfigured ? (
                <div className="space-y-2">
                  <Label className="text-sm">API Key</Label>
                  <Input type="password" placeholder="Enter API key" value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)} className="text-sm" />
                  {isGoogle && (
                    <div className="space-y-2">
                      <Label className="text-sm">Search Engine ID (cx)</Label>
                      <Input type="text" placeholder="Programmable Search Engine ID" value={cx}
                        onChange={(e) => setCx(e.target.value)} className="text-sm" />
                    </div>
                  )}
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
