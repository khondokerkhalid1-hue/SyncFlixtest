import { jsonError, jsonOk } from '../../../../../lib/server/errors'
import { isHttps } from '../../../../../lib/server/env'
import { buildAuthUrl, makeState } from '../../../../../lib/server/google-auth'
import { limit, requireUser } from '../../../../../lib/server/request'
import { supabaseStore } from '../../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Step 1 of connecting Google Drive: returns the Google sign-in address and sets a one-time cookie
// that the callback must match.
export async function POST(req: Request) {
  try {
    const store = supabaseStore()
    const user = await requireUser(req)
    await limit(store, `oauth-start:${user.id}`, 20, 3600)
    const { state, nonce } = makeState(user.id)
    const res = jsonOk({ url: buildAuthUrl(state) })
    res.headers.append('Set-Cookie', `sf_drive_oauth=${nonce}; HttpOnly; SameSite=Lax; Path=/api/drive/oauth; Max-Age=600${isHttps() ? '; Secure' : ''}`)
    return res
  } catch (e) {
    return jsonError(e)
  }
}
