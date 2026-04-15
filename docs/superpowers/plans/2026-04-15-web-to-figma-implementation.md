# Web-to-Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Figma plugin that imports any live website into Figma as editable auto-layout frames.

**Architecture:** Figma plugin (TS) posts URL to backend on `api.onemanarmy.world` → Node + Playwright renders the page in headless Chromium → injected `html-to-figma` engine walks the DOM → plugin receives JSON tree + base64 image assets → builds Figma nodes and embeds images via `figma.createImage()`.

**Tech Stack:** Node 20, Express, Playwright, TypeScript, Docker, Hostinger VPS (KVM 2, Ubuntu 24), Nginx, Let's Encrypt, GitHub Actions. Forked `sergcen/html-to-figma` as engine.

**Important — user convention:** Arthur's CLAUDE.md says **never commit without explicit approval**. When executing this plan, ASK before every `git commit` and `git push`. Commit messages are in English. No semicolons in TS code.

**Prerequisites before starting:**
- GitHub repo created (private): `github.com/arthur/web-to-figma`
- Fork of `sergcen/html-to-figma` in user's GitHub account
- Figma desktop app installed (needed for plugin dev)
- SSH key on local machine (for GitHub + VPS)

---

## File Structure (target end-state)

```
web-to-figma/
├── README.md                                       ✅ exists
├── .gitignore                                      ← Task 1
├── .github/workflows/deploy.yml                    ← Task 9
├── docker-compose.yml                              ← Task 8
├── docs/superpowers/
│   ├── specs/2026-04-15-web-to-figma-design.md    ✅ exists
│   └── plans/2026-04-15-web-to-figma-implementation.md  ✅ this file
├── backend/
│   ├── package.json                                ← Task 5
│   ├── tsconfig.json                               ← Task 5
│   ├── .env.example                                ← Task 5
│   ├── Dockerfile                                  ← Task 8
│   ├── src/
│   │   ├── index.ts          # Express app         ← Task 5
│   │   ├── auth.ts           # API key middleware  ← Task 5
│   │   ├── renderer.ts       # Playwright          ← Task 6
│   │   ├── assets.ts         # image inlining      ← Task 7
│   │   └── types.ts          # shared types        ← Task 6
│   └── tests/
│       ├── auth.test.ts                            ← Task 5
│       ├── renderer.test.ts                        ← Task 6
│       └── assets.test.ts                          ← Task 7
├── plugin/
│   ├── package.json                                ← Task 10
│   ├── tsconfig.json                               ← Task 10
│   ├── manifest.json                               ← Task 10
│   ├── webpack.config.js                           ← Task 10
│   ├── src/
│   │   ├── code.ts           # main thread         ← Task 12
│   │   ├── builder.ts        # tree → nodes        ← Task 13
│   │   ├── fonts.ts          # font loading        ← Task 15
│   │   ├── types.ts          # shared with backend ← Task 12
│   │   └── ui/
│   │       ├── index.html                          ← Task 11
│   │       ├── main.ts                             ← Task 12
│   │       └── styles.css                          ← Task 11
│   └── tests/
│       └── builder.test.ts                         ← Task 13
└── engine/
    └── html-to-figma/        # git submodule       ← Task 4
```

Each backend source file has one responsibility. Plugin follows the same pattern. Tests live next to source they cover.

---

## Task 1: Repo init + .gitignore

**Files:**
- Create: `.gitignore`
- Modify: (git init)

- [ ] **Step 1: Init git repo**

```bash
cd C:/Users/arthu/Desktop/Projecten/web-to-figma
git init
git branch -M main
```

- [ ] **Step 2: Write .gitignore**

```
# Dependencies
node_modules/

# Build output
dist/
build/
*.tsbuildinfo

# Env
.env
.env.local
*.env
!.env.example

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Logs
*.log
npm-debug.log*

# Playwright
test-results/
playwright-report/

# Docker
*.tar
```

- [ ] **Step 3: Create GitHub repo (private) + connect**

Run on user's machine (Arthur does this, not the agent — it requires GitHub auth):
```bash
gh repo create arthur/web-to-figma --private --source=. --remote=origin
```

- [ ] **Step 4: First commit (ASK USER FIRST)**

```bash
git add README.md .gitignore docs/
git commit -m "chore: initial project scaffold and design docs"
git push -u origin main
```

---

## Task 2: Provision Hostinger VPS + DNS

**Files:** None (infra only, performed via Hostinger MCP).

- [ ] **Step 1: List available VPS plans**

Use MCP tool `mcp__hostinger-mcp__billing_getCatalogItemListV1` to find KVM 2 plan ID.

- [ ] **Step 2: Confirm purchase with Arthur**

Show: plan, datacenter (Amsterdam), monthly cost. ASK before purchase — this spends money.

- [ ] **Step 3: Purchase VPS**

Use `mcp__hostinger-mcp__VPS_purchaseNewVirtualMachineV1` with KVM 2 in Amsterdam, Ubuntu 24 template.

- [ ] **Step 4: Create SSH key, attach to VM**

- Generate locally: `ssh-keygen -t ed25519 -f ~/.ssh/onemanarmy -C "arthur@pendra.studio"`
- Use `mcp__hostinger-mcp__VPS_createPublicKeyV1` to upload the public key
- Use `mcp__hostinger-mcp__VPS_attachPublicKeyV1` to attach to the new VM

- [ ] **Step 5: Set hostname**

Use `mcp__hostinger-mcp__VPS_setHostnameV1` → `api.onemanarmy.world`.

- [ ] **Step 6: Get VM public IP**

Use `mcp__hostinger-mcp__VPS_getVirtualMachineDetailsV1`, note the IPv4 + IPv6.

- [ ] **Step 7: Create DNS A + AAAA records**

Use `mcp__hostinger-mcp__DNS_updateDNSRecordsV1` on domain `onemanarmy.world`:
- A record: `api` → VPS IPv4
- AAAA record: `api` → VPS IPv6
- TTL: 300 (5 min — low while iterating)

- [ ] **Step 8: Verify DNS propagation**

```bash
dig api.onemanarmy.world +short
# Expected: VPS IPv4
```
If empty, wait 2-10 minutes and retry.

---

## Task 3: VPS base setup (SSH, firewall, Docker)

**Files:** None (all remote). Run via SSH.

- [ ] **Step 1: SSH into VPS**

```bash
ssh -i ~/.ssh/onemanarmy root@api.onemanarmy.world
```

- [ ] **Step 2: Update + install core packages**

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx ufw fail2ban
```

- [ ] **Step 3: Configure firewall**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable
ufw status
```
Expected output: ACTIVE with ports 22, 80, 443 open.

- [ ] **Step 4: Enable Docker**

```bash
systemctl enable --now docker
docker --version
```

- [ ] **Step 5: Create non-root deploy user**

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

- [ ] **Step 6: Verify SSH as deploy user**

From local:
```bash
ssh -i ~/.ssh/onemanarmy deploy@api.onemanarmy.world "docker ps"
```
Expected: empty container list (no error).

---

## Task 4: Fork html-to-figma engine

**Files:**
- Create: `engine/html-to-figma/` (as git submodule)

- [ ] **Step 1: Fork on GitHub**

Arthur does this manually: go to `github.com/sergcen/html-to-figma` → Fork → under `arthur/` account.

- [ ] **Step 2: Add as submodule**

```bash
cd C:/Users/arthu/Desktop/Projecten/web-to-figma
git submodule add git@github.com:arthur/html-to-figma.git engine/html-to-figma
git submodule update --init --recursive
```

- [ ] **Step 3: Build the bundle**

```bash
cd engine/html-to-figma
npm install
npm run build
ls dist/
```
Expected: `dist/bundle.js` or similar (exact filename depends on fork's build config — note it for Task 6).

- [ ] **Step 4: Commit submodule (ASK FIRST)**

```bash
cd ../..
git add .gitmodules engine
git commit -m "feat: add html-to-figma engine as submodule"
```

---

## Task 5: Backend scaffold + auth middleware

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`
- Create: `backend/src/index.ts`, `backend/src/auth.ts`
- Create: `backend/tests/auth.test.ts`

- [ ] **Step 1: Scaffold Node project**

```bash
cd backend
npm init -y
npm install express cors
npm install -D typescript @types/express @types/cors @types/node tsx vitest supertest @types/supertest
npx tsc --init
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write .env.example**

```
BACKEND_API_KEY=change_me_openssl_rand_hex_32
PORT=3000
NODE_ENV=development
RENDER_TIMEOUT_MS=30000
BROWSER_RESTART_EVERY=50
```

- [ ] **Step 4: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  }
}
```

- [ ] **Step 5: Write failing test for auth middleware**

File: `backend/tests/auth.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { requireApiKey } from '../src/auth'

describe('requireApiKey middleware', () => {
  const app = express()
  beforeAll(() => {
    process.env.BACKEND_API_KEY = 'test-key-123'
    app.get('/protected', requireApiKey, (_req, res) => res.json({ ok: true }))
  })

  it('returns 401 when no auth header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 when wrong key', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer wrong')
    expect(res.status).toBe(401)
  })

  it('returns 200 when correct key', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer test-key-123')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
```

- [ ] **Step 6: Run test — expect FAIL**

```bash
npm test
```
Expected: 3 failures (auth.ts doesn't exist yet).

- [ ] **Step 7: Write auth.ts**

File: `backend/src/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express'

export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization') ?? ''
  const match = header.match(/^Bearer (.+)$/)
  const expected = process.env.BACKEND_API_KEY

  if (!expected) {
    res.status(500).json({ error: 'server misconfigured' })
    return
  }
  if (!match || match[1] !== expected) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
}
```

- [ ] **Step 8: Write minimal index.ts**

File: `backend/src/index.ts`

```typescript
import express from 'express'
import cors from 'cors'
import { requireApiKey } from './auth'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))
app.post('/render', requireApiKey, (_req, res) => {
  res.status(501).json({ error: 'not implemented' })
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => console.log(`listening on ${port}`))
```

- [ ] **Step 9: Run tests — expect PASS**

```bash
npm test
```
Expected: 3 passed.

- [ ] **Step 10: Smoke test**

```bash
BACKEND_API_KEY=dev npm run dev
# In another terminal:
curl http://localhost:3000/health
# Expected: {"ok":true}
curl -X POST http://localhost:3000/render
# Expected: {"error":"unauthorized"}
curl -X POST http://localhost:3000/render -H "Authorization: Bearer dev"
# Expected: {"error":"not implemented"}
```

- [ ] **Step 11: Commit (ASK FIRST)**

```bash
git add backend/
git commit -m "feat(backend): scaffold express app with api key auth"
```

---

## Task 6: Backend /render endpoint with Playwright

**Files:**
- Create: `backend/src/renderer.ts`, `backend/src/types.ts`
- Create: `backend/tests/renderer.test.ts`
- Modify: `backend/src/index.ts` (wire up the endpoint)

- [ ] **Step 1: Install Playwright**

```bash
cd backend
npm install playwright
npx playwright install chromium
npx playwright install-deps  # Linux only; on Windows skip
```

- [ ] **Step 2: Write types.ts**

File: `backend/src/types.ts`

```typescript
export type Viewport = { width: number; height: number }

export type RenderRequest = {
  url: string
  viewport?: Viewport
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle'
}

export type RenderAsset = {
  mime: string
  data: string  // base64
}

export type FontRef = {
  family: string
  weights: number[]
}

export type FigmaNodeJson = {
  type: string
  name?: string
  children?: FigmaNodeJson[]
  [key: string]: unknown
}

export type RenderResponse = {
  tree: FigmaNodeJson
  assets: Record<string, RenderAsset>  // keyed by sha1 hash
  fonts: FontRef[]
  meta: { url: string; renderedAt: string; durationMs: number }
}
```

- [ ] **Step 3: Write failing renderer test**

File: `backend/tests/renderer.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Renderer } from '../src/renderer'

describe('Renderer', () => {
  let renderer: Renderer

  beforeAll(async () => {
    renderer = new Renderer()
    await renderer.start()
  }, 30000)

  afterAll(async () => {
    await renderer.stop()
  })

  it('renders a simple page into a tree', async () => {
    const result = await renderer.render({
      url: 'data:text/html,<html><body><h1>Hello</h1></body></html>',
      viewport: { width: 1440, height: 900 },
      waitFor: 'load',
    })
    expect(result.tree).toBeDefined()
    expect(result.meta.url).toContain('Hello')
    expect(result.meta.durationMs).toBeGreaterThan(0)
  }, 30000)

  it('rejects invalid URLs', async () => {
    await expect(
      renderer.render({ url: 'not-a-url', viewport: { width: 1440, height: 900 } })
    ).rejects.toThrow(/invalid url/i)
  })
})
```

- [ ] **Step 4: Run test — expect FAIL**

```bash
npm test
```
Expected: failures (Renderer class doesn't exist).

- [ ] **Step 5: Implement Renderer**

File: `backend/src/renderer.ts`

```typescript
import { chromium, Browser, BrowserContext } from 'playwright'
import path from 'node:path'
import type { RenderRequest, RenderResponse, FigmaNodeJson } from './types'

const ENGINE_BUNDLE = path.resolve(__dirname, '../../engine/html-to-figma/dist/bundle.js')

export class Renderer {
  private browser?: Browser
  private requestCount = 0
  private readonly restartEvery = Number(process.env.BROWSER_RESTART_EVERY ?? 50)

  async start() {
    this.browser = await chromium.launch({ headless: true })
  }

  async stop() {
    await this.browser?.close()
    this.browser = undefined
  }

  async render(req: RenderRequest): Promise<RenderResponse> {
    if (!/^https?:|^data:/.test(req.url)) {
      throw new Error('invalid url: must be http(s) or data:')
    }

    if (this.requestCount >= this.restartEvery) {
      await this.stop()
      await this.start()
      this.requestCount = 0
    }

    const ctx: BrowserContext = await this.browser!.newContext({
      viewport: req.viewport ?? { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 WebToFigma/1.0',
    })

    const start = Date.now()
    try {
      const page = await ctx.newPage()
      await page.goto(req.url, { timeout: 30000 })
      await page.waitForLoadState(req.waitFor ?? 'networkidle', { timeout: 30000 })

      await page.addScriptTag({ path: ENGINE_BUNDLE })

      const result = await page.evaluate(() => {
        // @ts-expect-error injected global
        const tree = window.htmlToFigma(document.body)
        const fonts = new Map<string, Set<number>>()
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el as Element)
          const family = cs.fontFamily.split(',')[0].trim().replace(/["']/g, '')
          const weight = parseInt(cs.fontWeight, 10) || 400
          if (!fonts.has(family)) fonts.set(family, new Set())
          fonts.get(family)!.add(weight)
        })
        return {
          tree,
          fonts: Array.from(fonts.entries()).map(([family, weights]) => ({
            family,
            weights: Array.from(weights),
          })),
          title: document.title,
        }
      })

      this.requestCount++

      return {
        tree: result.tree as FigmaNodeJson,
        assets: {},  // filled in by assets.ts in Task 7
        fonts: result.fonts,
        meta: {
          url: result.title || req.url,
          renderedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        },
      }
    } finally {
      await ctx.close()
    }
  }
}
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npm test
```
Expected: 2 passed. If engine bundle path is wrong, update `ENGINE_BUNDLE` constant to match actual build output from Task 4 step 3.

- [ ] **Step 7: Wire endpoint**

Modify `backend/src/index.ts` — replace the 501 stub:

```typescript
import { Renderer } from './renderer'

const renderer = new Renderer()
await renderer.start()

app.post('/render', requireApiKey, async (req, res) => {
  try {
    const result = await renderer.render(req.body)
    res.json(result)
  } catch (err) {
    const msg = (err as Error).message
    const status = /invalid url/i.test(msg) ? 400 : /timeout/i.test(msg) ? 408 : 500
    res.status(status).json({ error: msg })
  }
})

process.on('SIGTERM', async () => {
  await renderer.stop()
  process.exit(0)
})
```

Change the top of `index.ts` to support top-level await (set `"type": "module"` in package.json OR wrap in async IIFE). Simpler: wrap in IIFE.

- [ ] **Step 8: Manual smoke test**

```bash
BACKEND_API_KEY=dev npm run dev
# another terminal:
curl -X POST http://localhost:3000/render \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","viewport":{"width":1440,"height":900}}'
```
Expected: JSON with `tree`, `fonts`, `meta`. `assets` is `{}` (next task).

- [ ] **Step 9: Commit (ASK FIRST)**

```bash
git add backend/
git commit -m "feat(backend): add playwright-based /render endpoint"
```

---

## Task 7: Asset inlining (base64 images)

**Files:**
- Create: `backend/src/assets.ts`, `backend/tests/assets.test.ts`
- Modify: `backend/src/renderer.ts` (call asset fetcher + dedupe)

- [ ] **Step 1: Write failing test**

File: `backend/tests/assets.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { hashBytes, extractImageUrls } from '../src/assets'

describe('hashBytes', () => {
  it('produces stable sha1 hex for same input', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]))
    const b = hashBytes(new Uint8Array([1, 2, 3]))
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{40}$/)
  })

  it('produces different hashes for different input', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]))
    const b = hashBytes(new Uint8Array([4, 5, 6]))
    expect(a).not.toBe(b)
  })
})

describe('extractImageUrls', () => {
  it('finds url() refs in node tree', () => {
    const tree = {
      type: 'FRAME',
      fills: [{ type: 'IMAGE', url: 'https://cdn.example/a.jpg' }],
      children: [
        { type: 'RECTANGLE', fills: [{ type: 'IMAGE', url: 'https://cdn.example/b.png' }] },
      ],
    }
    const urls = extractImageUrls(tree)
    expect(urls).toEqual(['https://cdn.example/a.jpg', 'https://cdn.example/b.png'])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Implement assets.ts**

File: `backend/src/assets.ts`

```typescript
import { createHash } from 'node:crypto'
import type { BrowserContext } from 'playwright'
import type { FigmaNodeJson, RenderAsset } from './types'

export const hashBytes = (bytes: Uint8Array): string => {
  return createHash('sha1').update(bytes).digest('hex')
}

export const extractImageUrls = (node: FigmaNodeJson): string[] => {
  const urls: string[] = []
  const visit = (n: FigmaNodeJson) => {
    if (Array.isArray(n.fills)) {
      for (const fill of n.fills) {
        if (fill && typeof fill === 'object' && (fill as any).type === 'IMAGE' && (fill as any).url) {
          urls.push((fill as any).url)
        }
      }
    }
    if (Array.isArray(n.children)) n.children.forEach(visit)
  }
  visit(node)
  return urls
}

export const fetchAndEncode = async (
  ctx: BrowserContext,
  urls: string[]
): Promise<{ assets: Record<string, RenderAsset>; urlToHash: Record<string, string> }> => {
  const assets: Record<string, RenderAsset> = {}
  const urlToHash: Record<string, string> = {}
  const unique = Array.from(new Set(urls))

  await Promise.all(
    unique.map(async (url) => {
      try {
        const resp = await ctx.request.get(url, { timeout: 10000 })
        if (!resp.ok()) return
        const buf = await resp.body()
        const bytes = new Uint8Array(buf)
        const hash = hashBytes(bytes)
        const mime = resp.headers()['content-type']?.split(';')[0] ?? 'image/png'
        assets[hash] = { mime, data: Buffer.from(bytes).toString('base64') }
        urlToHash[url] = hash
      } catch {
        // skip failed images; plugin will show placeholder
      }
    })
  )

  return { assets, urlToHash }
}

export const rewriteFillsToHash = (
  node: FigmaNodeJson,
  urlToHash: Record<string, string>
): void => {
  const visit = (n: FigmaNodeJson) => {
    if (Array.isArray(n.fills)) {
      for (const fill of n.fills) {
        if (fill && typeof fill === 'object' && (fill as any).type === 'IMAGE') {
          const url = (fill as any).url
          if (url && urlToHash[url]) {
            (fill as any).assetHash = urlToHash[url]
          }
        }
      }
    }
    if (Array.isArray(n.children)) n.children.forEach(visit)
  }
  visit(node)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Wire into renderer**

In `backend/src/renderer.ts`, after `page.evaluate(...)` and before the return, add:

```typescript
import { extractImageUrls, fetchAndEncode, rewriteFillsToHash } from './assets'

// ...inside render(), after `result = await page.evaluate(...)`:
const urls = extractImageUrls(result.tree as FigmaNodeJson)
const { assets, urlToHash } = await fetchAndEncode(ctx, urls)
rewriteFillsToHash(result.tree as FigmaNodeJson, urlToHash)

// then update return:
return {
  tree: result.tree as FigmaNodeJson,
  assets,
  fonts: result.fonts,
  meta: { /* same */ },
}
```

- [ ] **Step 6: Smoke test against real site**

```bash
curl -X POST http://localhost:3000/render \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | jq '.assets | keys | length'
```
Expected: a number > 0 if the page has images.

- [ ] **Step 7: Commit (ASK FIRST)**

```bash
git add backend/
git commit -m "feat(backend): inline images as base64 with sha1 dedupe"
```

---

## Task 8: Dockerize backend

**Files:**
- Create: `backend/Dockerfile`, `docker-compose.yml`
- Modify: `backend/.gitignore` (ignore dist)

- [ ] **Step 1: Write Dockerfile**

File: `backend/Dockerfile`

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install -D typescript && npx tsc && npm uninstall typescript

COPY ../engine/html-to-figma/dist ./engine-bundle

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Note: Docker `COPY` cannot cross build context. We need the root as context. See Step 2.

- [ ] **Step 2: Write docker-compose.yml**

File: `docker-compose.yml` (at repo root)

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    image: ghcr.io/arthur/web-to-figma:latest
    container_name: web-to-figma
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - BACKEND_API_KEY=${BACKEND_API_KEY}
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 3: Rewrite Dockerfile to use root context**

File: `backend/Dockerfile` (replace with):

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./
RUN npm ci

# Copy source + engine bundle
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY engine/html-to-figma/dist ./engine/html-to-figma/dist

# Build
RUN npx tsc

# Prune dev deps
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Note: adjust `ENGINE_BUNDLE` path in `renderer.ts` or symlink so Docker and local dev both work. Simplest: in Dockerfile set env `ENGINE_BUNDLE_PATH=/app/engine/html-to-figma/dist/bundle.js`, read it in renderer.ts with `process.env.ENGINE_BUNDLE_PATH ?? path.resolve(...)`.

- [ ] **Step 4: Update renderer.ts to use env path**

In `backend/src/renderer.ts`:

```typescript
const ENGINE_BUNDLE = process.env.ENGINE_BUNDLE_PATH
  ?? path.resolve(__dirname, '../../engine/html-to-figma/dist/bundle.js')
```

Add to compose env:
```yaml
environment:
  - ENGINE_BUNDLE_PATH=/app/engine/html-to-figma/dist/bundle.js
```

- [ ] **Step 5: Build + run locally**

```bash
cd C:/Users/arthu/Desktop/Projecten/web-to-figma
export BACKEND_API_KEY=$(openssl rand -hex 32)
echo $BACKEND_API_KEY > .env.local  # save for later
docker compose up --build -d
docker compose logs -f backend
```
Expected: `listening on 3000`.

- [ ] **Step 6: Test local container**

```bash
curl http://localhost:3000/health
# Expected: {"ok":true}
```

- [ ] **Step 7: Commit (ASK FIRST)**

```bash
git add backend/Dockerfile docker-compose.yml backend/src/renderer.ts
git commit -m "feat: dockerize backend with playwright base image"
```

---

## Task 9: Deploy to VPS + GitHub Actions

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create on VPS: `/etc/nginx/sites-available/api.onemanarmy.world`
- Create on VPS: `/opt/web-to-figma/.env`

- [ ] **Step 1: Nginx config on VPS**

SSH into VPS (`deploy@api.onemanarmy.world`):

```bash
sudo nano /etc/nginx/sites-available/api.onemanarmy.world
```

Contents:
```nginx
server {
    listen 80;
    server_name api.onemanarmy.world;

    client_max_body_size 1M;

    limit_req_zone $binary_remote_addr zone=render:10m rate=10r/m;

    location / {
        limit_req zone=render burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

- [ ] **Step 2: Enable site + SSL**

```bash
sudo ln -s /etc/nginx/sites-available/api.onemanarmy.world /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.onemanarmy.world --non-interactive --agree-tos -m arthur@pendra.studio
```
Expected: "Successfully deployed certificate".

- [ ] **Step 3: Set up /opt/web-to-figma on VPS**

```bash
sudo mkdir -p /opt/web-to-figma
sudo chown deploy:deploy /opt/web-to-figma
cd /opt/web-to-figma
echo "BACKEND_API_KEY=$(openssl rand -hex 32)" > .env
chmod 600 .env
cat .env  # copy this key — needed for plugin later
```

- [ ] **Step 4: Create GitHub PAT for GHCR**

On github.com → Settings → Developer settings → PAT (classic) with `write:packages` scope. Save as repo secret `GHCR_TOKEN`.

- [ ] **Step 5: Add repo secrets**

On `github.com/arthur/web-to-figma/settings/secrets/actions`:
- `VPS_SSH_KEY` — contents of `~/.ssh/onemanarmy` (private key)
- `VPS_HOST` — `api.onemanarmy.world`
- `VPS_USER` — `deploy`
- `GHCR_TOKEN` — from Step 4

- [ ] **Step 6: Write deploy workflow**

File: `.github/workflows/deploy.yml`

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Build engine bundle
        run: |
          cd engine/html-to-figma
          npm ci
          npm run build

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build + push image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: backend/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/web-to-figma:latest
            ghcr.io/${{ github.repository_owner }}/web-to-figma:${{ github.sha }}

      - name: Deploy on VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/web-to-figma
            docker pull ghcr.io/${{ github.repository_owner }}/web-to-figma:latest
            docker stop web-to-figma || true
            docker rm web-to-figma || true
            docker run -d \
              --name web-to-figma \
              --restart unless-stopped \
              --env-file /opt/web-to-figma/.env \
              -p 127.0.0.1:3000:3000 \
              ghcr.io/${{ github.repository_owner }}/web-to-figma:latest
```

- [ ] **Step 7: Make GHCR image public (or pull with auth)**

On github.com → profile → Packages → web-to-figma → Settings → make public. Avoids auth on VPS pull.

- [ ] **Step 8: Trigger deploy**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add github actions deploy to vps"
# ASK USER BEFORE PUSH
git push
```
Watch on GitHub Actions tab. Expected: green.

- [ ] **Step 9: Verify live endpoint**

```bash
curl https://api.onemanarmy.world/health
# Expected: {"ok":true}
curl -X POST https://api.onemanarmy.world/render \
  -H "Authorization: Bearer <API_KEY_FROM_STEP_3>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | jq '.tree.type'
# Expected: "FRAME" or similar
```

---

## Task 10: Figma plugin scaffold

**Files:**
- Create: `plugin/package.json`, `plugin/tsconfig.json`, `plugin/manifest.json`, `plugin/webpack.config.js`
- Create: `plugin/.env.example`

- [ ] **Step 1: Scaffold**

```bash
cd C:/Users/arthu/Desktop/Projecten/web-to-figma/plugin
npm init -y
npm install -D @figma/plugin-typings typescript webpack webpack-cli ts-loader html-webpack-plugin html-inline-script-webpack-plugin dotenv-webpack vitest
npx tsc --init
```

- [ ] **Step 2: manifest.json**

```json
{
  "name": "Web → Figma",
  "id": "web-to-figma-arthur",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://api.onemanarmy.world"]
  }
}
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"],
    "typeRoots": ["./node_modules/@types", "./node_modules/@figma"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: webpack.config.js**

```javascript
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin')
const Dotenv = require('dotenv-webpack')

module.exports = {
  mode: 'development',
  devtool: false,
  entry: {
    code: './src/code.ts',
    ui: './src/ui/main.ts',
  },
  module: {
    rules: [
      { test: /\.ts$/, loader: 'ts-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  resolve: { extensions: ['.ts', '.js'] },
  output: { filename: '[name].js', path: path.resolve(__dirname, 'dist') },
  plugins: [
    new Dotenv(),
    new HtmlWebpackPlugin({
      template: './src/ui/index.html',
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body',
    }),
    new HtmlInlineScriptPlugin(),
  ],
}
```

- [ ] **Step 5: .env.example + scripts**

File: `plugin/.env.example`
```
BACKEND_URL=https://api.onemanarmy.world
BACKEND_API_KEY=paste_your_key_here
```

Update `plugin/package.json`:
```json
{
  "scripts": {
    "build": "webpack --mode production",
    "watch": "webpack --watch --mode development",
    "test": "vitest run"
  }
}
```

- [ ] **Step 6: Commit scaffold (ASK FIRST)**

```bash
git add plugin/
git commit -m "chore(plugin): scaffold figma plugin with webpack"
```

---

## Task 11: Plugin UI (modern dark)

**Files:**
- Create: `plugin/src/ui/index.html`, `plugin/src/ui/styles.css`

- [ ] **Step 1: index.html**

File: `plugin/src/ui/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="app">
    <header class="hdr">
      <div class="hdr-title">Web → Figma</div>
      <div class="hdr-sub">Import any site as auto-layout</div>
    </header>

    <section class="field">
      <label for="url">URL</label>
      <div class="input-wrap">
        <input id="url" type="text" placeholder="https://example.com" autocomplete="off" spellcheck="false" />
        <span class="validity" data-state="idle"></span>
      </div>
    </section>

    <section class="field">
      <label>Viewport</label>
      <div class="segmented" role="tablist">
        <button class="seg active" data-viewport="1440">Desktop</button>
        <button class="seg" data-viewport="834">Tablet</button>
        <button class="seg" data-viewport="390">Mobile</button>
      </div>
    </section>

    <button id="import" class="btn-primary" disabled>
      <span class="btn-label">Import</span>
      <span class="btn-spinner" hidden></span>
    </button>

    <section id="status" class="status" hidden></section>
  </main>
</body>
</html>
```

- [ ] **Step 2: styles.css**

File: `plugin/src/ui/styles.css`

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #1e1e1e;
  --surface: #2c2c2c;
  --surface-2: #383838;
  --border: #3a3a3a;
  --text: #ffffff;
  --text-dim: #a0a0a0;
  --accent: #0d99ff;
  --accent-hover: #2aa8ff;
  --success: #14ae5c;
  --error: #f24822;
  --radius: 6px;
  --radius-lg: 8px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  width: 320px;
  min-height: 480px;
}

.app { display: flex; flex-direction: column; gap: 16px; padding: 16px; }

.hdr-title { font-size: 14px; font-weight: 600; }
.hdr-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }

.input-wrap { position: relative; }
input[type="text"] {
  width: 100%;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 32px 10px 12px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms ease, background 150ms ease;
}
input[type="text"]:focus { border-color: var(--accent); background: var(--surface-2); }
input[type="text"]::placeholder { color: var(--text-dim); }

.validity {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: background 150ms ease;
}
.validity[data-state="valid"] { background: var(--success); }
.validity[data-state="invalid"] { background: var(--error); }

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2px;
  gap: 2px;
}
.seg {
  background: transparent;
  border: 0;
  color: var(--text-dim);
  padding: 7px 0;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  transition: background 150ms ease, color 150ms ease;
}
.seg:hover { color: var(--text); }
.seg.active { background: var(--surface-2); color: var(--text); }

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: var(--radius);
  padding: 11px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-spinner {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.status {
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 11px;
  line-height: 1.5;
}
.status[data-kind="success"] { background: rgba(20, 174, 92, 0.12); color: var(--success); border: 1px solid rgba(20, 174, 92, 0.3); }
.status[data-kind="error"]   { background: rgba(242, 72, 34, 0.12); color: var(--error);   border: 1px solid rgba(242, 72, 34, 0.3); }
.status[data-kind="info"]    { background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); }
```

- [ ] **Step 3: Visual smoke test**

Build once, load in Figma:
```bash
cd plugin && npm run build
```
In Figma desktop: Plugins → Development → Import plugin from manifest → select `plugin/manifest.json`. Run the plugin. Verify UI looks like the design (dark panel, input, segmented control, disabled button).

- [ ] **Step 4: Commit (ASK FIRST)**

```bash
git add plugin/src/ui/
git commit -m "feat(plugin): build modern dark UI shell"
```

---

## Task 12: Plugin UI logic + backend call

**Files:**
- Create: `plugin/src/ui/main.ts`, `plugin/src/code.ts`, `plugin/src/types.ts`

- [ ] **Step 1: Shared types**

File: `plugin/src/types.ts` — copy from `backend/src/types.ts` (same shape). Keep them in sync manually for v1 (later: extract shared package).

- [ ] **Step 2: main.ts — UI logic**

File: `plugin/src/ui/main.ts`

```typescript
import './styles.css'

const urlInput = document.getElementById('url') as HTMLInputElement
const validity = document.querySelector('.validity') as HTMLElement
const segs = document.querySelectorAll<HTMLButtonElement>('.seg')
const importBtn = document.getElementById('import') as HTMLButtonElement
const btnLabel = importBtn.querySelector('.btn-label') as HTMLSpanElement
const btnSpinner = importBtn.querySelector('.btn-spinner') as HTMLSpanElement
const statusEl = document.getElementById('status') as HTMLElement

let viewport = 1440

const validate = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const setStatus = (kind: 'success' | 'error' | 'info' | null, text: string) => {
  if (!kind) { statusEl.hidden = true; return }
  statusEl.hidden = false
  statusEl.dataset.kind = kind
  statusEl.textContent = text
}

urlInput.addEventListener('input', () => {
  const v = urlInput.value.trim()
  if (!v) { validity.dataset.state = 'idle'; importBtn.disabled = true; return }
  const ok = validate(v)
  validity.dataset.state = ok ? 'valid' : 'invalid'
  importBtn.disabled = !ok
})

urlInput.addEventListener('blur', () => {
  const v = urlInput.value.trim()
  if (v && !/^https?:\/\//.test(v)) {
    urlInput.value = 'https://' + v
    urlInput.dispatchEvent(new Event('input'))
  }
})

segs.forEach((btn) => {
  btn.addEventListener('click', () => {
    segs.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    viewport = Number(btn.dataset.viewport)
  })
})

importBtn.addEventListener('click', () => {
  const url = urlInput.value.trim()
  btnLabel.textContent = 'Rendering…'
  btnSpinner.hidden = false
  importBtn.disabled = true
  setStatus('info', 'Opening page in headless Chromium…')
  parent.postMessage({ pluginMessage: { type: 'render', url, viewport } }, '*')
})

window.onmessage = (e) => {
  const msg = e.data.pluginMessage
  if (!msg) return
  if (msg.type === 'progress') setStatus('info', msg.text)
  if (msg.type === 'success') {
    setStatus('success', `Imported — ${msg.frames} frames, ${msg.images} images${msg.missingFonts.length ? `. Missing fonts: ${msg.missingFonts.join(', ')}` : ''}.`)
    resetBtn()
  }
  if (msg.type === 'error') {
    setStatus('error', msg.text)
    resetBtn()
  }
}

const resetBtn = () => {
  btnLabel.textContent = 'Import'
  btnSpinner.hidden = true
  importBtn.disabled = !validate(urlInput.value.trim())
}
```

- [ ] **Step 3: code.ts — main thread**

File: `plugin/src/code.ts`

```typescript
import { buildTree } from './builder'
import { loadFonts } from './fonts'
import type { RenderResponse } from './types'

figma.showUI(__html__, { width: 320, height: 480, themeColors: true })

const BACKEND_URL = process.env.BACKEND_URL!
const API_KEY = process.env.BACKEND_API_KEY!

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'render') return

  try {
    figma.ui.postMessage({ type: 'progress', text: 'Fetching render from server…' })
    const res = await fetch(`${BACKEND_URL}/render`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: msg.url,
        viewport: { width: msg.viewport, height: Math.round(msg.viewport * 0.625) },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error ?? 'render failed')
    }
    const data = (await res.json()) as RenderResponse

    figma.ui.postMessage({ type: 'progress', text: 'Loading fonts…' })
    const missingFonts = await loadFonts(data.fonts)

    figma.ui.postMessage({ type: 'progress', text: 'Building frames…' })
    const root = await buildTree(data.tree, data.assets)
    figma.currentPage.appendChild(root)
    figma.currentPage.selection = [root]
    figma.viewport.scrollAndZoomIntoView([root])

    const frameCount = countFrames(root)
    const imageCount = Object.keys(data.assets).length
    figma.ui.postMessage({ type: 'success', frames: frameCount, images: imageCount, missingFonts })
  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: (err as Error).message })
  }
}

const countFrames = (node: SceneNode): number => {
  let count = 1
  if ('children' in node) node.children.forEach((c) => (count += countFrames(c)))
  return count
}
```

- [ ] **Step 4: Stub builder + fonts for type-check**

Temporary stubs so webpack builds. Replace in Tasks 13 + 15.

File: `plugin/src/builder.ts`
```typescript
import type { FigmaNodeJson, RenderAsset } from './types'
export const buildTree = async (_node: FigmaNodeJson, _assets: Record<string, RenderAsset>): Promise<FrameNode> => {
  const f = figma.createFrame()
  f.name = 'placeholder'
  return f
}
```

File: `plugin/src/fonts.ts`
```typescript
import type { FontRef } from './types'
export const loadFonts = async (_fonts: FontRef[]): Promise<string[]> => []
```

- [ ] **Step 5: Build + sanity check in Figma**

```bash
npm run build
```
Reload plugin in Figma. Enter `https://example.com`, click Import. Expected: empty placeholder frame appears, UI shows success toast. (Real tree builder comes next.)

- [ ] **Step 6: Commit (ASK FIRST)**

```bash
git add plugin/src/
git commit -m "feat(plugin): ui logic and backend integration"
```

---

## Task 13: Tree builder (TDD)

**Files:**
- Create: `plugin/tests/builder.test.ts`
- Replace: `plugin/src/builder.ts`

- [ ] **Step 1: Figma API mock**

Figma's plugin API is hard to mock fully. For v1, test pure helpers only — the `rgbaFromString`, `parseAutoLayout` kind of functions. The actual `figma.create*` calls are integration-tested in Figma manually.

File: `plugin/tests/builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { rgbaFromString, parseAutoLayoutMode } from '../src/builder'

describe('rgbaFromString', () => {
  it('parses rgb()', () => {
    expect(rgbaFromString('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })
  it('parses rgba()', () => {
    expect(rgbaFromString('rgba(255, 0, 0, 0.5)')).toEqual({ r: 1, g: 0, b: 0, a: 0.5 })
  })
  it('parses hex #rrggbb', () => {
    expect(rgbaFromString('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })
  it('returns null for invalid', () => {
    expect(rgbaFromString('lolwhat')).toBeNull()
  })
})

describe('parseAutoLayoutMode', () => {
  it('maps flex row to HORIZONTAL', () => {
    expect(parseAutoLayoutMode({ display: 'flex', flexDirection: 'row' })).toBe('HORIZONTAL')
  })
  it('maps flex column to VERTICAL', () => {
    expect(parseAutoLayoutMode({ display: 'flex', flexDirection: 'column' })).toBe('VERTICAL')
  })
  it('maps non-flex to NONE', () => {
    expect(parseAutoLayoutMode({ display: 'block' })).toBe('NONE')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Write full builder.ts**

File: `plugin/src/builder.ts`

```typescript
import type { FigmaNodeJson, RenderAsset } from './types'

export const rgbaFromString = (s: string): { r: number; g: number; b: number; a: number } | null => {
  const rgba = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+))?\s*\)$/)
  if (rgba) {
    return {
      r: Number(rgba[1]) / 255,
      g: Number(rgba[2]) / 255,
      b: Number(rgba[3]) / 255,
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }
  const hex = s.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
  }
  return null
}

type Layout = { display?: string; flexDirection?: string }
export const parseAutoLayoutMode = (l: Layout): 'HORIZONTAL' | 'VERTICAL' | 'NONE' => {
  if (l.display !== 'flex') return 'NONE'
  return l.flexDirection === 'column' || l.flexDirection === 'column-reverse' ? 'VERTICAL' : 'HORIZONTAL'
}

export const buildTree = async (
  jsonRoot: FigmaNodeJson,
  assets: Record<string, RenderAsset>
): Promise<FrameNode> => {
  const rootFrame = figma.createFrame()
  rootFrame.name = (jsonRoot.name as string) ?? 'Imported Site'
  rootFrame.resize(1440, 900)
  rootFrame.layoutMode = 'VERTICAL'
  rootFrame.primaryAxisSizingMode = 'AUTO'
  rootFrame.counterAxisSizingMode = 'FIXED'

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
  const type = n.type as string

  if (type === 'TEXT' && typeof n.characters === 'string') {
    const t = figma.createText()
    t.name = (n.name as string) ?? 'Text'
    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
      t.fontName = { family: 'Inter', style: 'Regular' }
    } catch {}
    t.characters = n.characters
    applyFills(t, n)
    applyPosition(t, n)
    return t
  }

  const f = figma.createFrame()
  f.name = (n.name as string) ?? type
  applyFills(f, n, assets)
  applyAutoLayout(f, n)
  applyPosition(f, n)
  applyCornerRadius(f, n)

  if (Array.isArray(n.children)) {
    for (const child of n.children) {
      const c = await buildNode(child, assets)
      if (c) f.appendChild(c)
    }
  }
  return f
}

const applyFills = (node: SceneNode & { fills: Paint[] | typeof figma.mixed }, n: FigmaNodeJson, assets: Record<string, RenderAsset> = {}) => {
  const fills = Array.isArray(n.fills) ? n.fills : []
  const out: Paint[] = []
  for (const fill of fills) {
    const f = fill as any
    if (f.type === 'SOLID' && typeof f.color === 'string') {
      const c = rgbaFromString(f.color)
      if (c) out.push({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a })
    } else if (f.type === 'IMAGE' && typeof f.assetHash === 'string' && assets[f.assetHash]) {
      const bytes = figma.util.base64Decode(assets[f.assetHash].data)
      const image = figma.createImage(bytes)
      out.push({ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash })
    }
  }
  if (out.length) (node as any).fills = out
}

const applyAutoLayout = (f: FrameNode, n: FigmaNodeJson) => {
  const layout = n.layout as Layout | undefined
  if (!layout) return
  f.layoutMode = parseAutoLayoutMode(layout)
  if (f.layoutMode === 'NONE') return
  const spacing = Number((n as any).itemSpacing ?? 0)
  if (spacing) f.itemSpacing = spacing
  const pad = (n as any).padding as { t: number; r: number; b: number; l: number } | undefined
  if (pad) {
    f.paddingTop = pad.t; f.paddingRight = pad.r; f.paddingBottom = pad.b; f.paddingLeft = pad.l
  }
}

const applyPosition = (node: SceneNode, n: FigmaNodeJson) => {
  if (typeof n.x === 'number') node.x = n.x
  if (typeof n.y === 'number') node.y = n.y
  const w = Number(n.width ?? 0), h = Number(n.height ?? 0)
  if (w > 0 && h > 0 && 'resize' in node) node.resize(w, h)
}

const applyCornerRadius = (f: FrameNode, n: FigmaNodeJson) => {
  const r = Number(n.cornerRadius ?? 0)
  if (r > 0) f.cornerRadius = r
}
```

Note: the exact field names (`n.layout`, `n.padding`, `n.fills.color`) depend on the output shape of the forked `html-to-figma` engine. After Task 4, inspect `engine/html-to-figma/dist/bundle.js` sample output and adjust field accessors if needed. Treat this as the most likely schema based on Builder.io's original.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 5: Integration test in Figma**

```bash
npm run build
```
Reload plugin. Import `https://example.com`. Expected: a Figma frame tree appears with text ("Example Domain" etc.), approximate layout, text editable.

- [ ] **Step 6: Commit (ASK FIRST)**

```bash
git add plugin/
git commit -m "feat(plugin): tree walker builds figma frames from json"
```

---

## Task 14: Font loading + graceful fallback

**Files:**
- Replace: `plugin/src/fonts.ts`

- [ ] **Step 1: Implement fonts.ts**

File: `plugin/src/fonts.ts`

```typescript
import type { FontRef } from './types'

const weightToStyle = (w: number): string => {
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
    if (!availableByFamily.has(f.fontName.family)) availableByFamily.set(f.fontName.family, new Set())
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
        try { await figma.loadFontAsync({ family: font.family, style }) } catch { missing.add(font.family) }
      } else {
        missing.add(font.family)
      }
    }
  }

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

  return Array.from(missing)
}
```

- [ ] **Step 2: Update builder.ts to use real font**

In `plugin/src/builder.ts`, update the TEXT branch:

```typescript
if (type === 'TEXT' && typeof n.characters === 'string') {
  const family = (n.fontFamily as string) ?? 'Inter'
  const weight = Number(n.fontWeight ?? 400)
  const style = weightToStyleStr(weight)
  const fontName = { family, style }
  const t = figma.createText()
  t.name = (n.name as string) ?? 'Text'
  try {
    await figma.loadFontAsync(fontName)
    t.fontName = fontName
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    t.fontName = { family: 'Inter', style: 'Regular' }
    t.name = `[font: ${family} ${weight}] ` + t.name
  }
  if (typeof n.fontSize === 'number') t.fontSize = n.fontSize
  t.characters = n.characters
  applyFills(t, n)
  applyPosition(t, n)
  return t
}
```

Import the helper:
```typescript
const weightToStyleStr = (w: number): string => {
  if (w <= 300) return 'Light'
  if (w <= 400) return 'Regular'
  if (w <= 500) return 'Medium'
  if (w <= 600) return 'SemiBold'
  return 'Bold'
}
```

- [ ] **Step 3: Rebuild + test in Figma**

```bash
npm run build
```
Import `https://stripe.com`. Expected: text renders with correct fonts if installed, otherwise Inter fallback with `[font: ...]` prefix in layer name.

- [ ] **Step 4: Commit (ASK FIRST)**

```bash
git add plugin/src/
git commit -m "feat(plugin): load available fonts, fallback to inter"
```

---

## Task 15: End-to-end smoke test + polish

- [ ] **Step 1: Test 3 real sites**

In Figma, with prod backend, import:
1. `https://example.com` — trivial
2. `https://linear.app` — marketing / React
3. A Shopify storefront — e-commerce

For each, check:
- Frame appears
- Text is editable
- Images embedded (no missing placeholders where source had images)
- Auto-layout applied where source had flex
- Missing fonts surfaced in UI

Note any regressions or schema mismatches from the engine. Fix and re-deploy.

- [ ] **Step 2: Update README with live status**

Replace the `(after implementation)` placeholder block with actual tested commands. Add a "Known issues" section listing any sites that misrender.

- [ ] **Step 3: Final commit (ASK FIRST)**

```bash
git add README.md
git commit -m "docs: mark v1 as working, add known issues"
```

---

## Summary

- **15 tasks** covering infra, backend, plugin, and QA
- **TDD** applied to pure logic (auth, asset helpers, color/layout parsers)
- **Manual integration testing** for Playwright and Figma plugin (unavoidable)
- **All commits require Arthur's approval** per CLAUDE.md
- **First usable version** after Task 13; fonts and polish in 14-15

Estimated calendar time: 2-3 focused days, including VPS provisioning wait times and Figma plugin fiddling.
