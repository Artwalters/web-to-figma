import { weightToStyle } from './fonts'
import type { FigmaNodeJson, RenderAsset } from './types'

const decodeBase64 = (str: string): Uint8Array => {
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const cleanFontFamily = (raw: string): string => {
  const first = raw.split(',')[0].trim().replace(/['"]/g, '')
  return first || 'Inter'
}

const toUnit = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'value' in v && typeof (v as { value: unknown }).value === 'number') {
    return (v as { value: number }).value
  }
  return 0
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
  rootFrame.clipsContent = false
  applyFills(rootFrame, jsonRoot, assets)
  applyStrokes(rootFrame, jsonRoot)
  applyCornerRadii(rootFrame, jsonRoot)
  applyEffects(rootFrame, jsonRoot)
  applyOpacity(rootFrame, jsonRoot)

  if (Array.isArray(jsonRoot.children)) {
    for (const child of jsonRoot.children) {
      const node = await buildNode(child, assets)
      if (node) rootFrame.appendChild(node)
    }
  }
  await appendPseudos(rootFrame, jsonRoot, assets)
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

  if (type === 'SVG') {
    return buildSvgNode(n)
  }

  return await buildFrame(n, assets)
}

const buildFrame = async (
  n: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<FrameNode> => {
  const f = figma.createFrame()
  f.name = typeof n.name === 'string' ? n.name : (typeof n.type === 'string' ? n.type : 'Frame')
  applyPositionAndSize(f, n)
  applyFills(f, n, assets)
  applyStrokes(f, n)
  applyCornerRadii(f, n)
  applyEffects(f, n)
  applyOpacity(f, n)
  f.clipsContent = n.clipsContent === true

  if (Array.isArray(n.children)) {
    for (const child of n.children) {
      const c = await buildNode(child, assets)
      if (c) f.appendChild(c)
    }
  }
  await appendPseudos(f, n, assets)
  return f
}

const buildSvgNode = (n: FigmaNodeJson): SceneNode | null => {
  const svgStr = typeof n.svg === 'string' ? n.svg : null
  if (!svgStr) {
    const r = figma.createRectangle()
    r.name = 'SVG (missing)'
    applyPositionAndSize(r, n)
    return r
  }
  try {
    const node = figma.createNodeFromSvg(svgStr)
    node.name = typeof n.name === 'string' ? n.name : 'SVG'
    if (typeof n.x === 'number') node.x = n.x
    if (typeof n.y === 'number') node.y = n.y
    const w = typeof n.width === 'number' ? n.width : 0
    const h = typeof n.height === 'number' ? n.height : 0
    if (w > 0 && h > 0 && 'resize' in node) {
      (node as FrameNode | GroupNode).resize(Math.max(w, 1), Math.max(h, 1))
    }
    return node
  } catch (e) {
    console.warn('SVG import failed, fallback to rect', e)
    const r = figma.createRectangle()
    r.name = 'SVG (parse failed)'
    applyPositionAndSize(r, n)
    return r
  }
}

const buildTextNode = async (n: FigmaNodeJson): Promise<TextNode> => {
  const rawFamily = typeof n.fontFamily === 'string' ? n.fontFamily : 'Inter'
  const family = cleanFontFamily(rawFamily)
  const weight = typeof n.fontWeight === 'number' ? n.fontWeight : 400
  const style = weightToStyle(weight)
  const fontName = { family, style }
  const t = figma.createText()
  t.name = typeof n.name === 'string' ? n.name : 'Text'

  try {
    await figma.loadFontAsync(fontName)
    t.fontName = fontName
  } catch {
    try {
      await figma.loadFontAsync({ family, style: 'Regular' })
      t.fontName = { family, style: 'Regular' }
    } catch {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
      t.fontName = { family: 'Inter', style: 'Regular' }
      t.name = `[font: ${family} ${weight}] ` + t.name
    }
  }

  if (typeof n.fontSize === 'number' && n.fontSize > 0) t.fontSize = n.fontSize
  t.characters = typeof n.characters === 'string' ? n.characters : ''

  const letterSpacing = toUnit(n.letterSpacing)
  if (letterSpacing) {
    t.letterSpacing = { value: letterSpacing, unit: 'PIXELS' }
  }
  const lineHeight = toUnit(n.lineHeight)
  if (lineHeight) {
    t.lineHeight = { value: lineHeight, unit: 'PIXELS' }
  }
  const textCase = n.textCase
  if (textCase === 'UPPER' || textCase === 'LOWER' || textCase === 'TITLE' || textCase === 'ORIGINAL') {
    t.textCase = textCase
  }
  const textDecoration = n.textDecoration
  if (textDecoration === 'UNDERLINE' || textDecoration === 'STRIKETHROUGH') {
    t.textDecoration = textDecoration
  }
  const align = n.textAlignHorizontal
  if (align === 'LEFT' || align === 'CENTER' || align === 'RIGHT' || align === 'JUSTIFIED') {
    t.textAlignHorizontal = align
  }

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
    const f = fill as {
      type?: string
      color?: { r: number; g: number; b: number; a?: number }
      opacity?: number
      assetHash?: string
      scaleMode?: 'FILL' | 'FIT' | 'TILE' | 'CROP'
    }
    if (f.type === 'SOLID' && f.color) {
      const alpha = typeof f.color.a === 'number' ? f.color.a : (typeof f.opacity === 'number' ? f.opacity : 1)
      out.push({
        type: 'SOLID',
        color: { r: f.color.r, g: f.color.g, b: f.color.b },
        opacity: alpha,
      })
    } else if (f.type === 'IMAGE' && typeof f.assetHash === 'string' && assets[f.assetHash]) {
      try {
        const bytes = decodeBase64(assets[f.assetHash].data)
        const image = figma.createImage(bytes)
        const scaleMode = f.scaleMode === 'FIT' ? 'FIT' : 'FILL'
        out.push({ type: 'IMAGE', scaleMode, imageHash: image.hash })
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
    if (!s || typeof s !== 'object') continue
    const stroke = s as { type?: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number }
    if (stroke.type !== 'SOLID' || !stroke.color) continue
    const alpha = typeof stroke.color.a === 'number' ? stroke.color.a : (typeof stroke.opacity === 'number' ? stroke.opacity : 1)
    out.push({
      type: 'SOLID',
      color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b },
      opacity: alpha,
    })
  }
  if (out.length > 0) {
    node.strokes = out
    if (typeof n.strokeWeight === 'number' && n.strokeWeight > 0) {
      node.strokeWeight = n.strokeWeight
    }
  }
}

const applyCornerRadii = (node: FrameNode | RectangleNode, n: FigmaNodeJson) => {
  const tl = typeof n.topLeftRadius === 'number' ? n.topLeftRadius : undefined
  const tr = typeof n.topRightRadius === 'number' ? n.topRightRadius : undefined
  const bl = typeof n.bottomLeftRadius === 'number' ? n.bottomLeftRadius : undefined
  const br = typeof n.bottomRightRadius === 'number' ? n.bottomRightRadius : undefined
  if (tl !== undefined) node.topLeftRadius = tl
  if (tr !== undefined) node.topRightRadius = tr
  if (bl !== undefined) node.bottomLeftRadius = bl
  if (br !== undefined) node.bottomRightRadius = br
  if (tl === undefined && tr === undefined && bl === undefined && br === undefined) {
    if (typeof n.cornerRadius === 'number' && n.cornerRadius > 0) {
      node.cornerRadius = n.cornerRadius
    }
  }
}

const applyEffects = (node: FrameNode | RectangleNode, n: FigmaNodeJson) => {
  if (!Array.isArray(n.effects) || n.effects.length === 0) return
  const out: Effect[] = []
  for (const e of n.effects) {
    if (!e || typeof e !== 'object') continue
    const eff = e as {
      type?: string
      color?: { r: number; g: number; b: number; a?: number }
      radius?: number
      spread?: number
      offset?: { x: number; y: number }
      blendMode?: BlendMode
      visible?: boolean
    }
    if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
      if (!eff.color) continue
      out.push({
        type: eff.type,
        color: {
          r: eff.color.r,
          g: eff.color.g,
          b: eff.color.b,
          a: typeof eff.color.a === 'number' ? eff.color.a : 1,
        },
        offset: eff.offset ?? { x: 0, y: 0 },
        radius: typeof eff.radius === 'number' ? eff.radius : 0,
        spread: typeof eff.spread === 'number' ? eff.spread : 0,
        visible: eff.visible !== false,
        blendMode: eff.blendMode ?? 'NORMAL',
      })
    }
  }
  if (out.length > 0) node.effects = out
}

const applyOpacity = (node: FrameNode | RectangleNode, n: FigmaNodeJson) => {
  if (typeof n.opacity === 'number' && n.opacity >= 0 && n.opacity <= 1) {
    node.opacity = n.opacity
  }
}

const appendPseudos = async (
  parent: FrameNode,
  n: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<void> => {
  if (n.before && typeof n.before === 'object') {
    const b = await buildNode(n.before as FigmaNodeJson, assets)
    if (b) {
      b.name = '::before ' + b.name
      parent.appendChild(b)
    }
  }
  if (n.after && typeof n.after === 'object') {
    const a = await buildNode(n.after as FigmaNodeJson, assets)
    if (a) {
      a.name = '::after ' + a.name
      parent.appendChild(a)
    }
  }
}
