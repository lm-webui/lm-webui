/*
 * The xterm host must exist in the DOM on the FIRST render, before any agent is picked.
 *
 * Effect 2 (create the terminal) is keyed on `ready` and bails when `hostRef.current` is null.
 * With the pane's placeholder rendered as an early `return` instead of an overlay, the host was
 * absent while the engine loaded, the effect never re-ran, and selecting an agent opened the
 * socket onto a pane with no terminal behind it: blank, and no `onData`, so typing did nothing.
 *
 * Rendering statically (effects never run here) is exactly the condition under test: if the host
 * is missing from this markup, the effect that mounts the terminal has nothing to mount into.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TerminalPane from "./TerminalPane";

describe("TerminalPane host container", () => {
  it("renders the terminal host before any agent is selected", () => {
    const html = renderToStaticMarkup(<TerminalPane agent="" sessionId="" />);
    expect(html).toContain('data-testid="terminal-host"');
    expect(html).toContain("Pick an agent");
  });

  it("still renders the host once an agent and session are set", () => {
    const html = renderToStaticMarkup(<TerminalPane agent="claude" sessionId="abc12345" />);
    expect(html).toContain('data-testid="terminal-host"');
    expect(html).not.toContain("Pick an agent");
  });
});
