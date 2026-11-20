'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../../lib/supabase'
import { outlineBtn } from '../../lib/ui'
import type { ReviewRow } from '../../lib/reviews'
import ReviewCard from './ReviewCard'

const PAGE = 6

// One list on the Reviews home page (recent, most voted, ...), loaded a few at a time from the database.
export default function Section({ title, note, sort, category }: { title: string; note?: string; sort: string; category: string | null }) {
  const [items, setItems] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (offset: number) => {
      const supabase = getSupabase()
      if (!supabase) {
        setError('SyncFlix is not connected to its database yet.')
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error: err } = await supabase.rpc('review_list', { p_category: category, p_sort: sort, p_limit: PAGE, p_offset: offset, p_min_votes: 3 })
      setLoading(false)
      if (err) return setError('Could not load this list. Please refresh.')
      const rows = (data ?? []) as ReviewRow[]
      setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]))
      setMore(rows.length === PAGE)
    },
    [category, sort]
  )

  useEffect(() => {
    setError('')
    load(0)
  }, [load])

  return (
    <section className="mt-10" aria-label={title}>
      <h2 className="text-xl font-bold">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>
      ) : loading && items.length === 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" role="status" aria-label="Loading">
          {Array.from({ length: PAGE }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-card" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {items.map((r) => <ReviewCard key={r.id} r={r} />)}
          </div>
          {more && (
            <button onClick={() => load(items.length)} disabled={loading} className={`${outlineBtn} mt-5`}>
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </section>
  )
}
