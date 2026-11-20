import 'server-only'
import { AppError, bad } from './errors'
import { limit } from './request'
import { getDetails, isMediaType, isTmdbId } from './tmdb'
import type { Store } from './store'
import type { Category, MediaType } from '../reviews'

export type CreateTitleInput = { media_type: unknown; tmdb_id: unknown; category: unknown }

// Creates the one permanent page for a title (or returns the existing page).
// The title details come from TMDB itself, never from the browser, so nobody can invent a page.
export async function createTitle(store: Store, userId: string, input: CreateTitleInput): Promise<{ id: string; created: boolean; media_type: MediaType; tmdb_id: number }> {
  if (!isMediaType(input.media_type)) throw bad('Choose Movie or TV.')
  const idText = typeof input.tmdb_id === 'number' ? String(input.tmdb_id) : input.tmdb_id
  if (!isTmdbId(idText)) throw bad('That TMDB number is not valid.')
  if (input.category !== 'movie' && input.category !== 'tv_series' && input.category !== 'anime') throw bad('Unknown category.')
  const media: MediaType = input.media_type
  const category: Category = input.category
  const tmdbId = Number(idText)

  await limit(store, `review-create:${userId}`, 20, 3600)
  const details = await getDetails(media, tmdbId)
  if (!details.allowed_categories.includes(category)) {
    throw new AppError(400, 'bad_category', category === 'anime'
      ? 'Only animated titles can be marked as Anime.'
      : 'That category does not match this title.')
  }
  const row = await store.createReviewTitle({
    userId, providerId: tmdbId, mediaType: media, category, title: details.title,
    posterPath: details.poster_path, backdropPath: details.backdrop_path, releaseDate: details.release_date, overview: details.overview,
  })
  return { id: row.id, created: row.created, media_type: media, tmdb_id: tmdbId }
}
