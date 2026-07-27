// Test setup file for Vitest
// Note: Dependencies (@testing-library/react, etc.) need to be installed
// This file will work once dependencies are installed

// Mock global objects for testing
if (typeof global !== 'undefined') {
  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
}

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  })

  // Mock localStorage
  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  }

  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
  })

  // Mock sessionStorage
  const mockSessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  }

  Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage,
  })

  // Mock scrollTo
  window.scrollTo = () => {}
}