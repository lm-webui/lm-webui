import React, { useEffect, useRef, useState } from "react";
import { startRun, stopRun } from "../../api/run";

type Props = { sessionId: string };

export default function RunManager({ sessionId }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [running, setRunning] = useState(false);
  const [modelPath, setModelPath] = useState("backend/models/");
  const [apiKey, setApiKey] = useState("");
  const [systemInfo, setSystemInfo] = useState<any>(null);

  function append(line: string) {
    setLogs(prev => [...prev, line]);
  }

  async function fetchSystemInfo() {
    try {
      const res = await fetch("/api/system/gpu");
      const data = await res.json();
      setSystemInfo(data);
      return data;
    } catch (error) {
      append(`[error] Failed to fetch system info: ${error}`);
      return null;
    }
  }

  async function handleStartLocal() {
    // Fetch system info to determine best runtime
    const sys = await fetchSystemInfo();
    if (!sys) {
      append("Error: Could not determine system capabilities");
      return;
    }

    // Choose runtime: prefer CUDA if available, then Metal, then CPU
    const runtime = sys.is_cuda_available ? "cuda" : (sys.is_apple_silicon ? "metal" : "cpu");
    
    if (!modelPath) {
      append("Error: Please provide a model path");
      return;
    }

    const payload = {
      type: "local",
      model_path: modelPath,
      runtime: runtime,
      extra_args: []
    };

    const resp = await startRun(sessionId, "local", payload);
    if (resp.status === "started") {
      setRunning(true);
      startWs(resp.session_id || sessionId);
    } else {
      append(JSON.stringify(resp));
    }
  }

  async function handleStartAPI() {
    if (!apiKey) {
      append("Error: API key is required for API runs");
      return;
    }

    const api_info = {
      url: "https://api.example/stream",
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { prompt: "hello" },
      api_key: apiKey
    };

    const resp = await startRun(sessionId, "api", { api_info });
    if (resp.status === "started") {
      setRunning(true);
      startWs(resp.session_id || sessionId);
    } else {
      append(JSON.stringify(resp));
    }
  }

  async function handleStop() {
    const resp = await stopRun(sessionId);
    append(`[stop] ${JSON.stringify(resp)}`);
    setRunning(false);
    // Close websocket if open
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }

  function startWs(targetSessionId: string = sessionId) {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/api/run/ws/${encodeURIComponent(targetSessionId)}`);
    wsRef.current = ws;
    ws.onopen = () => append("[ws] connected");
    ws.onmessage = (ev) => {
      append(ev.data);
    };
    ws.onclose = () => {
      append("[ws] closed");
      setRunning(false);
    };
    ws.onerror = (ev) => append(`[ws error] ${JSON.stringify(ev)}`);
  }

  useEffect(() => {
    // Fetch system info on component mount
    fetchSystemInfo();
    
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div style={{ border: "1px solid #ddd", padding: 12 }}>
      <div style={{ marginBottom: 8 }}>
        {/* Model path input */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Model Path:</label>
          <input
            type="text"
            value={modelPath}
            onChange={(e) => setModelPath(e.target.value)}
            style={{ width: "100%", padding: 4 }}
            placeholder="path/to/model.gguf"
          />
        </div>
        
        {/* API key input */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", marginBottom: 4 }}>API Key:</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: "100%", padding: 4 }}
            placeholder="Enter API key for API runs"
          />
        </div>
        
        {/* System info display */}
        {systemInfo && (
          <div style={{ marginBottom: 8, fontSize: "12px", color: "#666" }}>
            Detected: {systemInfo.recommended_runtime.toUpperCase()}
            {systemInfo.is_cuda_available && ` (${systemInfo.cuda_devices.length} CUDA devices)`}
            {systemInfo.is_apple_silicon && " (Apple Silicon)"}
          </div>
        )}
        
        <button onClick={handleStartLocal} disabled={running}>Start Local</button>
        <button onClick={handleStartAPI} disabled={running} style={{ marginLeft: 8 }}>Start API</button>
        <button onClick={handleStop} disabled={!running} style={{ marginLeft: 8 }}>Stop</button>
      </div>

      <div style={{ height: 320, overflowY: "auto", background: "#111", color: "#eee", padding: 8 }}>
        {logs.map((l, i) => <div key={i}><code>{l}</code></div>)}
      </div>
    </div>
  );
}
