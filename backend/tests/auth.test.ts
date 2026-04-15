import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { requireApiKey } from '../src/auth'

describe('requireApiKey middleware', () => {
  const app = express()
  beforeAll(() => {
    process.env.BACKEND_API_KEY = 'test-key-123'
    app.get('/protected', requireApiKey, (_req, res) => {
      res.json({ ok: true })
    })
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
