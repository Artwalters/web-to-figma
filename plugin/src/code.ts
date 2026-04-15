import { buildTree } from './builder'
import { loadFonts } from './fonts'
import type { RenderResponse } from './types'

const backendUrl = process.env.BACKEND_URL ?? 'https://api.onemanarmy.world'
const apiKey = process.env.BACKEND_API_KEY ?? ''

figma.showUI(__html__, { width: 320, height: 480, themeColors: true })

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'render') return

  try {
    figma.ui.postMessage({ type: 'progress', text: 'Fetching render from server...' })

    const viewportWidth = typeof msg.viewport === 'number' ? msg.viewport : 1440
    const viewportHeight = Math.round(viewportWidth * 0.625)

    const res = await fetch(`${backendUrl}/render`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: msg.url,
        viewport: { width: viewportWidth, height: viewportHeight },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error ?? 'render failed')
    }
    const data = (await res.json()) as RenderResponse

    figma.ui.postMessage({ type: 'progress', text: 'Loading fonts...' })
    const missingFonts = await loadFonts(data.fonts)

    figma.ui.postMessage({ type: 'progress', text: 'Building frames...' })
    const root = await buildTree(data.tree, data.assets)
    figma.currentPage.appendChild(root)
    figma.currentPage.selection = [root]
    figma.viewport.scrollAndZoomIntoView([root])

    const frameCount = countFrames(root)
    const imageCount = Object.keys(data.assets).length
    figma.ui.postMessage({
      type: 'success',
      frames: frameCount,
      images: imageCount,
      missingFonts,
    })
  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: (err as Error).message })
  }
}

const countFrames = (node: SceneNode): number => {
  let count = 1
  if ('children' in node) {
    for (const c of node.children) count += countFrames(c)
  }
  return count
}
