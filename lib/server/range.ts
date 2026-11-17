// HTTP Range handling for video seeking. Pure functions, no I/O.

export type RangePlan =
  | { kind: 'full'; start: number; end: number }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }

// size: total file size. cap: the most bytes we send in one response.
// Browsers ask for "bytes=N-" and happily accept a shorter answer, then ask again for the rest.
export function planRange(header: string | null, size: number, cap: number): RangePlan {
  const whole = (): RangePlan =>
    size <= cap ? { kind: 'full', start: 0, end: size - 1 } : { kind: 'partial', start: 0, end: cap - 1 }

  if (!header) return whole()
  const first = header.split(',')[0].trim() // only the first range of a multi-range request is served
  const m = /^bytes=(\d*)-(\d*)$/i.exec(first)
  if (!m || (m[1] === '' && m[2] === '')) return whole() // unreadable Range headers are ignored

  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { kind: 'unsatisfiable' }
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    if (!Number.isSafeInteger(start) || start >= size) return { kind: 'unsatisfiable' }
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
    if (!Number.isSafeInteger(end) || end < start) return whole()
  }
  end = Math.min(end, start + cap - 1)
  return { kind: 'partial', start, end }
}
