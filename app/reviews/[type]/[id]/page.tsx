'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ReviewsShell from '../../../../components/reviews/ReviewsShell'
import TierBars from '../../../../components/reviews/TierBars'
import VotePanel from '../../../../components/reviews/VotePanel'
import { useAuth } from '../../../../components/AuthProvider'
import { getSupabase } from '../../../../lib/supabase'
import { api, ApiFailure } from '../../../../lib/drive-client'
import { CATEGORY_LABEL, tierInfo, tmdbImage, type Category, type MediaType, type ReviewRow, type TitleDetails } from '../../../../lib/reviews'
import { outlineBtn } from '../../../../lib/ui'

type Vote = { personal_rating: number; tier: number }

const tieNote = {
  clear: '',
  tie_broken_by_rating: 'Closely contested: tied on votes, decided by the higher average personal rating.',
  tie_broken_by_order: 'Closely contested: tied on votes and ratings.',
} as const

function runtime(minutes: number | null) {
  if (!minutes) return null
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`
}

function TitleView() {
  const params = useParams<{ type: string; id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const type = String(params.type)
  const idText = String(params.id)
  const valid = (type === 'movie' || type === 'tv') && /^\d{1,9}$/.test(idText) && Number(idText) > 0
  const media = type as MediaType
  const tmdbId = Number(idText)

  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [review, setReview] = useState<ReviewRow | null>(null)
  const [myVote, setMyVote] = useState<Vote | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')

  const fetchReview = useCallback(async (): Promise<ReviewRow | null> => {
    const { data } = await getSupabase()!.rpc('review_get', { p_media_type: media, p_provider_id: tmdbId })
    return ((data ?? [])[0] as ReviewRow | undefined) ?? null
  }, [media, tmdbId])

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    async function load() {
      const [d, r] = await Promise.all([
        fetch(`/api/tmdb/${media}/${tmdbId}`).then(async (res) => ({ ok: res.ok, json: await res.json().catch(() => null) })).catch(() => null),
        getSupabase() ? fetchReview() : Promise.resolve(null),
      ])
      if (cancelled) return
      if (d?.ok) {
        setDetails(d.json as TitleDetails)
        setCategory((d.json as TitleDetails).suggested_category)
      } else {
        setDetailsError(d?.json?.error?.message ?? 'Could not load the title details.')
      }
      setReview(r)
      if (r && user) {
        const { data } = await getSupabase()!.from('review_votes').select('personal_rating, tier').eq('content_id', r.id).maybeSingle()
        if (!cancelled) setMyVote((data as Vote | null) ?? null)
      } else {
        setMyVote(null)
      }
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [valid, media, tmdbId, user, fetchReview])

  function goLogin() {
    try {
      sessionStorage.setItem('syncflix_next', window.location.pathname)
    } catch {}
    router.push('/login')
  }

  // Saves the person's vote. If this title has no page yet, the page is created first (by the server,
  // using TMDB's own details), so the creator becomes the first voter and nobody owns the page.
  async function saveVote(rating: number, tier: number): Promise<string | null> {
    const supabase = getSupabase()
    if (!supabase || !user) return 'Please log in again.'
    let current = review
    if (!current) {
      try {
        const res = await api<{ created: boolean }>('/api/reviews/titles', { method: 'POST', body: { media_type: media, tmdb_id: tmdbId, category: category ?? (media === 'movie' ? 'movie' : 'tv_series') } })
        if (!res.created) setNotice('Someone created this page a moment ago. Your vote is added to it.')
      } catch (e) {
        return e instanceof ApiFailure ? e.message : 'Could not create the page.'
      }
      current = await fetchReview()
      if (!current) return 'The page could not be loaded. Please try again.'
    }
    const { error } = await supabase.rpc('save_review_vote', { p_content_id: current.id, p_rating: rating, p_tier: tier })
    if (error) return /too fast/i.test(error.message) ? 'You are voting too fast. Wait a moment and try again.' : 'Could not save your vote. Please try again.'
    setReview(await fetchReview())
    setMyVote({ personal_rating: rating, tier })
    return null
  }

  if (!valid) {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-extrabold">Title not found</h1>
        <p className="mt-2 text-sm text-muted">This address is not a valid movie or series.</p>
        <Link href="/reviews/search" className={`${outlineBtn} mt-5`}>Search titles</Link>
      </div>
    )
  }
  if (!loaded) return <p className="text-sm text-muted" role="status">Loading...</p>
  if (!details && !review) {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-extrabold">Could not open this title</h1>
        <p role="alert" className="mt-2 text-sm text-red-300">{detailsError}</p>
        <Link href="/reviews/search" className={`${outlineBtn} mt-5`}>Back to search</Link>
      </div>
    )
  }

  const title = details?.title ?? review!.title
  const poster = tmdbImage(details?.poster_path ?? review?.poster_path, 'w500')
  const backdrop = tmdbImage(details?.backdrop_path ?? review?.backdrop_path, 'w1280')
  const overview = details?.overview ?? review?.overview
  const categoryNow: Category = review?.content_category ?? category ?? (media === 'movie' ? 'movie' : 'tv_series')
  const date = details?.release_date ?? review?.release_date
  const meta = [
    date ? date.slice(0, 4) : null,
    media === 'movie' ? runtime(details?.runtime_minutes ?? null) : [details?.seasons ? `${details.seasons} ${details.seasons === 1 ? 'season' : 'seasons'}` : null, details?.episodes ? `${details.episodes} episodes` : null, runtime(details?.runtime_minutes ?? null) ? `${runtime(details?.runtime_minutes ?? null)} per episode` : null].filter(Boolean).join(', ') || null,
    details?.original_language ? details.original_language.toUpperCase() : null,
    details?.status,
  ].filter(Boolean)
  const verdict = tierInfo(review?.final_tier)

  return (
    <>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-card">
        {backdrop && <img src={backdrop} alt="" width={1280} height={720} decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
        <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:p-8">
          <div className="aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-2xl bg-surface sm:w-52">
            {poster ? <img src={poster} alt={`Poster of ${title}`} width={500} height={750} decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">No poster</div>}
          </div>
          <div className="min-w-0 flex-1">
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold">{CATEGORY_LABEL[categoryNow]}</span>
            <h1 className="mt-3 break-words text-3xl font-extrabold tracking-tight">{title}</h1>
            {details?.original_title && details.original_title !== title && <p className="mt-1 text-sm text-muted">Original title: {details.original_title}</p>}
            {meta.length > 0 && <p className="mt-2 text-sm text-muted">{meta.join(', ')}</p>}
            {details && details.genres.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Genres">
                {details.genres.map((g) => <li key={g} className="rounded-full bg-surface px-3 py-1 text-xs">{g}</li>)}
              </ul>
            )}
            {overview ? <p className="mt-4 max-w-2xl text-sm leading-relaxed">{overview}</p> : <p className="mt-4 text-sm text-muted">Synopsis not available.</p>}
            {details && details.makers.length > 0 && <p className="mt-3 text-sm"><span className="text-muted">{details.makers_label}: </span>{details.makers.join(', ')}</p>}
            {details && details.cast.length > 0 && (
              <p className="mt-2 text-sm"><span className="text-muted">Cast: </span>{details.cast.slice(0, 10).map((c) => c.name).join(', ')}</p>
            )}
            {details?.trailer_key && (
              <a href={`https://www.youtube.com/watch?v=${details.trailer_key}`} target="_blank" rel="noopener noreferrer" className={`${outlineBtn} mt-4`}>Watch trailer on YouTube</a>
            )}
            {!details && <p className="mt-4 text-xs text-muted">More details from TMDB are not available right now{detailsError ? `: ${detailsError}` : '.'}</p>}
          </div>
        </div>
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-line bg-card p-6" aria-label="Community results">
          {review ? (
            <>
              <h2 className="text-lg font-bold">Community Final Verdict</h2>
              {verdict && review.total_votes > 0 ? (
                <>
                  <p className={`mt-3 inline-block rounded-2xl border px-4 py-2 text-xl font-extrabold ${verdict.badge}`}>{verdict.name}</p>
                  {review.tie_status && tieNote[review.tie_status] && <p className="mt-2 text-xs text-muted">{tieNote[review.tie_status]}</p>}
                </>
              ) : (
                <p className="mt-3 text-xl font-extrabold text-muted">No Community Verdict Yet</p>
              )}
              <dl className="mt-4 flex gap-8">
                <div>
                  <dt className="text-xs text-muted">Average rating</dt>
                  <dd className="text-2xl font-extrabold">{review.average_rating !== null ? Number(review.average_rating).toFixed(1) : '-'}<span className="text-sm font-medium text-muted">/10</span></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Total votes</dt>
                  <dd className="text-2xl font-extrabold">{review.total_votes}</dd>
                </div>
              </dl>
              <div className="mt-6"><TierBars r={review} /></div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">No review page yet</h2>
              <p className="mt-2 text-sm text-muted">This title has no community page. Give your rating below to create it. It will belong to the whole community, and you will be its first voter.</p>
              {details && details.allowed_categories.length > 1 && (
                <fieldset className="mt-4">
                  <legend className="text-sm font-medium">This title is</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {details.allowed_categories.map((c) => (
                      <label key={c} className="cursor-pointer">
                        <input type="radio" name="category" checked={category === c} onChange={() => setCategory(c)} className="peer sr-only" />
                        <span className="block rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary">{CATEGORY_LABEL[c]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {!details && <p role="alert" className="mt-3 text-sm text-red-300">A page can only be created when TMDB details are available. {detailsError}</p>}
            </>
          )}
        </section>

        {(review || details) && (
          <VotePanel
            key={`${review?.id ?? 'new'}-${myVote?.tier ?? 0}-${myVote?.personal_rating ?? 0}`}
            signedIn={Boolean(user)}
            existing={myVote}
            submitLabel={review ? 'Submit my vote' : 'Create page and submit my vote'}
            onLogin={goLogin}
            onSave={saveVote}
          />
        )}
      </div>
    </>
  )
}

export default function TitlePage() {
  return (
    <ReviewsShell>
      <TitleView />
    </ReviewsShell>
  )
}
