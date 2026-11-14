'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '../../../components/AppShell'
import { getSupabase } from '../../../lib/supabase'
import { friendlyError, outlineBtn } from '../../../lib/ui'

function JoinByLink() {
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = String(params.code ?? '').trim().toUpperCase()
    getSupabase()
      ?.rpc('join_room', { p_code: code })
      .then(({ data, error: err }) => {
        if (err || !data) setError(friendlyError(err?.message ?? ''))
        else router.replace(`/room/${data}`)
      })
  }, [params.code, router])

  return (
    <div className="mx-auto max-w-md text-center">
      {error ? (
        <>
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
          <Link href="/join" className={`${outlineBtn} mt-5`}>Enter a code instead</Link>
        </>
      ) : (
        <p className="text-sm text-muted" role="status">Joining the room...</p>
      )}
    </div>
  )
}

export default function JoinByLinkPage() {
  return (
    <AppShell>
      <JoinByLink />
    </AppShell>
  )
}
