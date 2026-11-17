import { jsonError, jsonOk } from '../../../../lib/server/errors'
import { decrypt } from '../../../../lib/server/crypto'
import { revokeToken } from '../../../../lib/server/google-auth'
import { requireUser } from '../../../../lib/server/request'
import { supabaseStore } from '../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Removes SyncFlix's access to the person's Google Drive. Their files in Drive are not touched.
export async function POST(req: Request) {
  try {
    const store = supabaseStore()
    const user = await requireUser(req)
    const conn = await store.getConnection(user.id)
    if (conn) {
      try {
        await revokeToken(decrypt(conn.refresh_token_enc))
      } catch {}
      await store.deleteConnection(user.id)
    }
    return jsonOk({ connected: false })
  } catch (e) {
    return jsonError(e)
  }
}
