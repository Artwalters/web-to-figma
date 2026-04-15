# Web → Figma

A personal Figma plugin that imports any live website as an editable auto-layout Figma design. Paste a URL, hit Import, get a pixel-perfect layer tree to work with.

Built for Pendra.studio. Self-hosted on Hostinger VPS. No SaaS dependencies.

**Status:** Backend live at `https://api.onemanarmy.world`. Plugin built and ready to import into Figma desktop.

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
├── backend/                      Node + Playwright API service
├── plugin/                       Figma plugin (TypeScript + modern dark UI)
├── engine/html-to-figma/         Forked DOM-to-Figma engine (git submodule)
├── .github/workflows/deploy.yml  Auto-deploy on push to main
├── docker-compose.yml            Backend container definition
└── docs/superpowers/
    ├── specs/   Design spec
    └── plans/   Implementation plan
```

## Usage — first-time setup in Figma

1. Make sure the plugin is built:
   ```bash
   cd plugin
   npm install
   npm run build
   ```
2. Open **Figma desktop app**
3. Menu: `Plugins` → `Development` → `Import plugin from manifest...`
4. Select: `plugin/manifest.json`
5. Run the plugin: `Plugins` → `Development` → `Web → Figma`
6. Paste a URL (e.g. `https://example.com`), pick viewport (Desktop/Tablet/Mobile), click **Import**

The imported site appears as editable frames in the current Figma page.

## Local development

### Backend (local, outside Docker)

```bash
cd backend
cp .env.example .env
# edit .env: set BACKEND_API_KEY to a real value (openssl rand -hex 32)
npm install
npx playwright install chromium
npm run dev   # listens on :3000
```

### Plugin (watch mode)

```bash
cd plugin
cp .env.example .env
# edit .env: set BACKEND_URL=http://localhost:3000 (for local) and BACKEND_API_KEY=<same as backend>
npm install
npm run watch  # rebuilds dist/ on every change
```

After changes: in Figma, right-click the plugin → "Reload" (no need to re-import).

### Tests

```bash
cd backend && npm test   # 9 tests (auth, renderer, assets)
```

## Deployment

Backend runs in Docker on Hostinger VPS KVM 2 at `api.onemanarmy.world`. Nginx reverse-proxies `https://api.onemanarmy.world` → `127.0.0.1:3000`. Let's Encrypt cert auto-renews.

### Manual deploy (from local)

```bash
ssh deploy@api.onemanarmy.world
cd /opt/web-to-figma
git pull origin main
git submodule update --init --recursive
docker compose build
docker compose up -d
curl http://localhost:3000/health   # expect {"ok":true}
```

### Auto-deploy via GitHub Actions

Pushes to `main` that touch `backend/`, `docker-compose.yml`, or the workflow itself trigger `.github/workflows/deploy.yml`. It SSHes into the VPS and runs the manual deploy steps above.

**Required GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | `api.onemanarmy.world` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Contents of `~/.ssh/onemanarmy` (the **private** key — `cat ~/.ssh/onemanarmy` on your machine) |

Until these are set, the workflow will fail but that's harmless — manual deploy still works.

## Environment variables / secrets

| File | Var | Purpose |
|---|---|---|
| `backend/.env` (VPS: `/opt/web-to-figma/.env`) | `BACKEND_API_KEY` | API key required on every `/render` request |
| `backend/.env` | `PORT` | Default 3000 |
| `backend/.env` | `RENDER_TIMEOUT_MS` | Default 30000 |
| `backend/.env` | `BROWSER_RESTART_EVERY` | Restart Chromium every N requests (default 50) |
| `plugin/.env` | `BACKEND_URL` | `https://api.onemanarmy.world` in prod, `http://localhost:3000` in dev |
| `plugin/.env` | `BACKEND_API_KEY` | Same as backend's |

Your current production `BACKEND_API_KEY` is stored locally at `.env.local` in the repo root (gitignored) and on the VPS at `/opt/web-to-figma/.env`.

## What it does / doesn't do

**Does:**
- Imports any public website as editable Figma frames
- Embeds all images directly into the Figma file (no CDN needed)
- Detects fonts, warns about missing ones, falls back to Inter
- Preserves computed colors, spacing, typography, borders, corners
- Maps CSS flex to Figma auto-layout
- Handles most e-commerce, marketing, portfolio sites

**Doesn't (v1):**
- Login-walled pages
- WebGL, Canvas, heavy interactive sites
- CSS grid → proper auto-layout grid (falls back to absolute positioning)
- Native SVG vectors (SVGs become rectangles in v1)
- Multi-page crawl
- Public Figma community store distribution

## License

Private. Not open-source. For Pendra.studio internal use.
