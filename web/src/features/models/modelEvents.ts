export const MODELS_CHANGED_EVENT = "models-changed";
export const notifyModelsChanged = () =>
  window.dispatchEvent(new Event(MODELS_CHANGED_EVENT));
