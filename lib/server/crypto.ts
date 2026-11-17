import 'server-only'
import crypto from 'node:crypto'
import { AppError } from './errors'

const notConfigured = () => new AppError(503, 'not_configured', 'This feature is not set up on the server yet.')

function masterKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  const key = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0)
  if (key.length !== 32) throw notConfigured()
  return key
}

// Separate keys for encryption and for signing, both derived from the one secret.
const derive = (label: string) => crypto.createHmac('sha256', masterKey()).update(label).digest()

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derive('enc'), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new AppError(500, 'bad_token_data', 'A stored token could not be read.')
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', derive('enc'), Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')
  } catch {
    throw new AppError(500, 'bad_token_data', 'A stored token could not be read.')
  }
}

// 32 random bytes = 43 URL-safe characters. This is the secret part of a watch link.
export const newToken = () => crypto.randomBytes(32).toString('base64url')

export const sign = (data: string) => crypto.createHmac('sha256', derive('state')).update(data).digest('base64url')

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
