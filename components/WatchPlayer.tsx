'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Logo from './Logo'
import { formatBytes } from '../lib/drive-client'

type Info = { title: string; size_bytes: number }

export default function WatchPlayer({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [problem, setProblem] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/v/${token}/info`)
      .then(async (r) => {
        const j = await r.json()
        if (r.ok) setInfo(j)
        else setProblem(j?.error?.message ?? 'This video is not available.')
      })
      .catch(() => setProblem('Could not load the video. Check your connection.'))
      .finally(() => setLoading(false))
  }, [token])

  // When playback fails, ask the server WHY (deleted file, Google limits, format) instead of showing a blank player.
  async function explain() {
    try {
      const r = await fetch(`/api/v/${token}/info?check=1`)
      const j = await r.json()
      setProblem(r.ok ? (j.note ?? 'The video could not be played.') : (j?.error?.message ?? 'The video could not be played.'))
    } catch {
      setProblem('The video could not be played. Check your connection.')
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/" aria-label="SyncFlix home" className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Logo />
      </Link>

      {loading && <p className="mt-10 text-sm text-muted" role="status">Loading...</p>}

      {info && (
        <>
          <h1 className="mt-8 break-words text-2xl font-extrabold tracking-tight">{info.title || 'Video'}</h1>
          <p className="mt-1 text-sm text-muted">{formatBytes(info.size_bytes)}, shared from Google Drive through SyncFlix</p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-black">
            {/* Videos come from the owner's Google Drive, which gives us no caption files. */}
            <video className="aspect-video w-full" controls playsInline preload="metadata" src={`/api/v/${token}/stream`} onError={explain} />
          </div>
        </>
      )}

      {problem && (
        <p role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{problem}</p>
      )}
    </main>
  )
}
