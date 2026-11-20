import 'server-only'
import { AppError } from './errors'
import { tmdbApiBase } from './env'
import type { Category, MediaType, SearchHit, TitleDetails } from '../reviews'

const IMAGE_PATH = /^\/[A-Za-z0-9_.-]{1,100}$/
const ANIMATION_GENRE = 16

const clean = (path: unknown): string | null => (typeof path === 'string' && IMAGE_PATH.test(path) ? path : null)
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null)

// Light classification: Animation genre + Japanese original language = suggested "Anime".
// People may also choose Anime for any other animation title, but never for live action.
export function suggestCategory(media: MediaType, genreIds: number[], language: string | null): Category {
  if (genreIds.includes(ANIMATION_GENRE) && language === 'ja') return 'anime'
  return media === 'movie' ? 'movie' : 'tv_series'
}

export function allowedCategories(media: MediaType, genreIds: number[]): Category[] {
  const base: Category = media === 'movie' ? 'movie' : 'tv_series'
  return genreIds.includes(ANIMATION_GENRE) ? [base, 'anime'] : [base]
}

export const isMediaType = (v: unknown): v is MediaType => v === 'movie' || v === 'tv'
export const isTmdbId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,9}$/.test(v) && Number(v) > 0

async function tmdbGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new AppError(503, 'tmdb_not_configured', 'Title search is not set up yet. The site owner needs to add the TMDB_API_KEY setting.')
  const url = new URL(`${tmdbApiBase()}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { Accept: 'application/json' }
  // Both kinds of TMDB credentials work: the short "API Key" and the long "API Read Access Token".
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)
  let res: Response
  try {
    // No Next.js data cache here: it would store the full address, which contains the key when the short key is used.
    // Repeated searches are still cheap because our own answers are cached at the edge (see the routes' Cache-Control).
    res = await fetch(url, { headers, redirect: 'error', cache: 'no-store' })
  } catch {
    throw new AppError(502, 'tmdb_unreachable', 'Could not reach TMDB. Try again in a moment.')
  }
  if (res.status === 404) throw new AppError(404, 'not_found', 'This title was not found on TMDB.')
  if (res.status === 401) throw new AppError(502, 'tmdb_key_rejected', 'TMDB did not accept the API key. The site owner needs to check TMDB_API_KEY.')
  if (res.status === 429) throw new AppError(429, 'rate_limited', 'TMDB is busy. Try again in a minute.', 60)
  if (!res.ok) throw new AppError(502, 'tmdb_error', 'TMDB returned an error. Try again later.')
  try {
    return await res.json()
  } catch {
    throw new AppError(502, 'tmdb_error', 'TMDB returned an unreadable answer.')
  }
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const ids = (v: unknown): number[] => arr(v).filter((x): x is number => typeof x === 'number')

export async function searchTitles(query: string, page: number) {
  const data = obj(await tmdbGet('/search/multi', { query, page: String(page), include_adult: 'false', language: 'en-US' }))
  const results: SearchHit[] = []
  for (const raw of arr(data.results)) {
    const r = obj(raw)
    if (!isMediaType(r.media_type) || typeof r.id !== 'number') continue // skips people and anything else
    const title = text(r.title ?? r.name, 300)
    if (!title) continue
    const when = date(r.release_date ?? r.first_air_date)
    results.push({
      id: r.id,
      media_type: r.media_type,
      title,
      year: when ? when.slice(0, 4) : null,
      poster_path: clean(r.poster_path),
      overview: text(r.overview, 300) ?? '',
      suggested_category: suggestCategory(r.media_type, ids(r.genre_ids), typeof r.original_language === 'string' ? r.original_language : null),
    })
  }
  return {
    page: num(data.page) ?? page,
    total_pages: Math.min(num(data.total_pages) ?? 1, 20),
    total_results: num(data.total_results) ?? results.length,
    results,
  }
}

export async function getDetails(media: MediaType, id: number): Promise<TitleDetails> {
  const d = obj(await tmdbGet(`/${media}/${id}`, { append_to_response: 'credits,videos', language: 'en-US' }))
  const genres = arr(d.genres).map(obj).filter((g) => typeof g.id === 'number')
  const genreIds = genres.map((g) => g.id as number)
  const language = typeof d.original_language === 'string' ? d.original_language : null
  const title = text(media === 'movie' ? d.title : d.name, 300)
  if (!title) throw new AppError(502, 'tmdb_error', 'TMDB returned no title for this item.')

  const credits = obj(d.credits)
  const cast = arr(credits.cast).slice(0, 12).map(obj).filter((c) => text(c.name, 100)).map((c) => ({ name: text(c.name, 100)!, character: text(c.character, 100) }))
  let makers: string[]
  let label: TitleDetails['makers_label']
  if (media === 'movie') {
    makers = arr(credits.crew).map(obj).filter((c) => c.job === 'Director').map((c) => text(c.name, 100)).filter((n): n is string => Boolean(n)).slice(0, 4)
    label = makers.length > 1 ? 'Directors' : 'Director'
  } else {
    makers = arr(d.created_by).map(obj).map((c) => text(c.name, 100)).filter((n): n is string => Boolean(n)).slice(0, 4)
    label = 'Created by'
  }
  const videos = arr(obj(d.videos).results).map(obj).filter((v) => v.site === 'YouTube' && v.type === 'Trailer' && typeof v.key === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(v.key))
  const trailer = videos.find((v) => v.official === true) ?? videos[0]
  const episodeRuntime = arr(d.episode_run_time).find((x): x is number => typeof x === 'number')

  return {
    media_type: media,
    id,
    title,
    original_title: text(media === 'movie' ? d.original_title : d.original_name, 300),
    poster_path: clean(d.poster_path),
    backdrop_path: clean(d.backdrop_path),
    release_date: date(media === 'movie' ? d.release_date : d.first_air_date),
    overview: text(d.overview, 1500),
    genres: genres.map((g) => text(g.name, 40)).filter((n): n is string => Boolean(n)),
    original_language: language,
    runtime_minutes: media === 'movie' ? num(d.runtime) : num(episodeRuntime),
    seasons: media === 'tv' ? num(d.number_of_seasons) : null,
    episodes: media === 'tv' ? num(d.number_of_episodes) : null,
    status: text(d.status, 40),
    cast,
    makers,
    makers_label: label,
    trailer_key: trailer ? (trailer.key as string) : null,
    suggested_category: suggestCategory(media, genreIds, language),
    allowed_categories: allowedCategories(media, genreIds),
  }
}
