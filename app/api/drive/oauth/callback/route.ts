import { AppError } from '../../../../../lib/server/errors'
import { encrypt } from '../../../../../lib/server/crypto'
import { isHttps, siteUrl } from '../../../../../lib/server/env'
import { exchangeCode, verifyState } from '../../../../../lib/server/google-auth'
import { readCookie } from '../../../../../lib/server/request'
import { supabaseStore } from '../../../../../lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function back(result: string): Response {
  const clear = `sf_drive_oauth=; HttpOnly; SameSite=Lax; Path=/api/drive/oauth; Max-Age=0${isHttps() ? '; Secure' : ''}`
  return new Response(null, { status: 303, headers: { Location: `${siteUrl()}/drive?${result}`, 'Set-Cookie': clear, 'Cache-Control': 'no-store' } })
}

// Step 2: Google sends the person back here with a one-time code. The code is exchanged for tokens
// on the server and stored encrypted. Tokens never reach the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('error')) return back('error=denied')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return back('error=oauth_failed')

    const userId = verifyState(state, readCookie(req, 'sf_drive_oauth'))
    const tokens = await exchangeCode(code)
    await supabaseStore().saveConnection({
      user_id: userId,
      refresh_token_enc: encrypt(tokens.refreshToken),
      access_token_enc: encrypt(tokens.accessToken),
      access_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      scope: tokens.scope,
    })
    return back('connected=1')
  } catch (e) {
    if (!(e instanceof AppError)) console.error('OAuth callback failed')
    return back(`error=${e instanceof AppError && e.code === 'oauth_scope' ? 'scope' : 'oauth_failed'}`)
  }
}
