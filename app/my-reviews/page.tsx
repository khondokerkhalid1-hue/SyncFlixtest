'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ReviewsShell from '../../components/reviews/ReviewsShell'
import { getSupabase } from '../../lib/supabase'
import { CATEGORY_LABEL, reviewPath, tierInfo, tmdbImage, type Category, type MediaType } from '../../lib/reviews'
import { outlineBtn } from '../../lib/ui'

type Mine = {
  id: string
  provider_id: number
  media_type: MediaType
  content_category: Category
  title: string
  poster_path: string | null
  release_date: string | null
  total_votes: number
  average_rating: number | null
  final_tier: number | null
  my_rating: number
  my_tier: number
  voted_at: string
}

const PAGE = 12

function MyReviews() {
  const [items, setItems] = useState<Mine[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    const { data, error: err } = await getSupabase()!.rpc('review_my', { p_limit: PAGE, p_offset: offset })
    setLoading(false)
    if (err) return setError('Could not load your reviews. Please refresh.')
    const rows = (data ?? []) as Mine[]
    setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]))
    setMore(rows.length === PAGE)
  }, [])

  useEffect(() => {
    load(0)
  }, [load])

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">My reviews</h1>
      <p className="mt-2 text-muted">Everything you have rated. Open a title to change your vote.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {loading && items.length === 0 ? (
        <p className="mt-6 text-sm text-muted" role="status">Loading...</p>
      ) : items.length === 0 && !error ? (
        <div className="mt-6 rounded-2xl border border-line bg-card p-8 text-center">
          <p className="font-semibold">You have not rated anything yet</p>
          <Link href="/reviews/search" className={`${outlineBtn} mt-4`}>Find a title to rate</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((r) => {
            const mine = tierInfo(r.my_tier)
            const verdict = tierInfo(r.final_tier)
            const poster = tmdbImage(r.poster_path, 'w185')
            return (
              <li key={r.id} className="flex gap-4 rounded-2xl border border-line bg-card p-3">
                <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-surface sm:w-20">
                  {poster && <img src={poster} alt="" width={185} height={278} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABEL[r.content_category]}, voted {new Date(r.voted_at).toLocaleDateString()}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold">{r.my_rating}/10</span>
                    {mine && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${mine.badge}`}>{mine.name}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Community: {verdict ? verdict.name : 'no verdict yet'}, {r.total_votes} {r.total_votes === 1 ? 'vote' : 'votes'}
                  </p>
                  <Link href={reviewPath(r.media_type, r.provider_id)} className="mt-2 inline-block text-xs font-semibold underline underline-offset-2 hover:text-primary">Open and edit my vote</Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {more && <button onClick={() => load(items.length)} disabled={loading} className={`${outlineBtn} mt-6`}>{loading ? 'Loading...' : 'Load more'}</button>}
    </>
  )
}

export default function MyReviewsPage() {
  return (
    <ReviewsShell requireLogin>
      <MyReviews />
    </ReviewsShell>
  )
}
