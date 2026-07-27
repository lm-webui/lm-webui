import { create } from 'zustand';

interface ContextStore {
  activeContext: any | null;
  contextLoading: boolean;

  setActiveContext: (context: any) => void;
  setContextLoading: (loading: boolean) => void;
}

export const useContextStore = create<ContextStore>((set) => ({
  activeContext: null,
  contextLoading: false,

  setActiveContext: (context) => set({ activeContext: context }),
  setContextLoading: (loading) => set({ contextLoading: loading }),
}));
