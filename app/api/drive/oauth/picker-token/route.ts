import { jsonError, jsonOk } from '../../../../../lib/server/errors'
import { getAccessToken } from '../../../../../lib/server/google-auth'
import { limit, requireUser } from '../../../../../lib/server/request'
import { supabaseStore } from '../../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Google Picker runs in the browser and needs a token. This hands it a short-lived access token
// (about an hour, drive.file permission only). The refresh token and client secret stay on the server.
export async function POST(req: Request) {
  try {
    const store = supabaseStore()
    const user = await requireUser(req)
    await limit(store, `picker-token:${user.id}`, 30, 3600)
    return jsonOk({ accessToken: await getAccessToken(store, user.id), expiresIn: 3000 })
  } catch (e) {
    return jsonError(e)
  }
}
