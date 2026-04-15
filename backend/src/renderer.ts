import { chromium, Browser, BrowserContext } from 'playwright'
import type { RenderRequest, RenderResponse, FigmaNodeJson } from './types'
import { getEngineSource } from './engine'
import { extractImageUrls, fetchAndEncode, rewriteFillsToHash } from './assets'

export class Renderer {
  private browser?: Browser
  private engineSource?: string
  private requestCount = 0
  private readonly restartEvery = Number(process.env.BROWSER_RESTART_EVERY ?? 50)

  async start() {
    this.browser = await chromium.launch({ headless: true })
    this.engineSource = await getEngineSource()
  }

  async stop() {
    await this.browser?.close()
    this.browser = undefined
  }

  async render(req: RenderRequest): Promise<RenderResponse> {
    if (!/^https?:|^data:/.test(req.url)) {
      throw new Error('invalid url: must be http(s) or data:')
    }
    if (!this.browser || !this.engineSource) {
      throw new Error('renderer not started')
    }

    if (this.requestCount >= this.restartEvery) {
      await this.stop()
      await this.start()
      this.requestCount = 0
    }

    const ctx: BrowserContext = await this.browser.newContext({
      viewport: req.viewport ?? { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 WebToFigma/1.0',
    })

    const start = Date.now()
    try {
      const page = await ctx.newPage()
      await page.goto(req.url, { timeout: 30000 })
      await page.waitForLoadState(req.waitFor ?? 'networkidle', { timeout: 30000 })

      await page.addScriptTag({ content: this.engineSource })

      const result = await page.evaluate(() => {
        const lib = (window as unknown as { htmlToFigmaLib: { htmlToFigma: (n: Element) => unknown } }).htmlToFigmaLib
        const tree = lib.htmlToFigma(document.body)
        const fonts = new Map<string, Set<number>>()
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el)
          const family = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '')
          const weight = parseInt(cs.fontWeight, 10) || 400
          if (!fonts.has(family)) fonts.set(family, new Set())
          fonts.get(family)!.add(weight)
        })
        return {
          tree,
          fonts: Array.from(fonts.entries()).map(([family, weights]) => ({
            family,
            weights: Array.from(weights),
          })),
          title: document.title,
        }
      })

      const urls = extractImageUrls(result.tree as FigmaNodeJson)
      const { assets, urlToHash } = await fetchAndEncode(ctx, urls)
      rewriteFillsToHash(result.tree as FigmaNodeJson, urlToHash)

      this.requestCount++

      return {
        tree: result.tree as FigmaNodeJson,
        assets,
        fonts: result.fonts,
        meta: {
          url: result.title || req.url,
          renderedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        },
      }
    } finally {
      await ctx.close()
    }
  }
}
