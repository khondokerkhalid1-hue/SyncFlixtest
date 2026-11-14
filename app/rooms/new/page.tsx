'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '../../../components/AppShell'
import { getSupabase } from '../../../lib/supabase'
import { friendlyError, inputClass, primaryBtn } from '../../../lib/ui'

function CreateRoomForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [maxMembers, setMaxMembers] = useState(10)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed.length > 60) return setError('Room name must be 3 to 60 characters.')
    if (description.length > 300) return setError('Description can be up to 300 characters.')
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 50) return setError('Room size must be between 2 and 50.')
    const supabase = getSupabase()
    if (!supabase) return setError('SyncFlix is not connected to its database yet.')

    setBusy(true)
    const { data, error: err } = await supabase.rpc('create_room', {
      p_name: trimmed,
      p_description: description,
      p_is_public: isPublic,
      p_max_members: maxMembers,
    })
    setBusy(false)
    if (err || !data) return setError(friendlyError(err?.message ?? ''))
    router.push(`/room/${data}`)
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Create a room</h1>
      <p className="mt-2 text-muted">You will be the host. You control playback and who stays in the room.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-2xl border border-line bg-card p-6" noValidate>
        <div>
          <label htmlFor="name" className="text-sm font-medium">Room name</label>
          <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday anime night" maxLength={60} required />
        </div>
        <div>
          <label htmlFor="desc" className="text-sm font-medium">Description (optional)</label>
          <textarea id="desc" className={`${inputClass} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you watching?" maxLength={300} />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Who can find this room?</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {[
              { value: true, title: 'Public', text: 'Listed in Explore. Anyone signed in can join.' },
              { value: false, title: 'Private', text: 'Hidden. Only people with the code or link can join.' },
            ].map((o) => (
              <label key={o.title} className={`cursor-pointer rounded-xl border p-4 text-sm ${isPublic === o.value ? 'border-primary bg-primary/10' : 'border-line bg-surface'}`}>
                <input type="radio" name="visibility" className="sr-only" checked={isPublic === o.value} onChange={() => setIsPublic(o.value)} />
                <span className="block font-semibold">{o.title}</span>
                <span className="mt-1 block text-muted">{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="max" className="text-sm font-medium">Maximum people (2 to 50)</label>
          <input id="max" type="number" min={2} max={50} className={inputClass} value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} />
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? 'Creating...' : 'Create room'}</button>
      </form>
    </div>
  )
}

export default function CreateRoomPage() {
  return (
    <AppShell>
      <CreateRoomForm />
    </AppShell>
  )
}
