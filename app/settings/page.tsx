'use client'

import { FormEvent, useState } from 'react'
import AppShell from '../../components/AppShell'
import { useAuth } from '../../components/AuthProvider'
import { getSupabase } from '../../lib/supabase'
import { inputClass, outlineBtn, primaryBtn } from '../../lib/ui'

function SettingsView() {
  const { user, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error: err } = await getSupabase()!.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(/same|different/i.test(err.message) ? 'Choose a password you have not used before.' : 'Could not change the password. Please try again.')
    setPassword('')
    setConfirm('')
    setNotice('Password changed.')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-bold">Account</h2>
        <p className="mt-3 text-xs text-muted">Email</p>
        <p className="text-sm">{user?.email}</p>
        <button onClick={signOut} className={`${outlineBtn} mt-5`}>Log out</button>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-bold">Change password</h2>
        <form onSubmit={changePassword} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="new-password" className="text-sm font-medium">New password</label>
            <input id="new-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-medium">Repeat the new password</label>
            <input id="confirm-password" type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving...' : 'Change password'}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-bold">Delete account</h2>
        <p className="mt-2 text-sm text-muted">Account deletion is not available yet.</p>
      </section>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsView />
    </AppShell>
  )
}
