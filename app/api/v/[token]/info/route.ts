import { jsonError } from '../../../../../lib/server/errors'
import { realDeps } from '../../../../../lib/server/deps'
import { handleInfo } from '../../../../../lib/server/stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  try {
    return await handleInfo(req, token, realDeps())
  } catch (e) {
    return jsonError(e)
  }
}
