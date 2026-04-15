export type Viewport = { width: number; height: number }

export type RenderRequest = {
  url: string
  viewport?: Viewport
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle'
}

export type RenderAsset = {
  mime: string
  data: string
}

export type FontRef = {
  family: string
  weights: number[]
}

export type FigmaNodeJson = {
  type: string
  name?: string
  children?: FigmaNodeJson[]
  [key: string]: unknown
}

export type RenderResponse = {
  tree: FigmaNodeJson
  assets: Record<string, RenderAsset>
  fonts: FontRef[]
  meta: { url: string; renderedAt: string; durationMs: number }
}
