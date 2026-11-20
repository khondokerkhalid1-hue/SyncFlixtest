'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TIERS, tierInfo } from '../../lib/reviews'
import { outlineBtn, primaryBtn } from '../../lib/ui'

type Vote = { personal_rating: number; tier: number }

type Props = {
  signedIn: boolean
  existing: Vote | null
  submitLabel: string
  onLogin: () => void
  onSave: (rating: number, tier: number) => Promise<string | null> // returns an error sentence, or null when saved
}

export default function VotePanel({ signedIn, existing, submitLabel, onLogin, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState<number | null>(existing?.personal_rating ?? null)
  const [tier, setTier] = useState<number | null>(existing?.tier ?? null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!signedIn) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6" aria-label="Your vote">
        <h2 className="text-lg font-bold">Your vote</h2>
        <p className="mt-2 text-sm text-muted">Log in to give this title your rating and choose a tier. Everyone can see the community results.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={onLogin} className={primaryBtn}>Log in to vote</button>
          <Link href="/signup" className={outlineBtn}>Create an account</Link>
        </div>
      </section>
    )
  }

  if (existing && !editing) {
    const t = tierInfo(existing.tier)
    return (
      <section className="rounded-2xl border border-line bg-card p-6" aria-label="Your vote">
        <h2 className="text-lg font-bold">Your vote</h2>
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-2xl font-extrabold">{existing.personal_rating}<span className="text-base font-medium text-muted">/10</span></span>
          {t && <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${t.badge}`}>{t.name}</span>}
        </p>
        <button onClick={() => setEditing(true)} className={`${outlineBtn} mt-4`}>Edit my vote</button>
      </section>
    )
  }

  async function submit() {
    if (!rating || !tier) return setError('Choose a rating from 1 to 10 and one tier.')
    setError('')
    setBusy(true)
    const problem = await onSave(rating, tier)
    setBusy(false)
    if (problem) return setError(problem)
    setEditing(false)
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-6" aria-label="Your vote">
      <h2 className="text-lg font-bold">{existing ? 'Edit your vote' : 'Your vote'}</h2>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Your personal rating (1 to 10)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                {n}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Choose one tier</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIERS.map((t) => (
            <label key={t.tier} className="cursor-pointer" aria-label={`${t.name}. ${t.meaning}`}>
              <input type="radio" name="tier" value={t.tier} checked={tier === t.tier} onChange={() => setTier(t.tier)} className="peer sr-only" />
              <span className={`block rounded-xl border p-3 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${tier === t.tier ? t.ring : 'border-line bg-surface'}`}>
                <span className="block font-semibold">{t.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.meaning}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={submit} disabled={busy} className={primaryBtn}>{busy ? 'Saving...' : existing ? 'Save changes' : submitLabel}</button>
        {existing && <button onClick={() => { setEditing(false); setRating(existing.personal_rating); setTier(existing.tier) }} className={outlineBtn}>Cancel</button>}
      </div>
    </section>
  )
}
