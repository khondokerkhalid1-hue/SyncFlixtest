'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '../../../components/AppShell'
import Avatar from '../../../components/Avatar'
import ChatPanel from '../../../components/ChatPanel'
import QueuePanel from '../../../components/QueuePanel'
import SyncPlayer from '../../../components/SyncPlayer'
import { useAuth } from '../../../components/AuthProvider'
import { getSupabase } from '../../../lib/supabase'
import { dangerBtn, friendlyError, inputClass, outlineBtn, primaryBtn } from '../../../lib/ui'
import type { Member, Room } from '../../../lib/types'

type Float = { id: number; emoji: string; left: number }

function RoomView() {
  const router = useRouter()
  const { user } = useAuth()
  const params = useParams<{ id: string }>()
  const id = String(params.id ?? '')

  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [floats, setFloats] = useState<Float[]>([])
  const [form, setForm] = useState({ name: '', description: '', isPublic: true, maxMembers: 10, allowControl: false })

  const isHost = room?.host_id === user?.id
  const isMember = members.some((m) => m.user_id === user?.id)
  const canControl = Boolean(isHost || (room?.allow_member_control && isMember))

  const load = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data: r } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle()
    setRoom((r as Room | null) ?? null)
    if (r) {
      const { data: m } = await supabase.rpc('room_roster', { p_room: id })
      setMembers((m ?? []) as Member[])
    } else {
      setMembers([])
    }
    setLoaded(true)
  }, [id])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load])

  // Tell the room this person is online.
  useEffect(() => {
    if (!isMember) return
    const ping = () => {
      if (document.visibilityState === 'visible') getSupabase()?.rpc('touch_presence', { p_room: id })
    }
    ping()
    const timer = setInterval(ping, 25000)
    return () => clearInterval(timer)
  }, [isMember, id])

  useEffect(() => {
    if (room) {
      setForm({ name: room.name, description: room.description, isPublic: room.is_public, maxMembers: room.max_members, allowControl: room.allow_member_control })
    }
  }, [room])

  const addFloat = useCallback((emoji: string) => {
    const f = { id: Date.now() + Math.random(), emoji, left: 8 + Math.random() * 80 }
    setFloats((prev) => [...prev.slice(-12), f])
    setTimeout(() => setFloats((prev) => prev.filter((x) => x.id !== f.id)), 2600)
  }, [])

  if (!loaded) return <p className="text-sm text-muted" role="status">Loading room...</p>

  if (!room) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-extrabold">Room not found</h1>
        <p className="mt-2 text-sm text-muted">It may be private, or it may have been deleted. If a friend gave you a code, use it below.</p>
        <Link href="/join" className={`${primaryBtn} mt-6`}>Join with a code</Link>
      </div>
    )
  }

  const host = members.find((m) => m.user_id === room.host_id)
  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/join/${room.code}` : ''

  async function joinRoom() {
    setError('')
    const { data, error: err } = await getSupabase()!.rpc('join_room', { p_code: room!.code })
    if (err || !data) return setError(friendlyError(err?.message ?? ''))
    load()
  }

  async function leaveRoom() {
    const { error: err } = await getSupabase()!.from('room_members').delete().eq('room_id', id).eq('user_id', user!.id)
    if (err) return setError(friendlyError(err.message))
    router.push('/dashboard')
  }

  async function removeMember(userId: string) {
    setError('')
    const { error: err } = await getSupabase()!.from('room_members').delete().eq('room_id', id).eq('user_id', userId)
    if (err) return setError(friendlyError(err.message))
    load()
  }

  async function makeHost(m: Member) {
    if (!window.confirm(`Make ${m.username} the host? You will lose the host controls.`)) return
    setError('')
    const { error: err } = await getSupabase()!.rpc('transfer_host', { p_room: id, p_new_host: m.user_id })
    if (err) return setError(friendlyError(err.message))
    load()
  }

  async function deleteRoom() {
    if (!window.confirm('Delete this room for everyone? This cannot be undone.')) return
    const { error: err } = await getSupabase()!.from('rooms').delete().eq('id', id)
    if (err) return setError(friendlyError(err.message))
    router.push('/dashboard')
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    const name = form.name.trim()
    if (name.length < 3 || name.length > 60) return setError('Room name must be 3 to 60 characters.')
    if (form.description.length > 300) return setError('Description can be up to 300 characters.')
    if (!Number.isInteger(form.maxMembers) || form.maxMembers < 2 || form.maxMembers > 50) return setError('Room size must be between 2 and 50.')
    if (form.maxMembers < members.length) return setError(`There are already ${members.length} people in the room. Choose a larger size.`)
    const { error: err } = await getSupabase()!
      .from('rooms')
      .update({ name, description: form.description, is_public: form.isPublic, max_members: form.maxMembers, allow_member_control: form.allowControl })
      .eq('id', id)
    if (err) return setError(friendlyError(err.message))
    setNotice('Settings saved.')
    load()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy. Select the text and copy it by hand.')
    }
  }

  if (!isMember) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-card p-6 text-center">
        <h1 className="text-2xl font-extrabold">{room.name}</h1>
        <p className="mt-1 text-sm text-muted">Public room</p>
        {room.description && <p className="mt-4 text-sm text-muted">{room.description}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        <button onClick={joinRoom} className={`${primaryBtn} mt-6`}>Join room</button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{room.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {room.is_public ? 'Public room' : 'Private room'}, hosted by {host?.username ?? 'unknown'}, {members.length} of {room.max_members} people
            {room.allow_member_control ? ', everyone can control playback' : ''}
          </p>
          {room.description && <p className="mt-3 max-w-2xl text-sm text-muted">{room.description}</p>}
        </div>
        {!isHost && <button onClick={leaveRoom} className={outlineBtn}>Leave room</button>}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="relative">
            <SyncPlayer roomId={id} canControl={canControl} userId={user!.id} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-10 overflow-hidden" aria-hidden="true">
              {floats.map((f) => (
                <span key={f.id} className="absolute bottom-2 animate-float-up text-3xl" style={{ left: `${f.left}%` }}>{f.emoji}</span>
              ))}
            </div>
          </div>
          <QueuePanel roomId={id} userId={user!.id} canControl={canControl} />
        </div>

        <aside className="space-y-6">
          <ChatPanel roomId={id} userId={user!.id} onReaction={addFloat} onSystem={load} />

          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-bold">In this room</h2>
            <ul className="mt-3 space-y-3">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3">
                  <span className="relative">
                    <Avatar name={m.username} color={m.avatar_color} size={32} />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${m.online ? 'bg-emerald-400' : 'bg-line'}`} />
                    <span className="sr-only">{m.online ? 'online' : 'offline'}</span>
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {m.username}
                    {m.user_id === user?.id ? ' (you)' : ''}
                  </span>
                  {m.is_host ? (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">Host</span>
                  ) : (
                    isHost && (
                      <span className="flex gap-3 text-xs">
                        <button onClick={() => makeHost(m)} className="underline underline-offset-2 hover:text-primary" aria-label={`Make ${m.username} the host`}>Make host</button>
                        <button onClick={() => removeMember(m.user_id)} className="text-red-300 underline underline-offset-2 hover:text-red-200" aria-label={`Remove ${m.username}`}>Remove</button>
                      </span>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-bold">Invite friends</h2>
            <p className="mt-3 text-xs text-muted">Room code</p>
            <p className="font-mono text-xl font-bold tracking-widest">{room.code}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => copy(room.code)} className={`${outlineBtn} !px-3 !py-2`}>Copy code</button>
              <button onClick={() => copy(inviteLink)} className={`${outlineBtn} !px-3 !py-2`}>Copy link</button>
            </div>
            {copied && <p role="status" className="mt-2 text-xs text-emerald-300">Copied.</p>}
          </section>
        </aside>
      </div>

      {isHost && (
        <section className="mt-8 max-w-xl rounded-2xl border border-line bg-card p-6">
          <h2 className="text-lg font-bold">Room settings</h2>
          <form onSubmit={saveSettings} className="mt-4 space-y-4" noValidate>
            <div>
              <label htmlFor="s-name" className="text-sm font-medium">Room name</label>
              <input id="s-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
            </div>
            <div>
              <label htmlFor="s-desc" className="text-sm font-medium">Description</label>
              <textarea id="s-desc" className={`${inputClass} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="s-vis" className="text-sm font-medium">Visibility</label>
                <select id="s-vis" className={inputClass} value={form.isPublic ? 'public' : 'private'} onChange={(e) => setForm({ ...form, isPublic: e.target.value === 'public' })}>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <label htmlFor="s-max" className="text-sm font-medium">Maximum people</label>
                <input id="s-max" type="number" min={2} max={50} className={inputClass} value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <input id="s-allow" type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={form.allowControl} onChange={(e) => setForm({ ...form, allowControl: e.target.checked })} aria-describedby="s-allow-help" />
              <div>
                <label htmlFor="s-allow" className="font-medium">Let everyone control playback</label>
                <p id="s-allow-help" className="text-muted">Any member can then play, pause, skip and change the video.</p>
              </div>
            </div>
            {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={primaryBtn}>Save settings</button>
              <button type="button" onClick={deleteRoom} className={dangerBtn}>Delete room</button>
            </div>
          </form>
        </section>
      )}
    </>
  )
}

export default function RoomPage() {
  return (
    <AppShell>
      <RoomView />
    </AppShell>
  )
}
