import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Renderer } from '../src/renderer'

describe('Renderer', () => {
  let renderer: Renderer

  beforeAll(async () => {
    renderer = new Renderer()
    await renderer.start()
  }, 60000)

  afterAll(async () => {
    await renderer.stop()
  })

  it('renders a simple page into a tree', async () => {
    const result = await renderer.render({
      url: 'data:text/html,<html><body><h1>Hello</h1></body></html>',
      viewport: { width: 1440, height: 900 },
      waitFor: 'load',
    })
    expect(result.tree).toBeDefined()
    expect(result.meta.durationMs).toBeGreaterThan(0)
    expect(Array.isArray(result.fonts)).toBe(true)
  }, 30000)

  it('rejects invalid URLs', async () => {
    await expect(
      renderer.render({ url: 'not-a-url', viewport: { width: 1440, height: 900 } })
    ).rejects.toThrow(/invalid url/i)
  })
})
