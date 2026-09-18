import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchModels, clearModelsCache } from "@/utils/api";
import { notifyModelsChanged, MODELS_CHANGED_EVENT } from "./modelEvents";

// A provider fetch goes through authFetch -> global fetch, so stubbing fetch is enough to
// control what the "provider" reports.
const originalFetch = global.fetch;

function providerReturns(names: string[]) {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ models: names }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

const loadOllama = () => fetchModels("ollama", { dynamic: true });

afterEach(() => {
  global.fetch = originalFetch;
  clearModelsCache();
});

describe("model list cache invalidation", () => {
  // Saving a provider URL or key used to re-issue the fetch and get the cached list back, so
  // the UI kept showing the pre-save models for the full 5-minute TTL.
  it("serves the cached list until the cache is cleared", async () => {
    providerReturns(["llama3"]);
    expect(await loadOllama()).toEqual(["llama3"]);

    providerReturns(["mistral"]);
    expect(await loadOllama()).toEqual(["llama3"]); // still cached

    clearModelsCache();
    expect(await loadOllama()).toEqual(["mistral"]); // now re-probes
  });

  it("notifyModelsChanged clears the cache before dispatching the event", async () => {
    providerReturns(["llama3"]);
    expect(await loadOllama()).toEqual(["llama3"]);

    const listener = vi.fn();
    window.addEventListener(MODELS_CHANGED_EVENT, listener);

    providerReturns(["mistral"]);
    notifyModelsChanged();

    window.removeEventListener(MODELS_CHANGED_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(await loadOllama()).toEqual(["mistral"]);
  });
});
