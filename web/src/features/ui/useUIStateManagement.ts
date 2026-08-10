import { useState } from "react";
import { UseUIStateManagementOptions } from "./types";

export function useUIStateManagement(options: UseUIStateManagementOptions) {
  // Model selection states - load from localStorage or empty
  const [selectedLLM, setSelectedLLMState] = useState(() => {
    return localStorage.getItem('selectedLLM') || '';
  });
  const [selectedModel, setSelectedModelState] = useState(() => {
    return localStorage.getItem('selectedModel') || '';
  });

  // Wrapped setters that also persist to localStorage
  const setSelectedLLM = (llm: string) => {
    setSelectedLLMState(llm);
    localStorage.setItem('selectedLLM', llm);
  };

  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    localStorage.setItem('selectedModel', model);
  };

  // Feature toggle states
  const [isSearchEnabled, setIsSearchEnabled] = useState(true);
  const [isImageMode, setIsImageMode] = useState(false);
  const [isCodingMode, setIsCodingMode] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [autoTitleGeneration, setAutoTitleGeneration] = useState(true);

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"conversations" | "search" | "media">("conversations");
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isFileProcessingOpen, setIsFileProcessingOpen] = useState(false);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Enhanced setter for loading state
  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
    options.onLoadingUpdate(loading);
  };

  // Enhanced setter for sidebar state
  const setSidebarOpen = (open: boolean) => {
    setIsSidebarOpen(open);
    options.onSidebarStateUpdate(open);
  };

  // Feature toggle functions
  const toggleSearch = () => setIsSearchEnabled(prev => !prev);
  const toggleImageMode = () => {
    const newValue = !isImageMode;
    setIsImageMode(newValue);
  };
  const toggleCodingMode = () => setIsCodingMode(prev => !prev);
  const toggleRawResponse = () => setShowRawResponse(prev => !prev);
  const toggleAutoTitleGeneration = () => setAutoTitleGeneration(prev => !prev);

  // UI state functions
  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);
  
  const openGallery = () => setIsGalleryOpen(true);
  const closeGallery = () => setIsGalleryOpen(false);
  
  const openFileProcessing = () => setIsFileProcessingOpen(true);
  const closeFileProcessing = () => setIsFileProcessingOpen(false);

  return {
    // Model selection
    selectedLLM,
    setSelectedLLM,
    selectedModel,
    setSelectedModel,

    // Feature toggles
    isSearchEnabled,
    setIsSearchEnabled,
    isImageMode,
    setIsImageMode,
    isCodingMode,
    setIsCodingMode,
    showRawResponse,
    setShowRawResponse,
    autoTitleGeneration,
    setAutoTitleGeneration,

    // UI state
    isSidebarOpen,
    setIsSidebarOpen: setSidebarOpen,
    sidebarView,
    setSidebarView,
    isGalleryOpen,
    setIsGalleryOpen,
    isFileProcessingOpen,
    setIsFileProcessingOpen,

    // Loading state
    isLoading,
    setIsLoading: setLoading,

    // Feature toggle functions
    toggleSearch,
    toggleImageMode,
    toggleCodingMode,
    toggleRawResponse,
    toggleAutoTitleGeneration,

    // UI state functions
    openSidebar,
    closeSidebar,
    toggleSidebar,
    openGallery,
    closeGallery,
    openFileProcessing,
    closeFileProcessing,
  };
}
