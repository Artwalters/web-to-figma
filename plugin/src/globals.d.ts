/// <reference types="@figma/plugin-typings" />

declare module '*.css'

declare const process: {
  env: {
    BACKEND_URL?: string
    BACKEND_API_KEY?: string
    [key: string]: string | undefined
  }
}
