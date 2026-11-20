import { TIERS, type ReviewRow } from '../../lib/reviews'

export default function TierBars({ r }: { r: ReviewRow }) {
  const counts = [r.tier_1_count, r.tier_2_count, r.tier_3_count, r.tier_4_count]
  const pcts = [r.tier_1_percentage, r.tier_2_percentage, r.tier_3_percentage, r.tier_4_percentage]
  return (
    <ul className="space-y-3" aria-label="Community tier distribution">
      {TIERS.map((t, i) => {
        const winner = r.final_tier === t.tier
        return (
          <li key={t.tier}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={winner ? 'font-bold' : 'text-muted'}>
                {t.name}
                {winner && <span className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.badge}`}>Verdict</span>}
              </span>
              <span className={winner ? 'font-bold' : 'text-muted'}>
                {pcts[i]}% ({counts[i]} {counts[i] === 1 ? 'vote' : 'votes'})
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div className={`h-full rounded-full ${t.bar} ${winner ? '' : 'opacity-50'}`} style={{ width: `${pcts[i]}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
