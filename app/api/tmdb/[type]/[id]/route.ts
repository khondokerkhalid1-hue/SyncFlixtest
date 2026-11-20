import { bad, jsonError } from '../../../../../lib/server/errors'
import { limitPerMinute } from '../../../../../lib/server/memory-limit'
import { clientIp } from '../../../../../lib/server/request'
import { supabaseStore } from '../../../../../lib/server/store'
import { getDetails, isMediaType, isTmdbId } from '../../../../../lib/server/tmdb'

export const runtime = 'nodejs'

// Full details for one title (cast, trailer, runtime ...), fetched from TMDB and cached for a day.
// Nothing here is stored in our database except the few list fields, refreshed when they are over 90 days old.
export async function GET(req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  try {
    const { type, id } = await ctx.params
    limitPerMinute(`tmdb-details:${clientIp(req)}`, 60)
    if (!isMediaType(type) || !isTmdbId(id)) throw bad('That title address is not valid.')
    const details = await getDetails(type, Number(id))
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        await supabaseStore().refreshReviewTitle({
          providerId: details.id, mediaType: type, title: details.title, posterPath: details.poster_path,
          backdropPath: details.backdrop_path, releaseDate: details.release_date, overview: details.overview,
        })
      }
    } catch {
      // keeping stored details fresh is a bonus; the page works without it
    }
    return Response.json(details, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  } catch (e) {
    return jsonError(e)
  }
}
