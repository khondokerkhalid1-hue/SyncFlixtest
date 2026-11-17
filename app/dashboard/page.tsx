'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '../../components/AppShell'
import { useAuth } from '../../components/AuthProvider'
import { getSupabase } from '../../lib/supabase'
import { primaryBtn, outlineBtn } from '../../lib/ui'

type MyRoom = { id: string; name: string; is_public: boolean; host_id: string }

function DashboardView() {
  const { user, profile } = useAuth()
  const [rooms, setRooms] = useState<MyRoom[] | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase || !user) return
    supabase
      .from('room_members')
      .select('rooms(id, name, is_public, host_id)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as { rooms: MyRoom | MyRoom[] | null }[])
          .map((row) => (Array.isArray(row.rooms) ? row.rooms[0] : row.rooms))
          .filter((r): r is MyRoom => Boolean(r))
        setRooms(list)
      })
  }, [user])

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome, {profile?.username ?? 'friend'}</h1>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/rooms/new" className={primaryBtn}>Create a room</Link>
        <Link href="/rooms" className={outlineBtn}>Explore public rooms</Link>
        <Link href="/join" className={outlineBtn}>Join with a code</Link>
        <Link href="/drive" className={outlineBtn}>My video links</Link>
      </div>

      <h2 className="mt-12 text-xl font-bold">Your rooms</h2>
      {rooms === null ? (
        <p className="mt-4 text-sm text-muted" role="status">Loading your rooms...</p>
      ) : rooms.length === 0 ? (
        <p className="mt-4 max-w-md text-sm text-muted">You are not in any room yet. Create one or join a friend's room with their code.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link href={`/room/${r.id}`} className="block rounded-2xl border border-line bg-card p-5 transition hover:border-primary/60">
                <p className="font-bold">{r.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {r.is_public ? 'Public' : 'Private'}
                  {r.host_id === user?.id ? ', you are the host' : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  )
}
