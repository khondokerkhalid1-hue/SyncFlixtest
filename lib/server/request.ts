import 'server-only'
import { AppError } from './errors'
import { serviceClient, type Store } from './store'

// Checks the signed-in person's Supabase session token. Nothing else is trusted to say who the user is.
export async function requireUser(req: Request): Promise<{ id: string }> {
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.get('authorization') ?? '')
  if (!m) throw new AppError(401, 'unauthorized', 'Please log in again.')
  const { data, error } = await serviceClient().auth.getUser(m[1])
  if (error || !data.user) throw new AppError(401, 'unauthorized', 'Please log in again.')
  return { id: data.user.id }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (forwarded || req.headers.get('x-real-ip') || 'unknown').slice(0, 64)
}

export async function readJson(req: Request, maxChars = 4096): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > maxChars) throw new AppError(413, 'too_large', 'The request is too large.')
  try {
    const value = JSON.parse(text)
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {}
  throw new AppError(400, 'bad_request', 'The request could not be read.')
}

export async function limit(store: Store, key: string, max: number, windowSeconds: number): Promise<void> {
  if (!(await store.hitRateLimit(key, max, windowSeconds))) {
    throw new AppError(429, 'rate_limited', 'Too many requests. Please wait a little and try again.', windowSeconds)
  }
}

export function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}
