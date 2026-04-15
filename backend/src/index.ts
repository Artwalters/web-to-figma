import express from 'express'
import cors from 'cors'
import { requireApiKey } from './auth'
import { Renderer } from './renderer'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const renderer = new Renderer()

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

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

const port = Number(process.env.PORT ?? 3000)

const main = async () => {
  await renderer.start()
  app.listen(port, () => {
    console.log(`listening on ${port}`)
  })
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await renderer.stop()
  process.exit(0)
})
