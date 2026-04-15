# Web-to-Figma — Design Spec

**Date:** 2026-04-15
**Author:** Arthur Walters (Pendra.studio)
**Status:** Draft — pending review

## Goal

Build a personal Figma plugin that imports any live website as an auto-layout Figma design. User types a URL in the plugin, clicks Import, gets a pixel-perfect editable Figma layer tree with working frames, text, images, colors, and typography.

Scope: simple-to-medium websites (e-commerce, marketing, portfolios). WebGL, heavy canvas, or interactive-only sites are out of scope.

## Why self-built

`html.to.design` and HTML2Design exist commercially but:
- Closed source, no control over output structure
- Subscription pricing for a tool used occasionally
- Can't tweak output conventions to match Pendra's workflow

Self-hosted gives us: control, no recurring SaaS fees, reusable infrastructure for other automations.

## Architecture

```
┌────────────┐   HTTPS   ┌──────────────────────────┐
│  Figma     │──────────▶│ api.onemanarmy.world     │
│  Plugin    │           │                          │
│            │◀──────────│  Node + Express          │
│  (in app)  │   JSON    │  + Playwright (Chromium) │
└────────────┘           │  + html-to-figma engine  │
      │                  └──────────────────────────┘
      │ figma.createImage(bytes)
      │ for each asset in response
      ▼
   Figma file
   (assets embedded)
```

**Data flow:**
1. Plugin UI: user enters URL + viewport → POST `/render` with API key header
2. Backend: Playwright opens URL headless, waits for `networkidle`
3. Backend: injects forked `html-to-figma` engine via `page.addScriptTag`
4. Backend: runs `page.evaluate(() => window.htmlToFigma(document.body))` — returns Figma-compatible JSON tree
5. Backend: fetches referenced images via Playwright (respecting cookies/auth), returns them inline as base64 in the JSON response
6. Backend: returns the JSON tree + images + font list in one response
7. Plugin: walks JSON, creates frames with `layoutMode`, sets text, embeds images via `figma.createImage(bytes)`, warns about missing fonts

## Monorepo structure

```
web-to-figma/
├── README.md
├── .gitignore
├── docs/
│   └── superpowers/specs/2026-04-15-web-to-figma-design.md   (this file)
├── backend/
│   ├── src/
│   │   ├── index.ts          # Express app, /render endpoint
│   │   ├── renderer.ts       # Playwright orchestration
│   │   ├── assets.ts         # image fetching + base64 encoding
│   │   └── auth.ts           # API key middleware
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile            # Playwright-ready image
│   └── .env.example
├── plugin/
│   ├── manifest.json
│   ├── src/
│   │   ├── code.ts           # main thread (Figma API access)
│   │   ├── builder.ts        # JSON tree → Figma nodes
│   │   ├── fonts.ts          # font detection + loading
│   │   └── ui/
│   │       ├── index.html    # plugin UI shell
│   │       ├── main.ts       # UI logic
│   │       └── styles.css    # modern dark UI
│   ├── package.json
│   ├── tsconfig.json
│   └── webpack.config.js     # bundle plugin + UI
└── engine/
    └── html-to-figma/        # git submodule: fork of sergcen/html-to-figma
```

## Backend

### Tech stack
- Node 20 LTS
- Express (minimal, 1 route)
- Playwright (Chromium)
- TypeScript
- Docker for deploy

### API

**`POST /render`**

Headers:
```
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Body:
```json
{
  "url": "https://example.com",
  "viewport": { "width": 1440, "height": 900 },
  "waitFor": "networkidle"
}
```

Response (200):
```json
{
  "tree": { /* Figma-compatible JSON tree */ },
  "assets": {
    "hash123": { "mime": "image/png", "data": "base64..." },
    "hash456": { "mime": "image/jpeg", "data": "base64..." }
  },
  "fonts": [
    { "family": "Inter", "weights": [400, 500, 700] },
    { "family": "Playfair Display", "weights": [400] }
  ],
  "meta": {
    "url": "https://example.com",
    "renderedAt": "2026-04-15T12:34:56Z",
    "durationMs": 4213
  }
}
```

Errors:
- `400` invalid URL or missing fields
- `401` missing/wrong API key
- `408` render timeout (>30s)
- `502` target site unreachable
- `500` unexpected

### Render pipeline
1. Validate URL (must be http/https)
2. Launch or reuse Chromium instance (keep warm across requests)
3. Create new context with viewport + desktop user-agent
4. `goto(url)` with 30s timeout
5. `waitForLoadState('networkidle')`
6. Inject html-to-figma bundle via `addScriptTag`
7. `page.evaluate()` to serialize DOM tree + collect image URLs + font families
8. Fetch all images via `context.request.get()` (uses same cookies as page)
9. Hash each image (sha1), dedupe
10. Encode to base64, build response
11. Close context (keep browser)

### Browser lifecycle
- Single long-lived Chromium process, new context per request
- Restart browser every 50 requests or on crash
- Keeps memory stable, avoids cold start (~3s saved per request)

### Playwright in Node — integration with html-to-figma
The forked engine is a browser-side library (expects `window`, `document`, `getComputedStyle`). We inject it into the Playwright page via:

```ts
await page.addScriptTag({ path: require.resolve('html-to-figma/dist/bundle.js') })
const tree = await page.evaluate(() => (window as any).htmlToFigma(document.body))
```

Within `page.evaluate()` the engine has full access to the real rendered DOM. No Node/browser incompatibility.

### Why fork sergcen/html-to-figma
- Builder.io's original is archived — we pin our own version to avoid dead dependency
- sergcen's fork is actively maintained and TypeScript-first
- Gives us freedom to add: better grid handling, SVG reconstruction, Pendra-specific node conventions

## Figma plugin

### Tech stack
- TypeScript
- No framework — vanilla DOM for UI (Figma plugin UIs are small, framework is overkill)
- Webpack to bundle `code.ts` + UI HTML/JS into single `ui.html`
- CSS Modules-style via scoped CSS in UI iframe

### Plugin UI — modern, dark, functional

Layout:
- 320×480px panel (Figma plugin standard)
- Dark theme (matches Figma dark mode — what Arthur uses)
- Single column, generous spacing

Components:
- **Header** — small logo/title "Web → Figma"
- **URL input** — large, primary focus, with protocol auto-prepend on blur
- **Viewport selector** — segmented control: Desktop (1440) · Tablet (834) · Mobile (390)
- **Advanced** (collapsed by default) — wait strategy, custom viewport, wait selector
- **Import button** — primary CTA, full-width, shows progress state
- **Status area** — renders success/error, font warnings, render time

Visual language:
- Base: `#1e1e1e` background, `#2c2c2c` surfaces, `#ffffff` primary text
- Accent: single accent color (`#0d99ff` — matches Figma's own blue)
- Typography: Inter (Figma's default, always available in plugin iframe)
- Subtle animations: 150ms ease on button/input focus, progress pulse during render
- Micro-interactions: URL validation indicator (green dot / red dot), loading spinner, success checkmark

Empty/loading/error states:
- Empty: placeholder URL greyed in input, button disabled
- Loading: button shows spinner + "Rendering… (12s)", disables form
- Success: green toast "Imported — 42 frames, 8 images. 2 fonts missing: Poppins, DM Serif."
- Error: red toast with retry button

### Plugin behavior

`code.ts`:
1. Receives message from UI with URL/viewport
2. Calls backend `/render`, streams progress messages back to UI
3. On response: walks tree, creates nodes in current page
4. For each image ref, calls `figma.createImage(bytes)`, sets as fill
5. For fonts: `figma.loadFontAsync()` — if unavailable, uses Inter as fallback and marks node with comment
6. Positions the root frame at viewport center, selects it, zooms to fit

`builder.ts` — tree walker:
- Recursive function `buildNode(jsonNode, parent)`
- Creates Frame / Text / Rectangle / Vector per node type
- Sets auto-layout: `layoutMode`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `itemSpacing`, `paddingLeft/Top/Right/Bottom`
- Sets visual: fills, strokes, corner radius, effects (shadow)
- Handles `position: absolute` children by nesting in a plain (non-auto-layout) frame

## Font handling

1. Backend returns list of `{ family, weights }` used in the rendered page
2. Plugin iterates, calls `figma.listAvailableFontsAsync()` to check availability
3. Missing fonts: node uses fallback (Inter), original family name stored in node name as `[font: Poppins 700]`
4. UI shows summary: "2 fonts missing — install from Google Fonts: Poppins, DM Serif"

Google Fonts ARE auto-available in Figma (when the user has Figma's font agent or web fonts sync). For most cases, Google fonts just work.

## Error cases + handling

| Scenario | Handling |
|---|---|
| Site blocks bots (Cloudflare challenge) | Retry with stealth plugin; if still blocked, return 502 with message |
| Site requires login | Out of scope for v1 (future: support cookie paste) |
| Site >30s to load | Abort, return 408, suggest increasing wait |
| Very large DOM (>10000 nodes) | Render anyway but warn; Figma handles large trees fine |
| Images behind CDN with hotlink protection | Fetch via Playwright's context (uses real browser headers) |
| Fonts not available in Figma | Fallback + warning (not a failure) |
| CSS grid layout | Flatten to absolute-positioned frame in v1; proper grid→auto-layout later |

## API keys required

Stored as environment variables. Never committed to git.

| Key | Where used | How to get |
|---|---|---|
| `BACKEND_API_KEY` | Backend env + plugin UI env | Self-generated — `openssl rand -hex 32` |
| `FIGMA_ACCESS_TOKEN` | Local dev only (optional) | figma.com/settings → Personal access tokens — used by plugin dev CLI if we use one |
| `HOSTINGER_API_TOKEN` | Local dev — VPS management | hpanel.hostinger.com → API → already set up via MCP |

No third-party API keys needed (no OpenAI, no CDN, no font service).

## Infrastructure — Hostinger VPS

### Provisioning (one-time, via Hostinger MCP)
1. Purchase KVM 2 VPS (2 vCPU, 8GB RAM, 100GB SSD, ~€7/mo) in Amsterdam datacenter
2. Ubuntu 24.04 template
3. SSH key: create and attach via MCP
4. Set hostname: `api.onemanarmy.world`

### DNS (via Hostinger MCP)
- A-record: `api.onemanarmy.world` → VPS IPv4
- AAAA-record: `api.onemanarmy.world` → VPS IPv6
- Wildcard later when we add more services: `*.onemanarmy.world` → VPS IP

### VPS software setup
```bash
# 1. System
apt update && apt upgrade -y
apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx ufw

# 2. Firewall
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable

# 3. SSL
certbot --nginx -d api.onemanarmy.world

# 4. Docker
systemctl enable --now docker

# 5. App
mkdir -p /opt/web-to-figma && cd /opt/web-to-figma
# git clone repo, docker-compose up -d
```

### Nginx config
- Single reverse proxy `api.onemanarmy.world` → `127.0.0.1:3000`
- Rate limit: 10 req/min per IP (safety)
- Gzip enabled
- Max body size: 1MB (requests are small)

### Deploy flow
- Push to `main` branch on GitHub
- GitHub Actions builds Docker image, pushes to GHCR
- GitHub Actions SSHes into VPS, runs `docker pull ghcr.io/arthur/web-to-figma:latest && docker-compose up -d`
- VPS SSH key stored in GitHub Actions secrets
- Rollback: re-run previous green workflow, or manually `docker tag <prev-sha> latest` on VPS

### Reusability for future tools
- Single Nginx config per subdomain (copy/paste)
- Each tool = own Docker container on unique port
- `/opt/<tool-name>/` convention
- One SSL cert per subdomain via certbot

## Testing

- **Engine**: test with snapshot-style fixtures — feed sample HTML, compare JSON output to golden file
- **Backend**: integration test — spin up backend in Docker, hit `/render` against `example.com`, assert tree non-empty + valid schema
- **Plugin**: manual — no reliable headless testing for Figma plugins. Test in Figma desktop app.

## Out of scope (v1)

- Authenticated pages (login walls, paywalled content)
- CSS grid → proper auto-layout grid (flatten to absolute for now)
- SVG reconstruction as native Figma vectors (rasterize for v1)
- Interactive states (hover, focus) — static render only
- Video/audio embeds
- Multi-page crawl (one URL = one render)
- Public plugin publishing (Figma community store)

## Success criteria

1. Plugin imports `shopify.com/products/example` into Figma, 90%+ of the layout visible and usable
2. Import completes in <15s for typical e-commerce page
3. All text is editable, all frames have correct auto-layout, all images embedded
4. Font warnings displayed for missing families
5. VPS stays under €10/month incl. domain/SSL renewals
6. One-click re-import works: same URL produces same tree (idempotent)

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Playwright memory leaks on VPS | Medium | Restart browser every 50 requests; monitor with `pm2` or Docker health checks |
| html-to-figma fork falls behind Figma API changes | Low | Pin Figma plugin API version; changes are rare |
| Rate-limiting / IP ban from heavy scraping | Low | Personal use only, low volume |
| Cloudflare bot blocking | Medium | Add `playwright-extra` + stealth plugin in v1.1 if it happens |

## Non-goals (explicit)

- This is NOT a public SaaS. No signup, no team features, no billing.
- This is NOT a replacement for hand-designing. It imports as a starting point.
- This is NOT a CMS integration. One-way import only.
