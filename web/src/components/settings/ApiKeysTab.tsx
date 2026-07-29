import React, { useState, useEffect } from "react";
import { fetchModelsByProvider, addApiKey, deleteApiKey, listApiKeys, testApiKey } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Database, Wifi, WifiOff, RefreshCw, Gem, Key, Save, Trash2, Bot, Globe, Monitor } from "lucide-react";

export function ApiKeysTab() {
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [isTesting, setIsTesting] = useState(false);
  const [storedApiKeys, setStoredApiKeys] = useState<Record<string, boolean>>({});
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);

  // Provider configuration - using backend provider names for consistency
  const providers = [
    { id: "openai", name: "OpenAI", icon: Zap, type: "cloud", placeholder: "sk-..." },
    { id: "google", name: "Google (Gemini)", icon: Gem, type: "cloud", placeholder: "AIza..." },
    { id: "anthropic", name: "Anthropic (Claude)", icon: Bot, type: "cloud", placeholder: "sk-ant-..." },
    { id: "xai", name: "Grok (xAI)", icon: Bot, type: "cloud", placeholder: "xai-..." },
    { id: "deepseek", name: "DeepSeek", icon: Bot, type: "cloud", placeholder: "sk-..." },
    { id: "vllm", name: "vLLM", icon: Zap, type: "local", placeholder: "http://localhost:7070" },
    { id: "lmstudio", name: "LM Studio", icon: Monitor, type: "local", placeholder: "http://localhost:1234" },
    { id: "ollama", name: "Ollama", icon: Database, type: "local", placeholder: "http://localhost:11434" },
  ];

  // Load last used URL from localStorage for local providers
  const loadLastUsedUrl = (providerId: string) => {
    if (providers.find(p => p.id === providerId)?.type === "local") {
      const lastUrl = localStorage.getItem(`last_url_${providerId}`);
      if (lastUrl) {
        setApiKey(lastUrl);
      }
    }
  };

  // Save last used URL to localStorage for local providers
  const saveLastUsedUrl = (providerId: string, url: string) => {
    if (providers.find(p => p.id === providerId)?.type === "local") {
      localStorage.setItem(`last_url_${providerId}`, url);
    }
  };

  // Fetch stored API keys on component mount
  useEffect(() => {
    const fetchStoredKeys = async () => {
      setIsLoadingApiKeys(true);
      try {
        const keys = await listApiKeys();
        const keysMap: Record<string, boolean> = {};
        keys.forEach((key: any) => {
          keysMap[key.provider] = true;
        });
        setStoredApiKeys(keysMap);

        // Set initial connection status based on stored keys
        const initialStatus = keysMap[selectedProvider] ? "connected" : "disconnected";
        setConnectionStatus(initialStatus as "connected" | "disconnected");
      } catch (error: any) {
        console.error("Failed to load API keys:", error);
        toast.error("Failed to load saved API keys");
      } finally {
        setIsLoadingApiKeys(false);
      }
    };

    fetchStoredKeys();
  }, [selectedProvider]);

  // Update connection status when provider changes
  useEffect(() => {
    const isConfigured = storedApiKeys[selectedProvider];
    setConnectionStatus(isConfigured ? "connected" : "disconnected");
    // Load last used URL for local providers
    loadLastUsedUrl(selectedProvider);
  }, [selectedProvider, storedApiKeys]);

  // Validate API key or URL before saving
  const validateInput = (providerId: string, input: string): { isValid: boolean; error?: string } => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return { isValid: false, error: "Unknown provider" };
    
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      return { isValid: false, error: `${provider.type === "local" ? "Server URL" : "API key"} is required` };
    }
    
    // Local provider URL validation
    if (provider.type === "local") {
      // Basic URL validation
      try {
        const url = new URL(trimmedInput.startsWith("http") ? trimmedInput : `http://${trimmedInput}`);
        if (!["http:", "https:"].includes(url.protocol)) {
          return { isValid: false, error: "URL must use http:// or https:// protocol" };
        }
        // Check for localhost or private IP (basic security)
        const hostname = url.hostname;
        if (!hostname.match(/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/) && 
            !hostname.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
          return { isValid: false, error: "Please enter a valid server URL" };
        }
        return { isValid: true };
      } catch (e) {
        return { isValid: false, error: "Please enter a valid URL (e.g., http://localhost:1234)" };
      }
    }
    
    // Cloud provider API key validation
    if (providerId === "openai" && !trimmedInput.startsWith("sk-")) {
      return { isValid: false, error: "OpenAI API keys should start with 'sk-'" };
    }
    if (providerId === "google" && !trimmedInput.startsWith("AIza")) {
      return { isValid: false, error: "Google API keys should start with 'AIza'" };
    }

    return { isValid: true };
  };

  // Save API key to backend
  const handleSaveApiKey = async () => {
    const validation = validateInput(selectedProvider, apiKey);
    if (!validation.isValid) {
      toast.error(validation.error || `Please enter a valid ${currentProvider?.type === "local" ? "server URL" : "API key"} for ${currentProvider?.name}`);
      return;
    }

    try {
      await addApiKey(selectedProvider, apiKey);
      setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      
      // Save last used URL for local providers
      if (currentProvider?.type === "local") {
        saveLastUsedUrl(selectedProvider, apiKey);
      }
      
      setApiKey(""); // Clear input
      setConnectionStatus("connected");
      toast.success(`${currentProvider?.name} ${currentProvider?.type === "local" ? "server URL" : "API key"} saved successfully!`);
    } catch (error: any) {
      console.error(`Failed to save ${selectedProvider} API key:`, error);
      if (error.status === 403) {
        toast.error("Please login to save API keys securely");
      } else {
        toast.error(`Failed to save ${currentProvider?.name} ${currentProvider?.type === "local" ? "server URL" : "API key"}`);
      }
    }
  };

  // Delete API key from backend
  const handleDeleteApiKey = async () => {
    try {
      await deleteApiKey(selectedProvider);
      setStoredApiKeys(prev => {
        const newKeys = { ...prev };
        delete newKeys[selectedProvider];
        return newKeys;
      });
      setConnectionStatus("disconnected");
      setApiKey("");
      toast.success(`${providers.find(p => p.id === selectedProvider)?.name} API key deleted successfully!`);
    } catch (error: any) {
      console.error(`Failed to delete ${selectedProvider} API key:`, error);
      if (error.status === 403) {
        toast.error("Please login to manage API keys");
      } else {
        toast.error(`Failed to delete ${providers.find(p => p.id === selectedProvider)?.name} API key`);
      }
    }
  };

  // Test connection for selected provider
  const testConnection = async () => {
    // If not configured and no API key entered, show error
    if (!isConfigured && !apiKey?.trim()) {
      toast.error(`Please enter a ${currentProvider?.type === "local" ? "server URL" : "API key"} for ${currentProvider?.name} to test`);
      return;
    }

    // Validate input first if we have one
    if (!isConfigured && apiKey) {
      const validation = validateInput(selectedProvider, apiKey);
      if (!validation.isValid) {
        toast.error(validation.error || `Please enter a valid ${currentProvider?.type === "local" ? "server URL" : "API key"} for ${currentProvider?.name}`);
        return;
      }
    }

    setIsTesting(true);
    setConnectionStatus("testing");

    try {
      // If not configured but we have an API key, save it temporarily for testing
      if (!isConfigured && apiKey) {
        // Save the API key/URL first
        await addApiKey(selectedProvider, apiKey);
        // Save last used URL for local providers
        if (currentProvider?.type === "local") {
          saveLastUsedUrl(selectedProvider, apiKey);
        }
        // Update state to reflect it's now configured
        setStoredApiKeys(prev => ({ ...prev, [selectedProvider]: true }));
      }

      // Use the new test endpoint
      const testResult = await testApiKey(selectedProvider);
      
      if (testResult.valid) {
        setConnectionStatus("connected");
        toast.success(`Successfully connected to ${currentProvider?.name}! ${testResult.message}`);
      } else {
        setConnectionStatus("disconnected");
        toast.error(`Connection failed: ${testResult.message}`);
        
        // If we just saved it for testing and it failed, delete it
        if (!isConfigured && apiKey) {
          try {
            await deleteApiKey(selectedProvider);
            setStoredApiKeys(prev => {
              const newKeys = { ...prev };
              delete newKeys[selectedProvider];
              return newKeys;
            });
          } catch (e) {
            // Ignore deletion errors
          }
        }
      }
    } catch (error: any) {
      setConnectionStatus("disconnected");
      
      // More specific error messages
      if (error.message?.includes("Invalid") || error.message?.includes("API key") || error.message?.includes("authentication") || 
          error.message?.includes("401") || error.message?.includes("403")) {
        toast.error(`Invalid ${currentProvider?.type === "local" ? "server URL or connection failed" : "API key"} for ${currentProvider?.name}`);
      } else if (error.message?.includes("network") || error.message?.includes("timeout") || error.message?.includes("fetch")) {
        toast.error(`Network error: Could not connect to ${currentProvider?.name}. Check your connection.`);
      } else if (error.message?.includes("URL") || error.message?.includes("http")) {
        toast.error(`Invalid server URL for ${currentProvider?.name}. Please check the URL format.`);
      } else if (error.message?.includes("404") || error.message?.includes("not found")) {
        toast.error(`No ${currentProvider?.type === "local" ? "server URL" : "API key"} configured for ${currentProvider?.name}`);
      } else {
        toast.error(`Failed to connect to ${currentProvider?.name}: ${error.message || "Unknown error"}`);
      }
      
      // If we just saved it for testing and it failed, delete it
      if (!isConfigured && apiKey) {
        try {
          await deleteApiKey(selectedProvider);
          setStoredApiKeys(prev => {
            const newKeys = { ...prev };
            delete newKeys[selectedProvider];
            return newKeys;
          });
        } catch (e) {
          // Ignore deletion errors
        }
      }
    } finally {
      setIsTesting(false);
    }
  };

  // Get current provider info
  const currentProvider = providers.find(p => p.id === selectedProvider);
  const isConfigured = storedApiKeys[selectedProvider];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Key Management
          </CardTitle>
          <CardDescription>
            Configure API keys for cloud AI providers. For local runtimes (Ollama, GGUF, MLX), go to Runtime Manager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingApiKeys ? (
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
              <div className="text-sm">Loading API keys...</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label htmlFor="provider-select" className="text-sm font-medium">
                  AI Provider
                </Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => {
                      const isConfigured = storedApiKeys[provider.id];

                      return (
                        <SelectItem key={provider.id} value={provider.id}>
                          <div className="flex items-center gap-2 w-full">
                            <provider.icon className="h-4 w-4" />
                            <span className="flex-1">{provider.name}</span>
                            {isConfigured ? (
                              <Wifi className="h-3 w-3 text-green-500" />
                            ) : (
                              <WifiOff className="h-3 w-3 text-red-500/50" />
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Provider Status and Controls */}
              <div className="space-y-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-3xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {currentProvider && <currentProvider.icon className="h-5 w-5" />}
                    <div>
                      <div className="font-medium text-sm">{currentProvider?.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {isTesting ? (
                          <Badge variant="secondary" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            Testing...
                          </Badge>
                        ) : (
                          <Badge
                            variant={connectionStatus === "connected" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {connectionStatus === "connected" ? (
                              <Wifi className="h-3 w-3 mr-1" />
                            ) : (
                              <WifiOff className="h-3 w-3 mr-1" />
                            )}
                            {connectionStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testConnection}
                      disabled={isTesting}
                      className="text-xs"
                    >
                      Test
                    </Button>

                    {isConfigured ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteApiKey}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        title="Delete API key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveApiKey}
                        disabled={!apiKey?.trim()}
                        className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                        title="Save API key"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {!isConfigured ? (
                  <div className="space-y-2">
                    <Label htmlFor="api-key-input" className="text-sm">
                      {currentProvider?.type === "local" ? "Server URL" : "API Key"}
                    </Label>
                    <Input
                      id="api-key-input"
                      type={currentProvider?.type === "local" ? "text" : "password"}
                      placeholder={currentProvider?.placeholder}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="text-sm"
                    />
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {currentProvider?.type === "local"
                        ? "Enter the server URL (e.g., http://localhost:1234)"
                        : "Your API key is stored securely and encrypted."}
                    </div>
                    {selectedProvider === "ollama" && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        Running Ollama locally? Go to <strong>Runtime Manager → Ollama tab</strong> to manage your local instance.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {currentProvider?.type === "local" 
                      ? "Server URL is configured."
                      : "API key is configured and stored securely."}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
