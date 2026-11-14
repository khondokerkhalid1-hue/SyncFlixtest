// Pure helper functions for keeping everyone at the same moment of the video.

export const HARD_SEEK_SECONDS = 1.5 // bigger gap than this: jump straight to the right spot
export const SOFT_CORRECT_SECONDS = 0.25 // smaller gap than this: ignore; in between: speed up or slow down a little

// The database sends times with microseconds; browsers only reliably read milliseconds.
export function parseServerTime(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'))
}

type TimedState = { is_playing: boolean; position_seconds: number; updated_at: string }

// Where the video should be right now, using the server's clock.
export function targetPosition(state: TimedState, serverNowMs: number): number {
  if (!state.is_playing) return state.position_seconds
  const elapsed = (serverNowMs - parseServerTime(state.updated_at)) / 1000
  return state.position_seconds + Math.max(0, elapsed)
}

export type Correction = { seekTo: number | null; rate: number; shouldPlay: boolean }

export function planCorrection(opts: {
  isPlaying: boolean
  target: number
  current: number
  hard: boolean
  duration: number
}): Correction {
  const limit = Number.isFinite(opts.duration) ? opts.duration : Infinity
  const target = Math.min(Math.max(opts.target, 0), limit)
  const diff = target - opts.current

  if (opts.isPlaying) {
    if (opts.hard || Math.abs(diff) > HARD_SEEK_SECONDS) return { seekTo: target, rate: 1, shouldPlay: true }
    if (Math.abs(diff) > SOFT_CORRECT_SECONDS) return { seekTo: null, rate: diff > 0 ? 1.05 : 0.95, shouldPlay: true }
    return { seekTo: null, rate: 1, shouldPlay: true }
  }
  return { seekTo: opts.hard || Math.abs(diff) > 0.4 ? target : null, rate: 1, shouldPlay: false }
}

// Only direct https links are accepted. Returns an error sentence, or '' when the link is fine.
export function checkVideoUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return 'Paste a video link first.'
  if (value.length > 2000) return 'That link is too long.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'That does not look like a link. It should start with https://'
  }
  if (url.protocol !== 'https:') return 'The link must start with https:// (plain http links are blocked by browsers).'
  return ''
}
