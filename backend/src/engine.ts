import * as esbuild from 'esbuild'
import path from 'node:path'

const ENGINE_ENTRY = process.env.ENGINE_ENTRY_PATH
  ?? path.resolve(__dirname, '../../engine/html-to-figma/build/browser/index.js')

let cached: string | null = null

export const getEngineSource = async (): Promise<string> => {
  if (cached) return cached
  const result = await esbuild.build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'htmlToFigmaLib',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  })
  cached = result.outputFiles[0].text
  return cached
}
