import { createHash } from 'node:crypto'
import type { BrowserContext } from 'playwright'
import type { FigmaNodeJson, RenderAsset } from './types'

export const hashBytes = (bytes: Uint8Array): string => {
  return createHash('sha1').update(bytes).digest('hex')
}

export const extractImageUrls = (node: FigmaNodeJson): string[] => {
  const urls: string[] = []
  const visit = (n: FigmaNodeJson) => {
    if (Array.isArray(n.fills)) {
      for (const fill of n.fills) {
        if (fill && typeof fill === 'object' && (fill as { type?: string }).type === 'IMAGE') {
          const url = (fill as { url?: string }).url
          if (typeof url === 'string') urls.push(url)
        }
      }
    }
    if (Array.isArray(n.children)) n.children.forEach(visit)
  }
  visit(node)
  return urls
}

export const fetchAndEncode = async (
  ctx: BrowserContext,
  urls: string[]
): Promise<{ assets: Record<string, RenderAsset>; urlToHash: Record<string, string> }> => {
  const assets: Record<string, RenderAsset> = {}
  const urlToHash: Record<string, string> = {}
  const unique = Array.from(new Set(urls))

  await Promise.all(
    unique.map(async (url) => {
      try {
        const resp = await ctx.request.get(url, { timeout: 10000 })
        if (!resp.ok()) return
        const buf = await resp.body()
        const bytes = new Uint8Array(buf)
        const hash = hashBytes(bytes)
        const mime = resp.headers()['content-type']?.split(';')[0] ?? 'image/png'
        assets[hash] = { mime, data: Buffer.from(bytes).toString('base64') }
        urlToHash[url] = hash
      } catch {
        // skip failed images
      }
    })
  )

  return { assets, urlToHash }
}

export const rewriteFillsToHash = (
  node: FigmaNodeJson,
  urlToHash: Record<string, string>
): void => {
  const visit = (n: FigmaNodeJson) => {
    if (Array.isArray(n.fills)) {
      for (const fill of n.fills) {
        if (fill && typeof fill === 'object' && (fill as { type?: string }).type === 'IMAGE') {
          const url = (fill as { url?: string }).url
          if (url && urlToHash[url]) {
            (fill as { assetHash?: string }).assetHash = urlToHash[url]
          }
        }
      }
    }
    if (Array.isArray(n.children)) n.children.forEach(visit)
  }
  visit(node)
}
