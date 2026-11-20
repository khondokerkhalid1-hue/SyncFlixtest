import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppError } from './errors'

export type LinkRow = {
  id: string
  owner_id: string
  token: string
  source: 'public_link' | 'oauth'
  drive_file_id: string
  title: string
  mime_type: string
  size_bytes: number
  thumbnail_url: string | null
  rights_confirmed: boolean
  status: 'active' | 'revoked'
  last_error: string | null
  created_at: string
}

export type NewLink = Pick<LinkRow, 'owner_id' | 'token' | 'source' | 'drive_file_id' | 'title' | 'mime_type' | 'size_bytes' | 'thumbnail_url'>

export type ConnectionRow = {
  user_id: string
  refresh_token_enc: string
  access_token_enc: string | null
  access_expires_at: string | null
  scope: string
}

// Everything the server needs from the database. Tests plug in a fake version of this.
export interface Store {
  getLinkByToken(token: string): Promise<LinkRow | null>
  countLinks(ownerId: string): Promise<number>
  insertLink(link: NewLink): Promise<LinkRow>
  markLinkError(id: string, message: string): Promise<void>
  getConnection(userId: string): Promise<ConnectionRow | null>
  saveConnection(row: { user_id: string; refresh_token_enc: string; access_token_enc: string; access_expires_at: string; scope: string }): Promise<void>
  updateAccessToken(userId: string, enc: string, expiresAt: string): Promise<void>
  deleteConnection(userId: string): Promise<void>
  hitRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean>
  createReviewTitle(input: ReviewTitleInput): Promise<{ id: string; created: boolean }>
  refreshReviewTitle(input: Omit<ReviewTitleInput, 'userId' | 'category'>): Promise<void>
}

export type ReviewTitleInput = {
  userId: string
  providerId: number
  mediaType: 'movie' | 'tv'
  category: 'movie' | 'tv_series' | 'anime'
  title: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
  overview: string | null
}

let admin: SupabaseClient | null = null

// The service-role key gives full database access. It exists only in server code and server settings.
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new AppError(503, 'not_configured', 'This feature is not set up on the server yet.')
  if (!admin) admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

function dbError(error: { message: string }): AppError {
  console.error('Database error:', error.message)
  return new AppError(500, 'database', 'Something went wrong on the server.')
}

export function supabaseStore(): Store {
  const db = serviceClient()
  return {
    async getLinkByToken(token) {
      const { data, error } = await db.from('drive_links').select('*').eq('token', token).maybeSingle()
      if (error) throw dbError(error)
      return data as LinkRow | null
    },
    async countLinks(ownerId) {
      const { count, error } = await db.from('drive_links').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId)
      if (error) throw dbError(error)
      return count ?? 0
    },
    async insertLink(link) {
      const { data, error } = await db.from('drive_links').insert({ ...link, rights_confirmed: true }).select('*').single()
      if (error) throw dbError(error)
      return data as LinkRow
    },
    async markLinkError(id, message) {
      await db.from('drive_links').update({ last_error: message.slice(0, 200) }).eq('id', id)
    },
    async getConnection(userId) {
      const { data, error } = await db.from('drive_connections').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw dbError(error)
      return data as ConnectionRow | null
    },
    async saveConnection(row) {
      const { error } = await db.from('drive_connections').upsert({ ...row, updated_at: new Date().toISOString() })
      if (error) throw dbError(error)
    },
    async updateAccessToken(userId, enc, expiresAt) {
      const { error } = await db.from('drive_connections').update({ access_token_enc: enc, access_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('user_id', userId)
      if (error) throw dbError(error)
    },
    async deleteConnection(userId) {
      const { error } = await db.from('drive_connections').delete().eq('user_id', userId)
      if (error) throw dbError(error)
    },
    async createReviewTitle(i) {
      const { data, error } = await db.rpc('create_review_title', {
        p_user: i.userId, p_provider_id: i.providerId, p_media_type: i.mediaType, p_category: i.category, p_title: i.title,
        p_poster: i.posterPath, p_backdrop: i.backdropPath, p_release: i.releaseDate, p_overview: i.overview,
      })
      const row = Array.isArray(data) ? data[0] : data
      if (error || !row) throw dbError(error ?? { message: 'no row returned' })
      return { id: String(row.id), created: row.created === true }
    },
    async refreshReviewTitle(i) {
      await db.rpc('refresh_review_title', {
        p_media_type: i.mediaType, p_provider_id: i.providerId, p_title: i.title, p_poster: i.posterPath,
        p_backdrop: i.backdropPath, p_release: i.releaseDate, p_overview: i.overview,
      })
    },
    async hitRateLimit(key, max, windowSeconds) {
      const { data, error } = await db.rpc('hit_rate_limit', { p_key: key, p_limit: max, p_window_seconds: windowSeconds })
      if (error) throw dbError(error)
      return data === true
    },
  }
}
