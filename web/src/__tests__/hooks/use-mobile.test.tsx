import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../../hooks/use-mobile'

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    // Reset mocks
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // Restore original values
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it('returns true when window width is less than mobile breakpoint', () => {
    // Mock window.innerWidth to be mobile size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })

    // Mock matchMedia
    const mockMatchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 767px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when window width is greater than mobile breakpoint', () => {
    // Mock window.innerWidth to be desktop size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    // Mock matchMedia
    const mockMatchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 767px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    window.matchMedia = mockMatchMedia

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('adds and removes event listener', () => {
    const addEventListenerMock = vi.fn()
    const removeEventListenerMock = vi.fn()

    const mockMatchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }))
    window.matchMedia = mockMatchMedia

    const { unmount } = renderHook(() => useIsMobile())

    // Should have added event listener
    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))

    // Unmount should remove event listener
    unmount()
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates when media query changes', () => {
    let changeCallback: (() => void) | null = null
    const addEventListenerMock = vi.fn().mockImplementation((event, callback) => {
      if (event === 'change') {
        changeCallback = callback
      }
    })
    const removeEventListenerMock = vi.fn()

    const mockMatchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }))
    window.matchMedia = mockMatchMedia

    // Mock window.innerWidth to be desktop initially
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // Simulate window resize to mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })

    // Trigger the change callback
    act(() => {
      if (changeCallback) {
        changeCallback()
      }
    })

    // Should now be true
    expect(result.current).toBe(true)
  })
})