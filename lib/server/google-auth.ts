import 'server-only'
import { AppError } from './errors'
import { decrypt, encrypt, safeEqual, sign } from './crypto'
import { oauthAuthUrl, oauthRevokeUrl, oauthTokenUrl, siteUrl } from './env'
import type { Store } from './store'
import crypto from 'node:crypto'

// The narrowest Drive permission: only files the person picks, never their whole Drive.
export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

const notConfigured = () => new AppError(503, 'not_configured', 'Google Drive connection is not set up on the server yet.')

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const site = siteUrl()
  if (!clientId || !clientSecret || !site) throw notConfigured()
  return { clientId, clientSecret, redirectUri: `${site}/api/drive/oauth/callback` }
}

// "state" ties the Google round trip to one signed-in person and one browser (via a cookie).
export function makeState(userId: string): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(18).toString('base64url')
  const body = `${userId}.${nonce}.${Date.now() + 10 * 60 * 1000}`
  return { state: `${body}.${sign(body)}`, nonce }
}

export function verifyState(state: string, cookieNonce: string): string {
  const parts = state.split('.')
  const fail = () => new AppError(400, 'bad_state', 'The sign-in could not be verified. Please try connecting again.')
  if (parts.length !== 4) throw fail()
  const [userId, nonce, exp, sig] = parts
  if (!safeEqual(sig, sign(`${userId}.${nonce}.${exp}`))) throw fail()
  if (!cookieNonce || !safeEqual(nonce, cookieNonce)) throw fail()
  if (!Number.isFinite(Number(exp)) || Number(exp) < Date.now()) throw fail()
  return userId
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = config()
  const u = new URL(oauthAuthUrl())
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPE)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('state', state)
  return u.toString()
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }

async function tokenRequest(params: Record<string, string>): Promise<{ ok: boolean; body: TokenResponse }> {
  try {
    const res = await fetch(oauthTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      redirect: 'error',
      cache: 'no-store',
    })
    return { ok: res.ok, body: (await res.json().catch(() => ({}))) as TokenResponse }
  } catch {
    throw new AppError(502, 'upstream', 'Could not reach Google. Try again in a moment.')
  }
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = config()
  const { ok, body } = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  if (!ok || !body.access_token || !body.refresh_token) {
    throw new AppError(400, 'oauth_failed', 'Google did not complete the connection. Please try again.')
  }
  if (!(body.scope ?? '').split(' ').includes(SCOPE)) {
    throw new AppError(400, 'oauth_scope', 'The Google Drive permission was not granted. Please try again and allow access.')
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: body.expires_in ?? 3600, scope: body.scope ?? SCOPE }
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = config()
  const { ok, body } = await tokenRequest({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  if (body.error === 'invalid_grant') {
    throw new AppError(409, 'reconnect_required', 'Google Drive access expired or was removed. Connect Google Drive again.')
  }
  if (!ok || !body.access_token) throw new AppError(502, 'upstream', 'Could not refresh the Google Drive connection. Try again in a moment.')
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 }
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(oauthRevokeUrl(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), redirect: 'error' })
  } catch {}
}

// A valid access token for this person, refreshed on the server when needed. Never leaves the server
// except the short-lived token handed to Google Picker.
export async function getAccessToken(store: Store, userId: string): Promise<string> {
  const conn = await store.getConnection(userId)
  if (!conn) throw new AppError(409, 'reconnect_required', 'Google Drive is not connected. Connect it from "My videos".')
  if (conn.access_token_enc && conn.access_expires_at && Date.parse(conn.access_expires_at) - Date.now() > 60_000) {
    try {
      return decrypt(conn.access_token_enc)
    } catch {}
  }
  let fresh
  try {
    fresh = await refreshAccessToken(decrypt(conn.refresh_token_enc))
  } catch (e) {
    if (e instanceof AppError && e.code === 'reconnect_required') await store.deleteConnection(userId)
    throw e
  }
  await store.updateAccessToken(userId, encrypt(fresh.accessToken), new Date(Date.now() + fresh.expiresIn * 1000).toISOString())
  return fresh.accessToken
}
