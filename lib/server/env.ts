import 'server-only'

// The Google addresses can be pointed at a test server only when NOT running on Vercel.
const onVercel = Boolean(process.env.VERCEL)

export const driveApiBase = () => (!onVercel && process.env.GOOGLE_DRIVE_API_BASE) || 'https://www.googleapis.com/drive/v3'
export const oauthTokenUrl = () => (!onVercel && process.env.GOOGLE_OAUTH_TOKEN_URL) || 'https://oauth2.googleapis.com/token'
export const oauthRevokeUrl = () => (!onVercel && process.env.GOOGLE_OAUTH_REVOKE_URL) || 'https://oauth2.googleapis.com/revoke'
export const oauthAuthUrl = () => 'https://accounts.google.com/o/oauth2/v2/auth'

export const siteUrl = () => (process.env.SITE_URL || '').replace(/\/+$/, '')
export const isHttps = () => siteUrl().startsWith('https://')

export function configuredFeatures() {
  const base = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  return {
    publicLinks: base && Boolean(process.env.GOOGLE_DRIVE_API_KEY),
    oauth: base && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TOKEN_ENCRYPTION_KEY && siteUrl()),
  }
}
