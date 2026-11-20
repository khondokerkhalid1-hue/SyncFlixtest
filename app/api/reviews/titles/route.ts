import { jsonError, jsonOk } from '../../../../lib/server/errors'
import { readJson, requireUser } from '../../../../lib/server/request'
import { createTitle } from '../../../../lib/server/reviews'
import { supabaseStore } from '../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Create the permanent review page for a title. Requires a signed-in person. If the page already
// exists (even if someone created it a split second ago) the existing page is returned.
export async function POST(req: Request) {
  try {
    const store = supabaseStore()
    const user = await requireUser(req)
    const body = await readJson(req)
    const result = await createTitle(store, user.id, { media_type: body.media_type, tmdb_id: body.tmdb_id, category: body.category })
    return jsonOk(result, result.created ? 201 : 200)
  } catch (e) {
    return jsonError(e)
  }
}
