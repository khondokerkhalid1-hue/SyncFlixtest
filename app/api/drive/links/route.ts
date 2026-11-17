import { jsonError, jsonOk } from '../../../../lib/server/errors'
import { createLink, publicLink } from '../../../../lib/server/create'
import { readJson, requireUser } from '../../../../lib/server/request'
import { supabaseStore } from '../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Create a SyncFlix video link from a Google Drive file (pasted link or file picked with Google Picker).
export async function POST(req: Request) {
  try {
    const store = supabaseStore()
    const user = await requireUser(req)
    const body = await readJson(req)
    const row = await createLink(store, user.id, {
      source: body.source,
      url: body.url,
      fileId: body.fileId,
      rightsConfirmed: body.rightsConfirmed,
    })
    return jsonOk({ link: publicLink(row) }, 201)
  } catch (e) {
    return jsonError(e)
  }
}
