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
        type TextEntry = { x: number; y: number; w: number; h: number; weight: number; family: string }
        type DomEntry = {
          x: number; y: number; w: number; h: number
          tag: string; id: string; classes: string[]
        }
        const textRegistry: TextEntry[] = []
        const domRegistry: DomEntry[] = []

        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el)
          const rawFamily = cs.fontFamily || ''
          const family = rawFamily.split(',')[0].trim().replace(/["']/g, '')
          const weight = parseInt(cs.fontWeight, 10) || 400
          if (family) {
            if (!fonts.has(family)) fonts.set(family, new Set())
            fonts.get(family)!.add(weight)
          }

          const rect = el.getBoundingClientRect()
          if (rect.width < 1 || rect.height < 1) return

          const text = (el.textContent || '').trim()
          if (text.length > 0) {
            textRegistry.push({
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              weight,
              family,
            })
          }

          const classes: string[] = []
          if (typeof el.className === 'string') {
            const raw = el.className.trim()
            if (raw) classes.push(...raw.split(/\s+/).slice(0, 3))
          }
          domRegistry.push({
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            classes,
          })
        })

        const findTextMatch = (n: { x?: number; y?: number }) => {
          let best: { weight: number; family: string } | null = null
          let bestScore = Infinity
          for (const t of textRegistry) {
            const dx = Math.abs((n.x ?? 0) - t.x)
            const dy = Math.abs((n.y ?? 0) - t.y)
            if (dx > 20 || dy > 20) continue
            const score = dx + dy
            if (score < bestScore) {
              bestScore = score
              best = { weight: t.weight, family: t.family }
            }
          }
          return best
        }

        const findDomMatch = (n: { x?: number; y?: number; width?: number; height?: number }) => {
          let best: DomEntry | null = null
          let bestScore = Infinity
          const nx = n.x ?? 0
          const ny = n.y ?? 0
          const nw = n.width ?? 0
          const nh = n.height ?? 0
          for (const d of domRegistry) {
            const dx = Math.abs(nx - d.x)
            const dy = Math.abs(ny - d.y)
            const dw = Math.abs(nw - d.w)
            const dh = Math.abs(nh - d.h)
            if (dx > 5 || dy > 5 || dw > 5 || dh > 5) continue
            const score = dx + dy + dw + dh
            if (score < bestScore) {
              bestScore = score
              best = d
            }
          }
          return best
        }

        const makeName = (d: DomEntry): string => {
          let n = d.tag
          if (d.id) n += '#' + d.id
          if (d.classes.length > 0) {
            n += '.' + d.classes.join('.')
          }
          return n
        }

        const enrich = (n: Record<string, unknown>, absX: number, absY: number) => {
          const nx = (typeof n.x === 'number' ? n.x : 0) + absX
          const ny = (typeof n.y === 'number' ? n.y : 0) + absY
          const forMatch = {
            x: nx,
            y: ny,
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
          }

          if (n.type === 'TEXT') {
            const match = findTextMatch(forMatch)
            if (match) {
              if (n.fontWeight === undefined) n.fontWeight = match.weight
              if (typeof n.fontFamily !== 'string' || !n.fontFamily.trim()) {
                n.fontFamily = match.family
              } else {
                n.fontFamily = (n.fontFamily as string).split(',')[0].trim().replace(/["']/g, '')
              }
            }
            if (typeof n.characters === 'string') {
              n.name = n.characters.slice(0, 40)
            }
          } else {
            const dom = findDomMatch(forMatch)
            if (dom) {
              n.name = makeName(dom)
            }
          }

          if (Array.isArray(n.children)) {
            for (const c of n.children) enrich(c as Record<string, unknown>, nx, ny)
          }
          if (n.before) enrich(n.before as Record<string, unknown>, nx, ny)
          if (n.after) enrich(n.after as Record<string, unknown>, nx, ny)
        }
        enrich(tree as Record<string, unknown>, 0, 0)

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
