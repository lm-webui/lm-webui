import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Message } from "@/components/chat/Message";

// Model output is the untrusted source here — it can contain raw HTML, and rehype-raw
// parses it. If the sanitizer is ever dropped or loosened these fail.
const renderAssistant = (content: string) =>
  render(
    <Message
      message={{ id: "1", role: "assistant", content, timestamp: new Date() }}
    />,
  ).container;

describe("Message markdown sanitization", () => {
  // Note: `onerror`/`onclick` are NOT asserted here. React drops those props on its own,
  // whether or not the sanitizer runs, so a test on them would pass for the wrong reason.
  // These payloads are ones only the sanitizer removes.
  it("drops script tags and their contents", () => {
    const container = renderAssistant(
      '<script>window.__pwned=1</script><p>after</p>',
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("__pwned");
    expect(container.textContent).toContain("after");
  });

  it("drops iframes", () => {
    const container = renderAssistant(
      '<iframe src="https://evil.example"></iframe><p>after</p>',
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("after");
  });

  it("drops style tags", () => {
    const container = renderAssistant(
      "<style>body{display:none}</style><p>after</p>",
    );

    expect(container.querySelector("style")).toBeNull();
    expect(container.textContent).toContain("after");
  });

  it("strips javascript: URLs from links", () => {
    const container = renderAssistant("[click](javascript:alert(1))");

    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain(
      "javascript:",
    );
  });

  // The schema extension exists for this — the default schema drops `alt` and `title`.
  it("keeps alt text on images", () => {
    const md = renderAssistant("![a chart](https://example.com/a.png)");
    expect(md.querySelector("img")?.getAttribute("alt")).toBe("a chart");

    const raw = renderAssistant(
      '<img src="https://example.com/b.png" alt="inline">',
    );
    expect(raw.querySelector("img")?.getAttribute("alt")).toBe("inline");
  });
});
