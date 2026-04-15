import { describe, it, expect } from 'vitest'
import { hashBytes, extractImageUrls } from '../src/assets'

describe('hashBytes', () => {
  it('produces stable sha1 hex for same input', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]))
    const b = hashBytes(new Uint8Array([1, 2, 3]))
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{40}$/)
  })

  it('produces different hashes for different input', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]))
    const b = hashBytes(new Uint8Array([4, 5, 6]))
    expect(a).not.toBe(b)
  })
})

describe('extractImageUrls', () => {
  it('finds url() refs in node tree', () => {
    const tree = {
      type: 'FRAME',
      fills: [{ type: 'IMAGE', url: 'https://cdn.example/a.jpg' }],
      children: [
        { type: 'RECTANGLE', fills: [{ type: 'IMAGE', url: 'https://cdn.example/b.png' }] },
      ],
    }
    const urls = extractImageUrls(tree)
    expect(urls).toEqual(['https://cdn.example/a.jpg', 'https://cdn.example/b.png'])
  })

  it('returns empty array for tree with no image fills', () => {
    const tree = { type: 'FRAME', fills: [{ type: 'SOLID' }] }
    expect(extractImageUrls(tree)).toEqual([])
  })
})
