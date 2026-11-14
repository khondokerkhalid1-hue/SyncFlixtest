'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import { getSupabase } from '../lib/supabase'
import { friendlyError, inputClass, outlineBtn, primaryBtn } from '../lib/ui'

type Msg = { id: number; user_id: string | null; kind: 'message' | 'reaction' | 'system'; body: string; created_at: string }
type Author = { username: string; avatar_color: string }

const REACTIONS = ['👍', '😂', '😮', '😢', '🔥', '👏']
const COLUMNS = 'id, user_id, kind, body, created_at'

type Props = {
  roomId: string
  userId: string
  onReaction: (emoji: string, userId: string) => void
  onSystem: () => void
}

export default function ChatPanel({ roomId, userId, onReaction, onSystem }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [authors, setAuthors] = useState<Record<string, Author>>({})
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const stick = useRef(true)
  const known = useRef<Set<string>>(new Set())
  const reactionRef = useRef(onReaction)
  const systemRef = useRef(onSystem)
  reactionRef.current = onReaction
  systemRef.current = onSystem

  const loadAuthors = useCallback(async (ids: (string | null)[]) => {
    const missing = Array.from(new Set(ids.filter((id): id is string => Boolean(id) && !known.current.has(id as string))))
    if (missing.length === 0) return
    missing.forEach((id) => known.current.add(id))
    const { data } = await getSupabase()!.from('profiles').select('id, username, avatar_color').in('id', missing)
    if (!data) return
    setAuthors((prev) => {
      const next = { ...prev }
      for (const p of data as { id: string; username: string; avatar_color: string }[]) {
        next[p.id] = { username: p.username, avatar_color: p.avatar_color }
      }
      return next
    })
  }, [])

  const merge = useCallback(
    (incoming: Msg[]) => {
      setMsgs((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]))
        incoming.forEach((m) => map.set(m.id, m))
        return Array.from(map.values()).sort((a, b) => a.id - b.id).slice(-200)
      })
      loadAuthors(incoming.map((m) => m.user_id))
    },
    [loadAuthors]
  )

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false

    const fetchLatest = async () => {
      const { data } = await supabase.from('chat_messages').select(COLUMNS).eq('room_id', roomId).order('id', { ascending: false }).limit(50)
      if (!cancelled && data) merge((data as Msg[]).reverse())
    }

    const channel = supabase
      .channel(`chat-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const m = payload.new as Msg
          merge([m])
          if (m.kind === 'reaction' && m.user_id && m.user_id !== userId) reactionRef.current(m.body, m.user_id)
          if (m.kind === 'system') systemRef.current()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchLatest() // also after a reconnect, so nothing is missed
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId, userId, merge])

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [msgs])

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    if (body.length > 500) return setError('Messages can be up to 500 characters.')
    setError('')
    setBusy(true)
    const { data, error: err } = await getSupabase()!
      .from('chat_messages')
      .insert({ room_id: roomId, user_id: userId, kind: 'message', body })
      .select(COLUMNS)
      .single()
    setBusy(false)
    if (err) return setError(friendlyError(err.message))
    setText('')
    stick.current = true
    if (data) merge([data as Msg])
  }

  async function sendReaction(emoji: string) {
    setError('')
    const { error: err } = await getSupabase()!.from('chat_messages').insert({ room_id: roomId, user_id: userId, kind: 'reaction', body: emoji })
    if (err) return setError(friendlyError(err.message))
    reactionRef.current(emoji, userId)
  }

  const visible = msgs.filter((m) => m.kind !== 'reaction')

  return (
    <section className="flex h-[26rem] flex-col rounded-2xl border border-line bg-card" aria-label="Room chat">
      <h2 className="border-b border-line px-5 py-3 font-bold">Chat</h2>
      <ul
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {visible.length === 0 && <li className="py-6 text-center text-sm text-muted">No messages yet. Say hello.</li>}
        {visible.map((m) => {
          if (m.kind === 'system') return <li key={m.id} className="text-center text-xs text-muted">{m.body}</li>
          const a = m.user_id ? authors[m.user_id] : undefined
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          return (
            <li key={m.id} className="flex gap-2">
              <Avatar name={a?.username ?? '?'} color={a?.avatar_color ?? '#333333'} size={28} />
              <div className="min-w-0">
                <p className="text-xs">
                  <span className="font-semibold">{a?.username ?? '...'}</span>
                  <span className="ml-2 text-muted">{time}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-line p-3">
        <div className="mb-2 flex gap-1" role="group" aria-label="Send a reaction">
          {REACTIONS.map((r) => (
            <button key={r} onClick={() => sendReaction(r)} className={`${outlineBtn} !px-2.5 !py-1.5 !text-base`} aria-label={`React with ${r}`}>
              {r}
            </button>
          ))}
        </div>
        <form onSubmit={sendMessage} className="flex gap-2" noValidate>
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <input id="chat-input" className={`${inputClass} !mt-0`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" maxLength={500} autoComplete="off" />
          <button type="submit" disabled={busy || !text.trim()} className={`${primaryBtn} !px-4`}>Send</button>
        </form>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </section>
  )
}
