'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReviewsShell from '../../../components/reviews/ReviewsShell'
import { getSupabase } from '../../../lib/supabase'
import { CATEGORY_LABEL, reviewPath, tierInfo, tmdbImage, type ReviewRow, type SearchHit } from '../../../lib/reviews'
import { inputClass, outlineBtn } from '../../../lib/ui'

type Answer = { page: number; total_pages: number; results: SearchHit[]; error?: { code: string; message: string } }

function SearchView() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [pages, setPages] = useState({ page: 1, total: 1 })
  const [existing, setExisting] = useState<Record<string, ReviewRow>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  const run = useCallback(async (query: string, page: number, append: boolean) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setStatus('loading')
    setError('')
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal })
      const json = (await res.json()) as Answer & { error?: { message: string } }
      if (!res.ok) {
        setError(json.error?.message ?? 'Search did not work. Please try again.')
        setStatus('error')
        return
      }
      setResults((prev) => (append ? [...prev, ...json.results] : json.results))
      setPages({ page: json.page, total: json.total_pages })
      setStatus('done')
      // Which of these titles already have a community page? One database call for the whole batch.
      const supabase = getSupabase()
      if (supabase && json.results.length > 0) {
        const { data } = await supabase.rpc('review_lookup', { p_media: json.results.map((r) => r.media_type), p_ids: json.results.map((r) => r.id) })
        if (!controller.signal.aborted) {
          setExisting((prev) => {
            const next = append ? { ...prev } : {}
            for (const row of (data ?? []) as ReviewRow[]) next[`${row.media_type}:${row.provider_id}`] = row
            return next
          })
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError('Could not reach the search. Check your connection.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q')
    if (initial) setQ(initial)
  }, [])

  // Wait until the person stops typing before asking TMDB (saves requests).
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      abort.current?.abort()
      setResults([])
      setStatus('idle')
      return
    }
    const timer = setTimeout(() => {
      window.history.replaceState(null, '', `/reviews/search?q=${encodeURIComponent(query)}`)
      run(query, 1, false)
    }, 400)
    return () => clearTimeout(timer)
  }, [q, run])

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
      <p className="mt-2 text-muted">Find a movie, TV series or anime. Open it to see the community verdict or to start its review page.</p>
      <div className="mt-6 max-w-xl">
        <label htmlFor="search" className="sr-only">Search movies, series and anime</label>
        <input id="search" type="search" className={`${inputClass} !mt-0`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a title, for example Heart of the Beast" autoComplete="off" />
      </div>

      {status === 'error' && <p role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {status === 'loading' && results.length === 0 && <p className="mt-6 text-sm text-muted" role="status">Searching...</p>}
      {status === 'done' && results.length === 0 && <p className="mt-6 text-sm text-muted">No results for &quot;{q.trim()}&quot;. Check the spelling or try a shorter title.</p>}

      {results.length > 0 && (
        <ul className="mt-6 space-y-3">
          {results.map((r) => {
            const page = existing[`${r.media_type}:${r.id}`]
            const tier = tierInfo(page?.final_tier)
            const poster = tmdbImage(r.poster_path, 'w185')
            return (
              <li key={`${r.media_type}:${r.id}`}>
                <Link href={reviewPath(r.media_type, r.id)} className="flex gap-4 rounded-2xl border border-line bg-card p-3 transition hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-surface sm:w-20">
                    {poster && <img src={poster} alt="" width={185} height={278} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABEL[page?.content_category ?? r.suggested_category]}{r.year ? `, ${r.year}` : ''}</p>
                    {r.overview && <p className="mt-2 line-clamp-2 text-sm text-muted">{r.overview}</p>}
                    <p className="mt-2 text-xs">
                      {page ? (
                        <>
                          Review page exists, {page.total_votes} {page.total_votes === 1 ? 'vote' : 'votes'}
                          {tier && <span className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tier.badge}`}>{tier.name}</span>}
                        </>
                      ) : (
                        <span className="text-muted">No review page yet. Be the first.</span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {status === 'done' && pages.page < pages.total && (
        <button onClick={() => run(q.trim(), pages.page + 1, true)} className={`${outlineBtn} mt-6`}>Load more</button>
      )}
    </>
  )
}

export default function SearchPage() {
  return (
    <ReviewsShell>
      <SearchView />
    </ReviewsShell>
  )
}
