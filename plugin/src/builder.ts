import { weightToStyle } from './fonts'
import type { FigmaNodeJson, RenderAsset } from './types'

const decodeBase64 = (str: string): Uint8Array => {
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export const buildTree = async (
  jsonRoot: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<FrameNode> => {
  const rootFrame = figma.createFrame()
  rootFrame.name = typeof jsonRoot.name === 'string' ? jsonRoot.name : 'Imported Site'
  const rootWidth = typeof jsonRoot.width === 'number' ? jsonRoot.width : 1440
  const rootHeight = typeof jsonRoot.height === 'number' ? jsonRoot.height : 900
  rootFrame.resize(Math.max(rootWidth, 1), Math.max(rootHeight, 1))
  applyFills(rootFrame, jsonRoot, assets)

  if (Array.isArray(jsonRoot.children)) {
    for (const child of jsonRoot.children) {
      const node = await buildNode(child, assets)
      if (node) rootFrame.appendChild(node)
    }
  }
  return rootFrame
}

const buildNode = async (
  n: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<SceneNode | null> => {
  const type = n.type

  if (type === 'TEXT' && typeof n.characters === 'string') {
    return await buildTextNode(n)
  }

  if (type === 'SVG' || type === 'VECTOR') {
    return buildRect(n, assets)
  }

  return await buildFrame(n, assets)
}

const buildFrame = async (
  n: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<FrameNode> => {
  const f = figma.createFrame()
  f.name = typeof n.name === 'string' ? n.name : (n.type ?? 'Frame')
  applyPositionAndSize(f, n)
  applyFills(f, n, assets)
  applyStrokes(f, n)
  applyCornerRadius(f, n)
  applyAutoLayout(f, n)
  f.clipsContent = false

  if (Array.isArray(n.children)) {
    for (const child of n.children) {
      const c = await buildNode(child, assets)
      if (c) f.appendChild(c)
    }
  }
  return f
}

const buildRect = (n: FigmaNodeJson, assets: Record<string, RenderAsset>): RectangleNode => {
  const r = figma.createRectangle()
  r.name = typeof n.name === 'string' ? n.name : (n.type ?? 'Rect')
  applyPositionAndSize(r, n)
  applyFills(r, n, assets)
  applyStrokes(r, n)
  applyCornerRadius(r, n)
  return r
}

const buildTextNode = async (n: FigmaNodeJson): Promise<TextNode> => {
  const family = typeof n.fontFamily === 'string' ? n.fontFamily : 'Inter'
  const weight = typeof n.fontWeight === 'number' ? n.fontWeight : 400
  const style = weightToStyle(weight)
  const fontName = { family, style }
  const t = figma.createText()
  t.name = typeof n.name === 'string' ? n.name : 'Text'

  try {
    await figma.loadFontAsync(fontName)
    t.fontName = fontName
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    t.fontName = { family: 'Inter', style: 'Regular' }
    t.name = `[font: ${family} ${weight}] ` + t.name
  }

  if (typeof n.fontSize === 'number' && n.fontSize > 0) t.fontSize = n.fontSize
  t.characters = n.characters ?? ''
  applyPositionAndSize(t, n)
  applyFills(t, n, {})
  return t
}

const applyPositionAndSize = (node: SceneNode, n: FigmaNodeJson) => {
  if (typeof n.x === 'number') node.x = n.x
  if (typeof n.y === 'number') node.y = n.y
  const w = typeof n.width === 'number' ? n.width : 0
  const h = typeof n.height === 'number' ? n.height : 0
  if (w > 0 && h > 0 && 'resize' in node) {
    (node as FrameNode | RectangleNode | TextNode).resize(Math.max(w, 1), Math.max(h, 1))
  }
}

const applyFills = (
  node: FrameNode | RectangleNode | TextNode,
  n: FigmaNodeJson,
  assets: Record<string, RenderAsset>
) => {
  if (!Array.isArray(n.fills)) return
  const out: Paint[] = []
  for (const fill of n.fills) {
    if (!fill || typeof fill !== 'object') continue
    if (fill.type === 'SOLID' && fill.color) {
      out.push({
        type: 'SOLID',
        color: { r: fill.color.r, g: fill.color.g, b: fill.color.b },
        opacity: typeof fill.opacity === 'number' ? fill.opacity : 1,
      })
    } else if (fill.type === 'IMAGE' && typeof fill.assetHash === 'string' && assets[fill.assetHash]) {
      try {
        const bytes = decodeBase64(assets[fill.assetHash].data)
        const image = figma.createImage(bytes)
        out.push({ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash })
      } catch (e) {
        console.warn('Failed to embed image', e)
      }
    }
  }
  if (out.length > 0) node.fills = out
}

const applyStrokes = (node: FrameNode | RectangleNode | TextNode, n: FigmaNodeJson) => {
  if (!Array.isArray(n.strokes)) return
  const out: Paint[] = []
  for (const s of n.strokes) {
    if (!s || s.type !== 'SOLID' || !s.color) continue
    out.push({
      type: 'SOLID',
      color: { r: s.color.r, g: s.color.g, b: s.color.b },
      opacity: typeof s.opacity === 'number' ? s.opacity : 1,
    })
  }
  if (out.length > 0) {
    node.strokes = out
    if (typeof n.strokeWeight === 'number' && n.strokeWeight > 0) {
      node.strokeWeight = n.strokeWeight
    }
  }
}

const applyCornerRadius = (node: FrameNode | RectangleNode, n: FigmaNodeJson) => {
  if (typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
    node.cornerRadius = n.cornerRadius
  }
}

const applyAutoLayout = (f: FrameNode, n: FigmaNodeJson) => {
  const mode = n.layoutMode
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
    f.layoutMode = mode
    if (typeof n.itemSpacing === 'number') f.itemSpacing = n.itemSpacing
    if (typeof n.paddingTop === 'number') f.paddingTop = n.paddingTop
    if (typeof n.paddingRight === 'number') f.paddingRight = n.paddingRight
    if (typeof n.paddingBottom === 'number') f.paddingBottom = n.paddingBottom
    if (typeof n.paddingLeft === 'number') f.paddingLeft = n.paddingLeft
  }
}
