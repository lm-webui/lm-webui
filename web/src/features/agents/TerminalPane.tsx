import { useEffect, useRef, useState } from "react";
import { Terminal as TerminalIcon, WifiOff, Loader2 } from "lucide-react";
import { agentTerminalWsUrl } from "@/utils/api";

/*
 * Real TUI for Agent Hub interactive sessions, backed by vendored @xterm/xterm.
 *
 * The xterm assets are vendored under public/vendor/xterm (UMD builds expose window.Terminal and
 * window.FitAddon) because web/node_modules is root-owned and can't be npm-installed in this env.
 * xterm renders the agent's real alternate-screen TUI (ASCII art, colors, cursor, images) and
 * passes decoded keyboard input straight to the pty, so Claude/Codex/OpenCode/Hermes interact
 * natively — answer prompts with the keys the CLI shows (y/n/a, arrow-select, or a number).
 *
 * Wire protocol (backend /api/agents/{agent}/terminal/{sid}):
 *   browser -> pty : binary frames (key input) + {"type":"resize",cols,rows} text frames
 *   pty -> browser : binary frames (raw output)
 */

type ConnState = "connecting" | "open" | "closed" | "error";

declare global {
  interface Window {
    Terminal?: any;
    FitAddon?: { FitAddon: any };
  }
}

// Load the vendored xterm JS/CSS once; resolves when both globals are present.
function loadXterm(): Promise<void> {
  return new Promise((resolve) => {
    const w = window;
    if (w.Terminal && w.FitAddon) return resolve();
    if (!document.getElementById("xterm-css")) {
      const link = document.createElement("link");
      link.id = "xterm-css";
      link.rel = "stylesheet";
      link.href = "/vendor/xterm/xterm.css";
      document.head.appendChild(link);
    }
    const assets: { id: string; src: string; ready: () => boolean }[] = [
      { id: "xterm-js", src: "/vendor/xterm/xterm.js", ready: () => !!w.Terminal },
      { id: "xterm-fit", src: "/vendor/xterm/addon-fit.js", ready: () => !!w.FitAddon },
    ];
    const pending = assets.length;
    let done = 0;
    const finish = () => { done += 1; if (done >= pending) resolve(); };
    for (const a of assets) {
      if (document.getElementById(a.id)) { finish(); continue; }
      const s = document.createElement("script");
      s.id = a.id;
      s.src = a.src;
      s.onload = finish;
      s.onerror = finish; // resolve anyway; terminal may still work partially
      document.head.appendChild(s);
    }
  });
}

const DARK_THEME = {
  background: "#0a0a0a",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  selectionBackground: "#264f78",
  black: "#1e1e1e", red: "#f14c4c", green: "#23d18b", yellow: "#f5f543", blue: "#3b8eea",
  magenta: "#d670d6", cyan: "#29b8db", white: "#d4d4d4",
  brightBlack: "#808080", brightRed: "#f14c4c", brightGreen: "#23d18b", brightYellow: "#f5f543",
  brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#ffffff",
};

export default function TerminalPane({ agent, sessionId }: { agent: string; sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const sockRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnState>("closed");
  const [ready, setReady] = useState(false);

  // 1. Load the terminal engine.
  useEffect(() => {
    let cancelled = false;
    loadXterm().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  // 2. Instantiate xterm in the host div once the engine is ready.
  useEffect(() => {
    if (!ready || !hostRef.current || termRef.current) return;
    const term = new window.Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: DARK_THEME,
      allowProposedApi: true,
    });
    termRef.current = term;
    term.open(hostRef.current);
    if (window.FitAddon) {
      const fit = new window.FitAddon.FitAddon();
      fitRef.current = fit;
      term.loadAddon(fit);
      try { fit.fit(); } catch { /* host may be hidden initially */ }
    }
    term.focus(); // native input (arrows/numbers/Enter) works without a click
    // Keyboard → pty bytes.
    term.onData((data: string) => { sockRef.current?.send(new TextEncoder().encode(data)); });
    // Terminal resize → backend window size.
    term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      sockRef.current?.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    const ro = new ResizeObserver(() => { try { fitRef.current?.fit(); } catch { /* ignore */ } });
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); term.dispose(); termRef.current = null; };
  }, [ready]);

  // 3. Connect the WebSocket (one PTY per (agent, session)) once the terminal can render.
  useEffect(() => {
    if (!ready || !agent || !sessionId) { setState("closed"); return; }
    const ws = new WebSocket(agentTerminalWsUrl(agent, sessionId));
    sockRef.current = ws;
    setState("connecting");
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      setState("open");
      try { fitRef.current?.fit(); } catch { /* ignore */ }
      termRef.current?.focus(); // refocus on connect/reconnect/session switch
      const t = termRef.current;
      ws.send(JSON.stringify({ type: "resize", cols: t?.cols ?? 80, rows: t?.rows ?? 24 }));
    };
    ws.onmessage = (ev) => {
      const t = termRef.current;
      if (!t) return;
      if (ev.data instanceof ArrayBuffer) t.write(new Uint8Array(ev.data));
      else if (typeof ev.data === "string") t.write(ev.data);
    };
    ws.onclose = () => setState((s) => (s === "connecting" ? "error" : "closed"));
    ws.onerror = () => { ws.close(); setState("error"); };
    return () => { ws.close(); sockRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, sessionId, ready]);

  const connect = () => { if (state !== "open") window.location.reload(); };

  if (!agent || !sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Pick an agent to open its interactive terminal.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-border/40 px-3 h-9 shrink-0">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <TerminalIcon className="h-3.5 w-3.5" /> {agent} · interactive
        </span>
        {state !== "open" && (
          <button onClick={connect} className="text-[.65rem] text-primary hover:underline flex items-center gap-1">
            {state === "connecting" ? <Loader2 className="h-3 w-3 animate-spin" /> : <WifiOff className="h-3 w-3" />}
            {state === "connecting" ? "connecting…" : state === "error" ? "reconnect" : "connect"}
          </button>
        )}
      </div>

      <div ref={hostRef} className="flex-1 min-h-0 min-w-0 overflow-hidden bg-black/80 p-2" />

      {/* Hint only — no fake buttons. Native input handles every prompt type (y/n, arrow-select, number). */}
      <div className="shrink-0 border-t border-border/40 bg-background px-3 py-2">
        <span className="text-[.65rem] text-muted-foreground">
          Click the terminal · use <kbd>↑</kbd>/<kbd>↓</kbd> + <kbd>Enter</kbd> or type the number to answer agent prompts
        </span>
      </div>
    </div>
  );
}
