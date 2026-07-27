import React, { useState, useEffect } from "react";
import { fetchModelsByProvider, addApiKey, deleteApiKey, listApiKeys } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Zap, Database, Brain, Code, Cpu, Wifi, WifiOff, RefreshCw, Sparkles, Gem, Key, Save, Trash2 } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLLM?: string;
  onLLMChange?: (value: string) => void;
  availableModels?: string[];
  selectedModel?: string;
  onModelChange?: (value: string) => void;
}

// Export the content as a reusable component
export function ModelsApiKeysContent({
  selectedLLM = "openai",
  onLLMChange = () => {},
  availableModels = [],
  selectedModel = "",
  onModelChange = () => {},
}: Omit<ApiKeyModalProps, 'isOpen' | 'onClose'>) {
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected" | "testing"
  >("disconnected");
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);

  // Fetch API keys from database when component loads
  useEffect(() => {
    const fetchApiKeys = async () => {
      setIsLoadingApiKeys(true);
      try {
        const apiKeys = await listApiKeys();
        const keysMap: Record<string, boolean> = {};
        apiKeys.forEach((key: any) => {
          keysMap[key.provider] = true;
        });
        setStoredApiKeys(keysMap);
      } catch (error: any) {
        console.error("Failed to load API keys:", error);
        toast.error("Failed to load saved API keys. Please try refreshing the page.");
      } finally {
        setIsLoadingApiKeys(false);
      }
    };

    fetchApiKeys();
  }, []);

  // Function to save API key to database
  const handleSaveApiKey = async (provider: string, apiKey: string) => {
    if (!apiKey.trim()) {
      toast.error(`Please enter a valid API key for ${provider}`);
      return;
    }

    setIsLoading(true);
    try {
      await addApiKey(provider, apiKey);
      setStoredApiKeys(prev => ({ ...prev, [provider]: true }));
      toast.success(`${provider} API key saved successfully!`);
      setApiKey("");
    } catch (error: any) {
      console.error(`Failed to save ${provider} API key:`, error);
      if (error.status === 403 || error.message?.includes("not authenticated")) {
        toast.error("Please login to save API keys securely");
      } else {
        toast.error(`Failed to save ${provider} API key`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Function to delete API key from database
  const handleDeleteApiKey = async (provider: string) => {
    try {
      await deleteApiKey(provider);
      setStoredApiKeys(prev => {
        const newKeys = { ...prev };
        delete newKeys[provider];
        return newKeys;
      });
      toast.success(`${provider} API key deleted successfully!`);
    } catch (error: any) {
      console.error(`Failed to delete ${provider} API key:`, error);
      if (error.status === 403 || error.message?.includes("not authenticated")) {
        toast.error("Please login to manage API keys");
      } else {
        toast.error(`Failed to delete ${provider} API key`);
      }
    }
  };

  const testConnection = async () => {
    setIsConnecting(true);
    setConnectionStatus("testing");

    // Check if API key is available for providers that need it
    const needsApiKey = ["openai", "grok", "claude", "deepseek", "google"].includes(selectedLLM);

    // Get the current API key for validation
    let currentApiKey = "";
    if (selectedLLM === "openai") {
      currentApiKey = apiKey || "";
    } else if (selectedLLM === "grok") {
      currentApiKey = apiKey || "";
    } else if (selectedLLM === "claude") {
      currentApiKey = apiKey || "";
    } else if (selectedLLM === "deepseek") {
      currentApiKey = apiKey || "";
    } else if (selectedLLM === "google") {
      currentApiKey = apiKey || "";
    }

    const hasApiKey = !needsApiKey || currentApiKey;

    if (needsApiKey && !hasApiKey) {
      setConnectionStatus("disconnected");
      setIsConnecting(false);
      toast.error(`API key required for ${selectedLLM.toUpperCase()}`);
      return;
    }


    try {
      // Test backend connection by fetching models for current provider
      await fetchModelsByProvider(selectedLLM);
      setConnectionStatus("connected");
      toast.success(`Successfully connected to ${selectedLLM.toUpperCase()}!`);
    } catch (error: any) {
      setConnectionStatus("disconnected");

      // Check if error is due to invalid API key
      if (error.message?.includes("Invalid") || error.message?.includes("API key") || error.message?.includes("authentication")) {
        toast.error(`Invalid API key for ${selectedLLM.toUpperCase()}`);
      } else {
        toast.error(`Failed to connect to ${selectedLLM.toUpperCase()}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Function to validate API key pattern
  const validateApiKey = (key: string, provider: string): boolean => {
    if (!key) return false;

    switch (provider) {
      case "openai":
        return key.startsWith("sk-") || key.startsWith("sk-proj");
      case "grok":
        return key.startsWith("xai-");
      case "claude":
        return key.startsWith("sk-ant-");
      case "deepseek":
        return key.startsWith("sk-");
      case "google":
        return key.startsWith("AIza");
      default:
        return true; // For providers that don't need API keys
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI Provider</CardTitle>
              <CardDescription>Choose your AI model provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="llm-source">Provider</Label>
                <Select value={selectedLLM} onValueChange={onLLMChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      OpenAI
                    </div>
                  </SelectItem>
                  <SelectItem value="google">
                    <div className="flex items-center gap-2">
                      <Gem className="h-4 w-4" />
                      Gemini (Google)
                    </div>
                  </SelectItem>
                  <SelectItem value="grok">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Grok (xAI)
                    </div>
                  </SelectItem>
                  <SelectItem value="claude">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Claude (Anthropic)
                    </div>
                  </SelectItem>
                  <SelectItem value="deepseek">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      DeepSeek
                    </div>
                  </SelectItem>
                  <SelectItem value="ollama">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Ollama (Local)
                    </div>
                  </SelectItem>
                  <SelectItem value="lmstudio">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      LM Studio (Local)
                    </div>
                  </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Model Selection */}
              {["openai", "ollama", "lmstudio", "grok", "claude", "deepseek", "google"].includes(selectedLLM) && (
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Select
                    value={selectedModel}
                    onValueChange={onModelChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model, index) => (
                        <SelectItem key={`${model}-${index}`} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* API Key Input for providers that need it */}
              {["openai", "grok", "claude", "deepseek", "google"].includes(selectedLLM) && (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">
                    {selectedLLM === "openai" && "OpenAI API Key"}
                    {selectedLLM === "grok" && "xAI API Key"}
                    {selectedLLM === "claude" && "Anthropic API Key"}
                    {selectedLLM === "deepseek" && "DeepSeek API Key"}
                    {selectedLLM === "google" && "Google API Key"}
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={
                      selectedLLM === "openai" ? "sk-..." :
                      selectedLLM === "grok" ? "xai-..." :
                      selectedLLM === "claude" ? "sk-ant-..." :
                      selectedLLM === "deepseek" ? "sk-..." :
                      selectedLLM === "google" ? "AIza..." : ""
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/50 rounded-2xl"
                    disabled={isLoading}
                  />
                  <div className="text-sm text-muted-foreground">
                    Your API key is stored securely and encrypted.
                  </div>
                </div>
              )}

              {/* Connection Test */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testConnection}
                  disabled={isConnecting}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : connectionStatus === "connected" ? (
                    <Wifi className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                  Test Connection
                </Button>
                <Badge
                  variant={
                    connectionStatus === "connected" ? "default" : "secondary"
                  }
                >
                  {connectionStatus}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* API Key Management Section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Key Management
              </CardTitle>
              <CardDescription>
                Your API keys are securely encrypted and stored in the database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingApiKeys ? (
                <div className="text-center py-4 text-muted-foreground">
                  <div className="text-sm">Loading API keys...</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* OpenAI */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">OpenAI</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={storedApiKeys["openai"] ? "default" : "secondary"} className="text-xs">
                        {storedApiKeys["openai"] ? "Configured" : "Not set"}
                      </Badge>
                      {storedApiKeys["openai"] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey("openai")}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveApiKey("openai", apiKey)}
                          disabled={!apiKey.trim() || selectedLLM !== "openai"}
                          className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Anthropic */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anthropic (Claude)</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={storedApiKeys["anthropic"] ? "default" : "secondary"} className="text-xs">
                        {storedApiKeys["anthropic"] ? "Configured" : "Not set"}
                      </Badge>
                      {storedApiKeys["anthropic"] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey("anthropic")}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveApiKey("anthropic", apiKey)}
                          disabled={!apiKey.trim() || selectedLLM !== "claude"}
                          className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* xAI */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">xAI (Grok)</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={storedApiKeys["xai"] ? "default" : "secondary"} className="text-xs">
                        {storedApiKeys["xai"] ? "Configured" : "Not set"}
                      </Badge>
                      {storedApiKeys["xai"] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey("xai")}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveApiKey("xai", apiKey)}
                          disabled={!apiKey.trim() || selectedLLM !== "grok"}
                          className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* DeepSeek */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">DeepSeek</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={storedApiKeys["deepseek"] ? "default" : "secondary"} className="text-xs">
                        {storedApiKeys["deepseek"] ? "Configured" : "Not set"}
                      </Badge>
                      {storedApiKeys["deepseek"] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey("deepseek")}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveApiKey("deepseek", apiKey)}
                          disabled={!apiKey.trim() || selectedLLM !== "deepseek"}
                          className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Google */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Google (Gemini)</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={storedApiKeys["google"] ? "default" : "secondary"} className="text-xs">
                        {storedApiKeys["google"] ? "Configured" : "Not set"}
                      </Badge>
                      {storedApiKeys["google"] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey("google")}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveApiKey("google", apiKey)}
                          disabled={!apiKey.trim() || selectedLLM !== "google"}
                          className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

// Original modal component that uses the reusable content
export default function ApiKeyModal({ 
  isOpen, 
  onClose,
  selectedLLM = "openai",
  onLLMChange = () => {},
  availableModels = [],
  selectedModel = "",
  onModelChange = () => {}
}: ApiKeyModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#171717]/5 border border-white/10 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-center">
            AI Models & API Keys
          </DialogTitle>
        </DialogHeader>
        
        <ModelsApiKeysContent
          selectedLLM={selectedLLM}
          onLLMChange={onLLMChange}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />

        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
