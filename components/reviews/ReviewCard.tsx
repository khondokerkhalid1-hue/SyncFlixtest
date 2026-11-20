import Link from 'next/link'
import { CATEGORY_LABEL, reviewPath, tierInfo, tmdbImage, type ReviewRow } from '../../lib/reviews'

export type CardRow = Pick<ReviewRow, 'provider_id' | 'media_type' | 'content_category' | 'title' | 'poster_path' | 'release_date' | 'final_tier' | 'average_rating' | 'total_votes'>

export default function ReviewCard({ r }: { r: CardRow }) {
  const poster = tmdbImage(r.poster_path, 'w342')
  const tier = tierInfo(r.final_tier)
  return (
    <Link href={reviewPath(r.media_type, r.provider_id)} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="relative aspect-[2/3] bg-surface">
        {poster ? (
          <img src={poster} alt="" width={342} height={513} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted">No poster</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">{CATEGORY_LABEL[r.content_category]}</span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold">{r.title}</p>
        <p className="mt-0.5 text-xs text-muted">{r.release_date ? r.release_date.slice(0, 4) : 'Date unknown'}</p>
        {tier ? (
          <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tier.badge}`}>{tier.name}</span>
        ) : (
          <p className="mt-2 text-xs text-muted">No verdict yet</p>
        )}
        <p className="mt-1 text-xs text-muted">
          {r.average_rating !== null ? `${Number(r.average_rating).toFixed(1)}/10` : 'Not rated'}, {r.total_votes} {r.total_votes === 1 ? 'vote' : 'votes'}
        </p>
      </div>
    </Link>
  )
}
