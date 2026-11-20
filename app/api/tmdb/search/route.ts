import { AppError, bad, jsonError } from '../../../../lib/server/errors'
import { limitPerMinute } from '../../../../lib/server/memory-limit'
import { clientIp } from '../../../../lib/server/request'
import { searchTitles } from '../../../../lib/server/tmdb'

export const runtime = 'nodejs'

// Public search. Answers are cached at the edge for an hour, so repeated searches cost nothing.
export async function GET(req: Request) {
  try {
    limitPerMinute(`tmdb-search:${clientIp(req)}`, 60)
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    if (q.length < 2 || q.length > 100) throw bad('Type at least 2 letters to search.')
    const page = Number(url.searchParams.get('page') ?? '1')
    if (!Number.isInteger(page) || page < 1 || page > 20) throw bad('That results page does not exist.')
    const data = await searchTitles(q, page)
    return Response.json(data, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch (e) {
    return jsonError(e instanceof AppError ? e : e)
  }
}
