export type Viewport = { width: number; height: number }

export type RenderAsset = {
  mime: string
  data: string
}

export type FontRef = {
  family: string
  weights: number[]
}

export type FigmaColor = { r: number; g: number; b: number }

export type FigmaNodeJson = {
  type: string
  name?: string
  children?: FigmaNodeJson[]
  x?: number
  y?: number
  width?: number
  height?: number
  fills?: Array<{
    type: string
    color?: FigmaColor
    opacity?: number
    url?: string
    assetHash?: string
  }>
  strokes?: Array<{ type: string; color?: FigmaColor; opacity?: number }>
  strokeWeight?: number
  cornerRadius?: number
  characters?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  [key: string]: unknown
}

export type RenderResponse = {
  tree: FigmaNodeJson
  assets: Record<string, RenderAsset>
  fonts: FontRef[]
  meta: { url: string; renderedAt: string; durationMs: number }
}
