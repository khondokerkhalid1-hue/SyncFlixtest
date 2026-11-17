import { jsonError, jsonOk } from '../../../../lib/server/errors'
import { configuredFeatures } from '../../../../lib/server/env'
import { requireUser } from '../../../../lib/server/request'
import { supabaseStore } from '../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Which Drive features are set up on the server, and whether this person connected Google Drive.
export async function GET(req: Request) {
  try {
    const features = configuredFeatures()
    const user = await requireUser(req)
    const connected = features.oauth ? Boolean(await supabaseStore().getConnection(user.id)) : false
    return jsonOk({
      features,
      connected,
      picker: {
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? '',
        appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? '',
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
