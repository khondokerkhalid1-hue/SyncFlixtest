import { jsonError } from '../../../../../lib/server/errors'
import { realDeps } from '../../../../../lib/server/deps'
import { handleStream } from '../../../../../lib/server/stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The real video bytes, with HTTP Range support so seeking works. Safe for <video src="...">.
async function serve(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  let deps
  try {
    deps = realDeps()
  } catch (e) {
    return jsonError(e)
  }
  return handleStream(req, token, deps)
}

export const GET = serve
export const HEAD = serve
