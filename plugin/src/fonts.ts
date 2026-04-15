import type { FontRef } from './types'

export const weightToStyle = (w: number): string => {
  if (w <= 100) return 'Thin'
  if (w <= 200) return 'ExtraLight'
  if (w <= 300) return 'Light'
  if (w <= 400) return 'Regular'
  if (w <= 500) return 'Medium'
  if (w <= 600) return 'SemiBold'
  if (w <= 700) return 'Bold'
  if (w <= 800) return 'ExtraBold'
  return 'Black'
}

const GENERIC_MAP: Record<string, string> = {
  'sans-serif': 'Inter',
  'sans': 'Inter',
  'system-ui': 'Inter',
  'system': 'Inter',
  '-apple-system': 'Inter',
  'ui-sans-serif': 'Inter',
  'serif': 'Noto Serif',
  'ui-serif': 'Noto Serif',
  'monospace': 'Roboto Mono',
  'mono': 'Roboto Mono',
  'ui-monospace': 'Roboto Mono',
  'cursive': 'Inter',
  'fantasy': 'Inter',
}

export const resolveFamily = (raw: string): string => {
  const lower = raw.toLowerCase().trim()
  return GENERIC_MAP[lower] ?? raw
}

export const loadFonts = async (fonts: FontRef[]): Promise<string[]> => {
  const available = await figma.listAvailableFontsAsync()
  const availableByFamily = new Map<string, Set<string>>()
  for (const f of available) {
    if (!availableByFamily.has(f.fontName.family)) {
      availableByFamily.set(f.fontName.family, new Set())
    }
    availableByFamily.get(f.fontName.family)!.add(f.fontName.style)
  }

  const missing = new Set<string>()
  for (const font of fonts) {
    const resolved = resolveFamily(font.family)
    const styles = availableByFamily.get(resolved)
    if (!styles) {
      if (resolved === font.family) missing.add(font.family)
      continue
    }
    for (const w of font.weights) {
      const style = weightToStyle(w)
      if (styles.has(style)) {
        try {
          await figma.loadFontAsync({ family: resolved, style })
        } catch {
          missing.add(font.family)
        }
      } else {
        const fallbackStyle = styles.has('Regular') ? 'Regular' : Array.from(styles)[0]
        try {
          await figma.loadFontAsync({ family: resolved, style: fallbackStyle })
        } catch {
          missing.add(font.family)
        }
      }
    }
  }

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

  return Array.from(missing)
}
