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
        type LayoutInfo = {
          mode: 'HORIZONTAL' | 'VERTICAL' | 'NONE'
          itemSpacing: number
          paddingT: number
          paddingR: number
          paddingB: number
          paddingL: number
          primaryAxis: string
          counterAxis: string
        }
        type DomEntry = {
          x: number; y: number; w: number; h: number
          tag: string; id: string; classes: string[]
          layout: LayoutInfo
          isSection: boolean
        }
        const textRegistry: TextEntry[] = []
        const domRegistry: DomEntry[] = []

        const SECTION_TAGS = new Set(['section', 'header', 'nav', 'main', 'article', 'aside', 'footer'])

        const parsePx = (s: string): number => {
          const n = parseFloat(s)
          return Number.isFinite(n) ? Math.round(n) : 0
        }

        const cssAlignToFigma = (v: string): string => {
          switch (v) {
            case 'flex-start':
            case 'start':
            case 'normal':
              return 'MIN'
            case 'center':
              return 'CENTER'
            case 'flex-end':
            case 'end':
              return 'MAX'
            case 'space-between':
              return 'SPACE_BETWEEN'
            case 'baseline':
              return 'MIN'
            case 'stretch':
              return 'MIN'
            default:
              return 'MIN'
          }
        }

        const getLayout = (cs: CSSStyleDeclaration): LayoutInfo => {
          const isFlex = cs.display === 'flex' || cs.display === 'inline-flex'
          if (!isFlex) {
            return {
              mode: 'NONE', itemSpacing: 0,
              paddingT: 0, paddingR: 0, paddingB: 0, paddingL: 0,
              primaryAxis: 'MIN', counterAxis: 'MIN',
            }
          }
          const dir = cs.flexDirection || 'row'
          const mode: LayoutInfo['mode'] = dir.startsWith('column') ? 'VERTICAL' : 'HORIZONTAL'
          const gap = parsePx(cs.columnGap || cs.gap || '0')
          return {
            mode,
            itemSpacing: gap,
            paddingT: parsePx(cs.paddingTop),
            paddingR: parsePx(cs.paddingRight),
            paddingB: parsePx(cs.paddingBottom),
            paddingL: parsePx(cs.paddingLeft),
            primaryAxis: cssAlignToFigma(cs.justifyContent || 'flex-start'),
            counterAxis: cssAlignToFigma(cs.alignItems || 'stretch'),
          }
        }

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
          const tag = el.tagName.toLowerCase()
          domRegistry.push({
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            tag,
            id: el.id || '',
            classes,
            layout: getLayout(cs),
            isSection: SECTION_TAGS.has(tag),
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
              if (dom.isSection) {
                n.name = '[SECTION] ' + n.name
              }
              if (dom.layout.mode !== 'NONE') {
                n.layoutMode = dom.layout.mode
                n.itemSpacing = dom.layout.itemSpacing
                n.paddingTop = dom.layout.paddingT
                n.paddingRight = dom.layout.paddingR
                n.paddingBottom = dom.layout.paddingB
                n.paddingLeft = dom.layout.paddingL
                n.primaryAxisAlignItems = dom.layout.primaryAxis
                n.counterAxisAlignItems = dom.layout.counterAxis
              }
            }
          }

          if (Array.isArray(n.children)) {
            for (const c of n.children) enrich(c as Record<string, unknown>, nx, ny)
          }
          if (n.before) enrich(n.before as Record<string, unknown>, nx, ny)
          if (n.after) enrich(n.after as Record<string, unknown>, nx, ny)
        }
        enrich(tree as Record<string, unknown>, 0, 0)

        const hasVisual = (n: Record<string, unknown>): boolean => {
          const fills = Array.isArray(n.fills) ? n.fills : []
          if (fills.length > 0) return true
          const strokes = Array.isArray(n.strokes) ? n.strokes : []
          if (strokes.length > 0) return true
          const effects = Array.isArray(n.effects) ? n.effects : []
          if (effects.length > 0) return true
          if (typeof n.svg === 'string' && n.svg.length > 0) return true
          if (n.type === 'TEXT') return true
          return false
        }

        const collapseWrappers = (n: Record<string, unknown>): void => {
          if (!Array.isArray(n.children)) return
          for (const c of n.children) collapseWrappers(c as Record<string, unknown>)

          const newChildren: unknown[] = []
          for (const c of n.children) {
            const child = c as Record<string, unknown>
            if (
              child.type === 'FRAME' &&
              !hasVisual(child) &&
              !child.layoutMode &&
              Array.isArray(child.children) &&
              child.children.length > 0
            ) {
              const cx = typeof child.x === 'number' ? child.x : 0
              const cy = typeof child.y === 'number' ? child.y : 0
              for (const gc of child.children) {
                const gchild = gc as Record<string, unknown>
                if (typeof gchild.x === 'number') gchild.x = gchild.x + cx
                if (typeof gchild.y === 'number') gchild.y = gchild.y + cy
                newChildren.push(gchild)
              }
            } else {
              newChildren.push(child)
            }
          }
          n.children = newChildren
        }
        collapseWrappers(tree as Record<string, unknown>)

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
