import { describe, it, expect } from 'vitest'
import { cn } from '../../lib/utils'

describe('cn utility function', () => {
  it('merges class names correctly', () => {
    const result = cn('px-4', 'py-2')
    expect(result).toBe('px-4 py-2')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const result = cn('btn', isActive && 'btn-active', !isActive && 'btn-inactive')
    expect(result).toBe('btn btn-active')
  })

  it('merges Tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4')
    // tailwind-merge should keep the last px-4
    expect(result).toBe('py-1 px-4')
  })

  it('handles empty inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('handles arrays and objects', () => {
    const result = cn(
      'base',
      ['array-class1', 'array-class2'],
      { 'object-class': true, 'skip-class': false }
    )
    expect(result).toContain('base')
    expect(result).toContain('array-class1')
    expect(result).toContain('array-class2')
    expect(result).toContain('object-class')
    expect(result).not.toContain('skip-class')
  })
})