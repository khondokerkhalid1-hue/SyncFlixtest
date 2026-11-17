import { getSupabase } from './supabase'

export class ApiFailure extends Error {
  constructor(message: string, public code = 'error') {
    super(message)
  }
}

// Calls SyncFlix's own server routes with the signed-in person's session token.
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = (await getSupabase()?.auth.getSession())?.data.session
  if (!session) throw new ApiFailure('Please log in again.', 'unauthorized')
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiFailure(json?.error?.message ?? 'Something went wrong. Please try again.', json?.error?.code)
  return json as T
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return 'unknown size'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
