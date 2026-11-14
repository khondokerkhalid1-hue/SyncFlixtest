'use client'

import { FormEvent, useEffect, useState } from 'react'
import AppShell from '../../components/AppShell'
import Avatar from '../../components/Avatar'
import { useAuth } from '../../components/AuthProvider'
import { getSupabase } from '../../lib/supabase'
import { friendlyError, inputClass, primaryBtn } from '../../lib/ui'

const COLORS = [
  { value: '#7C3AED', name: 'Violet' },
  { value: '#2563EB', name: 'Blue' },
  { value: '#0D9488', name: 'Teal' },
  { value: '#16A34A', name: 'Green' },
  { value: '#CA8A04', name: 'Gold' },
  { value: '#EA580C', name: 'Orange' },
  { value: '#DC2626', name: 'Red' },
  { value: '#DB2777', name: 'Pink' },
]

function ProfileForm() {
  const { user, profile, reloadProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [color, setColor] = useState('#7C3AED')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) {
      setUsername(profile.username)
      setColor(profile.avatar_color)
    }
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!user || !profile) return
    const name = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(name)) return setError('Username must be 3 to 20 characters: letters, numbers and underscore only.')
    const supabase = getSupabase()!
    setBusy(true)
    if (name !== profile.username) {
      const { data: free } = await supabase.rpc('username_available', { name })
      if (free === false) {
        setBusy(false)
        return setError('That username is already taken. Try another one.')
      }
    }
    const { error: err } = await supabase.from('profiles').update({ username: name, avatar_color: color }).eq('id', user.id)
    setBusy(false)
    if (err) return setError(friendlyError(err.message))
    setUsername(name)
    setNotice('Profile saved.')
    reloadProfile()
  }

  if (!profile) return <p className="text-sm text-muted" role="status">Loading profile...</p>

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Your profile</h1>
      <p className="mt-2 text-muted">This is how friends see you in rooms and chat.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6 rounded-2xl border border-line bg-card p-6" noValidate>
        <div className="flex items-center gap-4">
          <Avatar name={username || '?'} color={color} size={64} />
          <p className="text-lg font-bold">{username || 'Your name'}</p>
        </div>

        <div>
          <label htmlFor="p-username" className="text-sm font-medium">Username</label>
          <input id="p-username" className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="username" />
          <p className="mt-1.5 text-xs text-muted">3 to 20 characters: lowercase letters, numbers and underscore.</p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Avatar colour</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <label key={c.value} className="cursor-pointer">
                <input type="radio" name="avatar-color" value={c.value} checked={color === c.value} onChange={() => setColor(c.value)} className="peer sr-only" />
                <span className="block h-9 w-9 rounded-full ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary" style={{ backgroundColor: c.value }} />
                <span className="sr-only">{c.name}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Photo avatars are not available yet.</p>
        </fieldset>

        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving...' : 'Save profile'}</button>
      </form>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileForm />
    </AppShell>
  )
}
