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
    const styles = availableByFamily.get(font.family)
    if (!styles) {
      missing.add(font.family)
      continue
    }
    for (const w of font.weights) {
      const style = weightToStyle(w)
      if (styles.has(style)) {
        try {
          await figma.loadFontAsync({ family: font.family, style })
        } catch {
          missing.add(font.family)
        }
      } else {
        missing.add(font.family)
      }
    }
  }

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

  return Array.from(missing)
}
