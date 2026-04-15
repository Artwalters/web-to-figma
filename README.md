# Web → Figma

A personal Figma plugin that imports any live website as an editable auto-layout Figma design. Paste a URL, hit Import, get a pixel-perfect layer tree to work with.

Built for Pendra.studio. Self-hosted on Hostinger VPS. No SaaS dependencies.

## How it works

```
Figma plugin  ──▶  api.onemanarmy.world  ──▶  Headless Chrome
     ▲                      │
     └──── JSON + assets ───┘
```

The backend renders the URL in a real headless Chromium, walks the DOM, reads computed styles, and returns a Figma-compatible JSON tree plus embedded image bytes. The plugin builds the Figma nodes and embeds assets directly into the Figma file via `figma.createImage()` — no external CDN, no broken links.

## Project structure

```
web-to-figma/
├── backend/                 Node + Playwright API service
├── plugin/                  Figma plugin (TypeScript + modern dark UI)
├── engine/html-to-figma/    Forked DOM-to-Figma engine (git submodule)
└── docs/superpowers/specs/  Design spec
```

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Node 20, Express, Playwright, TypeScript, Docker |
| Plugin | TypeScript, vanilla DOM (no framework), Webpack |
| Engine | Forked `sergcen/html-to-figma` (MIT) |
| Infra | Hostinger VPS KVM 2, Ubuntu 24, Nginx, Let's Encrypt |
| Domain | `api.onemanarmy.world` |
| Deploy | GitHub Actions → GHCR → VPS pull |

## API keys / environment variables

All secrets live in `.env` files — never commit them.

### backend/.env

```bash
# Required
BACKEND_API_KEY=<generate with: openssl rand -hex 32>
PORT=3000
NODE_ENV=production

# Optional
RENDER_TIMEOUT_MS=30000
BROWSER_RESTART_EVERY=50
```

### plugin/.env (build-time)

```bash
BACKEND_URL=https://api.onemanarmy.world
BACKEND_API_KEY=<same value as backend>
```

### Local dev tools

```bash
HOSTINGER_API_TOKEN=<via MCP, already configured>
FIGMA_ACCESS_TOKEN=<optional — only if using figma-api CLI>
```

See `docs/superpowers/specs/2026-04-15-web-to-figma-design.md` for the full list and where each key is used.

## Quick reference — getting started (after implementation)

```bash
# 1. Clone repo
git clone https://github.com/arthur/web-to-figma && cd web-to-figma

# 2. Init submodule (the forked engine)
git submodule update --init --recursive

# 3. Backend local dev
cd backend && cp .env.example .env && npm install && npm run dev

# 4. Plugin dev
cd ../plugin && cp .env.example .env && npm install && npm run watch
# Then: Figma desktop → Plugins → Development → Import plugin from manifest
# Point at: plugin/manifest.json
```

## Deployment

See `docs/superpowers/specs/2026-04-15-web-to-figma-design.md` — section "Infrastructure — Hostinger VPS". One-time VPS setup, then push-to-deploy via GitHub Actions.

## What it does / doesn't do

**Does:**
- Imports any public website as editable Figma frames with auto-layout
- Embeds all images directly into the Figma file (no CDN needed)
- Detects fonts, warns about missing ones
- Preserves computed colors, spacing, typography
- Handles most e-commerce, marketing, portfolio sites

**Doesn't (v1):**
- Login-walled pages
- WebGL, Canvas, heavy interactive sites
- CSS grid → proper auto-layout grid (falls back to absolute positioning)
- Native SVG vectors (rasterizes SVGs for v1)
- Multi-page crawl
- Public plugin store distribution

## License

Private. Not open-source. For Pendra.studio internal use.
