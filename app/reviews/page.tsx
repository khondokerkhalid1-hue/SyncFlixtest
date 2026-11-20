'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReviewsShell from '../../components/reviews/ReviewsShell'
import Section from '../../components/reviews/Section'
import { inputClass, primaryBtn } from '../../lib/ui'

const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv_series', label: 'TV Series' },
  { key: 'anime', label: 'Anime' },
]

function Home() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string | null>(null)

  function onSearch(e: FormEvent) {
    e.preventDefault()
    router.push(`/reviews/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Community Reviews</h1>
      <p className="mt-2 max-w-2xl text-muted">Rate movies, TV series and anime, and see what the community thinks. One page per title, one vote per person.</p>

      <form onSubmit={onSearch} className="mt-6 flex max-w-xl gap-2" role="search">
        <label htmlFor="home-search" className="sr-only">Search movies, series and anime</label>
        <input id="home-search" className={`${inputClass} !mt-0`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies, series and anime" autoComplete="off" />
        <button type="submit" className={primaryBtn}>Search</button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => (
          <button key={f.label} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${filter === f.key ? 'border-primary bg-primary text-white' : 'border-line bg-card text-muted hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <Section key={`recent-${filter}`} title="Recently added" sort="recent" category={filter} />
      <Section key={`voted-${filter}`} title="Most voted" sort="most_voted" category={filter} />
      <Section key={`top-${filter}`} title="Top rated" note="Only titles with at least 3 votes, so one vote cannot take the top spot." sort="top_rated" category={filter} />
      <Section key={`must-${filter}`} title="Community must-watch" note="Titles whose community verdict is Awesome / Must Watch or Watch Before You Die." sort="must_watch" category={filter} />
    </>
  )
}

export default function ReviewsPage() {
  return (
    <ReviewsShell>
      <Home />
    </ReviewsShell>
  )
}
