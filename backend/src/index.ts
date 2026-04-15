import express from 'express'
import cors from 'cors'
import { requireApiKey } from './auth'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/render', requireApiKey, (_req, res) => {
  res.status(501).json({ error: 'not implemented' })
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  console.log(`listening on ${port}`)
})
