import { clearModelsCache } from "@/utils/api";

export const MODELS_CHANGED_EVENT = "models-changed";

// Every emitter means "the cached model lists are stale". Invalidating here rather than in each
// listener keeps the listeners dumb — they just refetch. Without this the event re-issued the
// fetch but fetchModels handed back its own 5-minute cache, so saving a key or URL did nothing.
export const notifyModelsChanged = () => {
  clearModelsCache();
  window.dispatchEvent(new Event(MODELS_CHANGED_EVENT));
};
