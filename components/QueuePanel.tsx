'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { checkVideoUrl } from '../lib/sync'
import { friendlyError, inputClass, outlineBtn, primaryBtn } from '../lib/ui'

type Item = { id: number; video_url: string; title: string; added_by: string | null }

function label(item: Item) {
  if (item.title) return item.title
  try {
    const u = new URL(item.video_url)
    const file = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    return file || u.hostname
  } catch {
    return item.video_url
  }
}

export default function QueuePanel({ roomId, userId, canControl }: { roomId: string; userId: string; canControl: boolean }) {
  const [items, setItems] = useState<Item[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const [list, state] = await Promise.all([
      supabase.from('playlist_items').select('id, video_url, title, added_by').eq('room_id', roomId).order('id'),
      supabase.from('playback_states').select('current_item_id').eq('room_id', roomId).maybeSingle(),
    ])
    if (list.data) setItems(list.data as Item[])
    setCurrentId((state.data as { current_item_id: number | null } | null)?.current_item_id ?? null)
    setLoaded(true)
  }, [roomId])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    load()
    const timer = setInterval(load, 10000)
    const channel = supabase
      .channel(`queue-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'playlist_items', filter: `room_id=eq.${roomId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playback_states', filter: `room_id=eq.${roomId}` }, () => load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })
    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [roomId, load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const problem = checkVideoUrl(url)
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    const { error: err } = await getSupabase()!.rpc('queue_add', { p_room: roomId, p_url: url.trim(), p_title: title.trim() })
    setBusy(false)
    if (err) return setError(friendlyError(err.message))
    setUrl('')
    setTitle('')
    load()
  }

  async function playNow(item: Item) {
    setError('')
    const { error: err } = await getSupabase()!.rpc('play_item', { p_room: roomId, p_item: item.id })
    if (err) return setError(friendlyError(err.message))
    load()
  }

  async function remove(item: Item) {
    setError('')
    const { error: err } = await getSupabase()!.rpc('queue_remove', { p_item: item.id })
    if (err) return setError(friendlyError(err.message))
    load()
  }

  const currentIndex = items.findIndex((i) => i.id === currentId)
  const nextId = currentIndex >= 0 ? items[currentIndex + 1]?.id : undefined

  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-label="Video queue">
      <h2 className="font-bold">Queue</h2>
      <p className="mt-1 text-xs text-muted">When a video ends, the next one in the queue starts automatically.</p>

      {!loaded ? (
        <p className="mt-4 text-sm text-muted" role="status">Loading queue...</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">The queue is empty. Add a video link below.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((item, index) => (
            <li key={item.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${item.id === currentId ? 'border-primary bg-primary/10' : 'border-line bg-surface'}`}>
              <span className="w-5 text-center text-xs text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{label(item)}</span>
              {item.id === currentId && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">Now playing</span>}
              {item.id === nextId && <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">Up next</span>}
              <span className="flex gap-2">
                {canControl && item.id !== currentId && (
                  <button onClick={() => playNow(item)} className={`${outlineBtn} !px-3 !py-1 !text-xs`}>Play now</button>
                )}
                {(canControl || item.added_by === userId) && (
                  <button onClick={() => remove(item)} className="text-xs text-red-300 underline underline-offset-2 hover:text-red-200" aria-label={`Remove ${label(item)} from the queue`}>
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={add} className="mt-5 space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="queue-url" className="sr-only">Video link</label>
            <input id="queue-url" className={`${inputClass} !mt-0`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/episode-2.mp4" inputMode="url" />
          </div>
          <div>
            <label htmlFor="queue-title" className="sr-only">Title (optional)</label>
            <input id="queue-title" className={`${inputClass} !mt-0`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={100} />
          </div>
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Adding...' : 'Add to queue'}</button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
    </section>
  )
}
