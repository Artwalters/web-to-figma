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
