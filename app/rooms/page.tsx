'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppShell from '../../components/AppShell'
import { getSupabase } from '../../lib/supabase'
import { friendlyError, primaryBtn } from '../../lib/ui'
import type { ExploreRoom } from '../../lib/types'

function ExploreView() {
  const router = useRouter()
  const [rooms, setRooms] = useState<ExploreRoom[] | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState('')

  useEffect(() => {
    getSupabase()
      ?.rpc('explore_rooms')
      .then(({ data, error: err }) => {
        if (err) setError('Could not load rooms. Please refresh.')
        else setRooms((data ?? []) as ExploreRoom[])
      })
  }, [])

  async function join(room: ExploreRoom) {
    setError('')
    setJoining(room.id)
    const { data, error: err } = await getSupabase()!.rpc('join_room', { p_code: room.code })
    setJoining('')
    if (err || !data) return setError(friendlyError(err?.message ?? ''))
    router.push(`/room/${data}`)
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Explore public rooms</h1>
      <p className="mt-2 text-muted">Open rooms anyone can join. Private rooms never appear here.</p>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {rooms === null && !error ? (
        <p className="mt-8 text-sm text-muted" role="status">Loading rooms...</p>
      ) : rooms && rooms.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-card p-8 text-center">
          <p className="font-semibold">No public rooms yet</p>
          <p className="mt-1 text-sm text-muted">Be the first to open one.</p>
          <Link href="/rooms/new" className={`${primaryBtn} mt-5`}>Create a room</Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rooms ?? []).map((r) => {
            const full = Number(r.member_count) >= r.max_members
            return (
              <li key={r.id} className="flex flex-col rounded-2xl border border-line bg-card p-5">
                <p className="font-bold">{r.name}</p>
                <p className="mt-1 text-xs text-muted">Hosted by {r.host_username}</p>
                {r.description && <p className="mt-3 line-clamp-3 text-sm text-muted">{r.description}</p>}
                <div className="mt-auto flex items-center justify-between pt-5">
                  <span className="text-xs text-muted">{Number(r.member_count)} of {r.max_members} people</span>
                  <button onClick={() => join(r)} disabled={full || joining === r.id} className={`${primaryBtn} !px-4 !py-2`}>
                    {full ? 'Full' : joining === r.id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default function ExplorePage() {
  return (
    <AppShell>
      <ExploreView />
    </AppShell>
  )
}
