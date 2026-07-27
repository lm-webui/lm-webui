export interface UseUIStateManagementOptions {
  onLoadingUpdate: (loading: boolean) => void;
  onSidebarStateUpdate: (open: boolean) => void;
}

export type SidebarView = "conversations" | "search" | "media";

export interface UIFeatureToggles {
  isSearchEnabled: boolean;
  isCodingMode: boolean;
  showRawResponse: boolean;
  autoTitleGeneration: boolean;
}

export interface UIState {
  isSidebarOpen: boolean;
  sidebarView: SidebarView;
  isGalleryOpen: boolean;
  isFileProcessingOpen: boolean;
  isLoading: boolean;
}

export interface UIToggleFunctions {
  toggleSearch: () => void;
  toggleCodingMode: () => void;
  toggleRawResponse: () => void;
  toggleAutoTitleGeneration: () => void;
}

export interface UIStateFunctions {
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  openGallery: () => void;
  closeGallery: () => void;
  openFileProcessing: () => void;
  closeFileProcessing: () => void;
}
