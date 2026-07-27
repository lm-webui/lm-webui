import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Button } from '../../../components/ui/button'

// Simple test that will work without @testing-library/react matchers
describe('Button', () => {
  it('renders button with default props', () => {
    const { container } = render(<Button>Click me</Button>)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.textContent).toBe('Click me')
  })

  it('renders button with variant', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    // Check class contains destructive variant
    expect(button?.className).toContain('bg-destructive')
  })

  it('renders button with size', () => {
    const { container } = render(<Button size="lg">Large Button</Button>)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.className).toContain('h-10')
  })

  it('renders disabled button', () => {
    const { container } = render(<Button disabled>Disabled</Button>)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.hasAttribute('disabled')).toBe(true)
  })

  it('renders button as child', () => {
    const { container } = render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    )
    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBe('/test')
  })
})