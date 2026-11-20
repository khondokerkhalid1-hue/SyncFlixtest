import 'server-only'
import { AppError } from './errors'

// A small per-server-instance limit for public routes (search). It is best effort: it stops one
// browser from hammering the TMDB proxy, without needing a database for visitors.
const buckets = new Map<string, { start: number; count: number }>()

export function limitPerMinute(key: string, max: number): void {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.start > 60_000) {
    if (buckets.size > 5000) buckets.clear()
    buckets.set(key, { start: now, count: 1 })
    return
  }
  b.count++
  if (b.count > max) throw new AppError(429, 'rate_limited', 'Too many searches. Please wait a moment.', 60)
}
