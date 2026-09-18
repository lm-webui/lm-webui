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

// The soft keyboard has no Esc, Tab or arrow keys — the keys every agent TUI needs (claude's
// permission prompt is an arrow-select menu). This bar is that missing row of keys.
//
// `seq` is a thunk, not a string: arrows differ between normal and *application* cursor keys mode
// (DECCKM, `\x1b[?1h`), which TUIs enable, and the mode can change mid-session — so the variant
// has to be resolved when the key is pressed, against the live terminal.
//
// `getTerm` is a GETTER, not the terminal itself. Passing termRef.current would capture its value
// at render time, and on the render where the engine becomes ready the ref is still null — the
// effect that assigns it runs afterwards and does not re-render. Arrows would then stay in the
// wrong mode until some unrelated state change happened to re-render the pane.
function keyTable(getTerm: () => any) {
  const arrow = (final: string) => `\x1b${getTerm()?.modes?.applicationCursorKeysMode ? "O" : "["}${final}`;
  return [
    { label: "Esc",  aria: "Escape",                  seq: () => "\x1b" },
    { label: "⇧Tab", aria: "Shift Tab",               seq: () => "\x1b[Z" },
    { label: "←",    aria: "Arrow left",              seq: () => arrow("D") },
    { label: "↓",    aria: "Arrow down",              seq: () => arrow("B") },
    { label: "↑",    aria: "Arrow up",                seq: () => arrow("A") },
    { label: "→",    aria: "Arrow right",             seq: () => arrow("C") },
    { label: "⏎",    aria: "Enter",                   seq: () => "\r" },
    // The one key you cannot do without on a phone: nothing else interrupts a running command.
    { label: "^C",   aria: "Interrupt (Control C)",   seq: () => "\x03" },
  ];
}

const KEYBOARD_MIN = 120;   // px; below this the URL bar collapsing would read as a keyboard

/** How much of the viewport the on-screen keyboard is covering. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;                       // desktop browsers without it never open a keyboard
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      // vv.height also shrinks ~50–60px when the mobile URL bar hides on scroll. Only a keyboard
      // is big enough to matter; without the threshold the bar jumps every time the chrome moves.
      setInset(hidden > KEYBOARD_MIN ? hidden : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);  // offsetTop changes as iOS scrolls the visual viewport
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

export default function TerminalPane({ agent, sessionId }: { agent: string; sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const sockRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnState>("closed");
  const [ready, setReady] = useState(false);
  // Bumping this re-runs the connect effect, which is how "reconnect" works without a page reload.
  const [nonce, setNonce] = useState(0);
  // Why the socket dropped: 4403 = not installed / no terminal permission, 4404 = session mismatch.
  const [closed, setClosed] = useState<{ code: number; reason: string } | null>(null);

  const send = (data: string | Uint8Array) => {
    const s = sockRef.current;
    if (s?.readyState === WebSocket.OPEN) s.send(data as any);
  };

  // Touch devices only. `pointer: coarse` rather than a width breakpoint: a phone in landscape is
  // wider than 768px and would lose the bar, and useIsMobile flashes false on first paint.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setIsTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const keyboardInset = useKeyboardInset();

  // term.input(..., false): it fires onData, so this is the same path as real typing, and `false`
  // is what its own docs ask for when forwarding an escape sequence (true would also trigger
  // focus/selection side effects on every tap). Never term.paste() — with bracketed paste active
  // it wraps input in \x1b[200~…\x1b[201~ and the app gets literal text.
  const press = (seq: string) => termRef.current?.input(seq, false);

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
    // Keyboard → pty bytes. Sending on a CONNECTING/CLOSED socket throws InvalidStateError, so
    // everything goes through send().
    term.onData((data: string) => send(new TextEncoder().encode(data)));
    // Terminal resize → backend window size.
    term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      send(JSON.stringify({ type: "resize", cols, rows }));
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
    setClosed(null);
    ws.binaryType = "arraybuffer";
    let errored = false;
    ws.onopen = () => {
      setState("open");
      try { fitRef.current?.fit(); } catch { /* ignore */ }
      termRef.current?.focus(); // refocus on connect/reconnect/session switch
      const t = termRef.current;
      send(JSON.stringify({ type: "resize", cols: t?.cols ?? 80, rows: t?.rows ?? 24 }));
    };
    ws.onmessage = (ev) => {
      const t = termRef.current;
      if (!t) return;
      if (ev.data instanceof ArrayBuffer) t.write(new Uint8Array(ev.data));
      else if (typeof ev.data === "string") t.write(ev.data);
    };
    // onerror always precedes onclose; setting state here would be overwritten by onclose a tick
    // later, so it only records that the drop was not clean.
    ws.onerror = () => { errored = true; };
    ws.onclose = (ev) => {
      setClosed({ code: ev.code, reason: ev.reason });
      setState(errored || ev.code !== 1000 ? "error" : "closed");
    };
    return () => {
      // Detach the handlers before closing: a superseded socket's onclose must not clobber the
      // state of the one replacing it.
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      sockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, sessionId, ready, nonce]);

  const connect = () => setNonce((n) => n + 1);

  if (!agent || !sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Pick an agent to open its interactive terminal.
      </div>
    );
  }

  return (
    // paddingBottom, not a margin on the bar: the inset has to shrink the WHOLE pane so the
    // terminal's last rows clear the keyboard too — otherwise the bar floats above it while the
    // prompt you are answering stays hidden behind. The resize re-fits xterm via the ResizeObserver.
    <div className="flex flex-col h-full min-h-0" style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}>
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

      {state !== "open" && closed && (
        <div className="shrink-0 border-b border-border/40 bg-destructive/10 px-3 py-1 text-[.65rem] text-destructive font-mono">
          socket closed ({closed.code}{closed.reason ? `: ${closed.reason}` : ""})
        </div>
      )}

      <div ref={hostRef} className="flex-1 min-h-0 min-w-0 overflow-hidden bg-black/80 p-2" />

      {isTouch ? (
        /* 44x36 targets in one scrollable row: eight keys across a 320px screen would be ~39px
           each, under the touch guideline. shrink-0 + overflow-x-auto keeps them full size and
           lets the row scroll on the narrowest phones. */
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border/40 bg-background px-1 py-1 scrollbar-hide">
          {keyTable(() => termRef.current).map((k) => (
            <button
              key={k.aria}
              type="button"
              aria-label={k.aria}
              // preventDefault on pointerdown keeps focus in xterm's hidden textarea, so the soft
              // keyboard stays open between taps. Without it every key needs the terminal
              // re-tapped first, which makes the bar useless. The click still fires afterwards.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => press(k.seq())}
              className="h-9 min-w-11 shrink-0 rounded-md border border-border/50 bg-muted/40 px-2 font-mono text-xs text-foreground transition-colors active:bg-muted"
            >
              {k.label}
            </button>
          ))}
        </div>
      ) : (
        /* Desktop keeps the hint — there the keys exist, and it explains the prompt model. */
        <div className="shrink-0 border-t border-border/40 bg-background px-3 py-2">
          <span className="text-[.65rem] text-muted-foreground">
            Click the terminal · use <kbd>↑</kbd>/<kbd>↓</kbd> + <kbd>Enter</kbd> or type the number to answer agent prompts
          </span>
        </div>
      )}
    </div>
  );
}
