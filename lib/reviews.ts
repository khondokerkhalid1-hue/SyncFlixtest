// Shared by the browser and the server: tier names, categories and TMDB picture addresses.

export type Category = 'movie' | 'tv_series' | 'anime'
export type MediaType = 'movie' | 'tv'

export const CATEGORY_LABEL: Record<Category, string> = { movie: 'Movie', tv_series: 'TV Series', anime: 'Anime' }

export const TIERS = [
  {
    tier: 1,
    name: 'Time Waste',
    meaning: 'Not worth the time.',
    badge: 'border-red-500/40 bg-red-500/15 text-red-300',
    bar: 'bg-red-500',
    ring: 'border-red-500 bg-red-500/10',
  },
  {
    tier: 2,
    name: 'Good to Go',
    meaning: 'Worth watching, but not exceptional.',
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
    bar: 'bg-sky-500',
    ring: 'border-sky-500 bg-sky-500/10',
  },
  {
    tier: 3,
    name: 'Awesome / Must Watch',
    meaning: 'Excellent. You should watch it.',
    badge: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
    bar: 'bg-violet-500',
    ring: 'border-violet-500 bg-violet-500/10',
  },
  {
    tier: 4,
    name: 'Watch Before You Die',
    meaning: 'An exceptional, must-experience title.',
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    bar: 'bg-amber-400',
    ring: 'border-amber-400 bg-amber-400/10',
  },
] as const

export const tierInfo = (tier: number | null | undefined) => TIERS.find((t) => t.tier === tier) ?? null

// What the database functions return for one title (see review_overview in schema.sql).
export type ReviewRow = {
  id: string
  provider_id: number
  media_type: MediaType
  content_category: Category
  title: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null
  overview: string | null
  created_at: string
  total_votes: number
  average_rating: number | null
  tier_1_count: number
  tier_2_count: number
  tier_3_count: number
  tier_4_count: number
  tier_1_percentage: number
  tier_2_percentage: number
  tier_3_percentage: number
  tier_4_percentage: number
  final_tier: number | null
  tie_status: 'clear' | 'tie_broken_by_rating' | 'tie_broken_by_order' | null
}

// Pictures always come straight from TMDB's own picture servers. Nothing is stored or re-hosted.
export function tmdbImage(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280'): string | null {
  return path && /^\/[A-Za-z0-9_.-]{1,100}$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

export const reviewPath = (media: MediaType, id: number) => `/reviews/${media}/${id}`

export type SearchHit = {
  id: number
  media_type: MediaType
  title: string
  year: string | null
  poster_path: string | null
  overview: string
  suggested_category: Category
}

export type TitleDetails = {
  media_type: MediaType
  id: number
  title: string
  original_title: string | null
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null
  overview: string | null
  genres: string[]
  original_language: string | null
  runtime_minutes: number | null
  seasons: number | null
  episodes: number | null
  status: string | null
  cast: { name: string; character: string | null }[]
  makers: string[]
  makers_label: 'Director' | 'Directors' | 'Created by'
  trailer_key: string | null
  suggested_category: Category
  allowed_categories: Category[]
}
