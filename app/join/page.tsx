'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '../../components/AppShell'
import { getSupabase } from '../../lib/supabase'
import { friendlyError, inputClass, primaryBtn } from '../../lib/ui'

function JoinForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const clean = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{8}$/.test(clean)) return setError('A room code has 8 letters and numbers.')
    setBusy(true)
    const { data, error: err } = await getSupabase()!.rpc('join_room', { p_code: clean })
    setBusy(false)
    if (err || !data) return setError(friendlyError(err?.message ?? ''))
    router.push(`/room/${data}`)
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold tracking-tight">Join with a code</h1>
      <p className="mt-2 text-muted">Enter the 8-character code a friend sent you.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-6" noValidate>
        <div>
          <label htmlFor="code" className="text-sm font-medium">Room code</label>
          <input id="code" className={`${inputClass} text-lg uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB12CD34" maxLength={8} autoComplete="off" />
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? 'Joining...' : 'Join room'}</button>
      </form>
    </div>
  )
}

export default function JoinPage() {
  return (
    <AppShell>
      <JoinForm />
    </AppShell>
  )
}
