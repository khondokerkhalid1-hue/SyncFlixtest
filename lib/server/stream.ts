import 'server-only'
import { AppError, errorResponse, jsonError, jsonOk } from './errors'
import { sha256 } from './crypto'
import { getFileMeta, openRange, probeRange, validateVideo, type DriveAuth } from './drive'
import { clientIp, limit } from './request'
import { planRange } from './range'
import type { LinkRow, Store } from './store'

export type StreamDeps = {
  store: Store
  openRange: typeof openRange
  getAccessToken: (store: Store, userId: string) => Promise<string>
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/
const notAvailable = () => new AppError(404, 'not_available', 'This video link is not available. It may have been deleted.')

function chunkSize(): number {
  const n = Number(process.env.DRIVE_STREAM_CHUNK_BYTES)
  return Math.min(Math.max(Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024, 256 * 1024), 32 * 1024 * 1024)
}

async function findLink(req: Request, token: string, deps: StreamDeps, perIp: number): Promise<LinkRow> {
  if (!TOKEN.test(token)) throw notAvailable()
  const ip = sha256(clientIp(req)).slice(0, 16)
  await limit(deps.store, `stream:ip:${ip}:${token.slice(0, 10)}`, perIp, 600)
  await limit(deps.store, `stream:tok:${token.slice(0, 16)}`, 3000, 600)
  const link = await deps.store.getLinkByToken(token)
  if (!link || link.status !== 'active') throw notAvailable()
  return link
}

async function authFor(link: LinkRow, deps: StreamDeps): Promise<DriveAuth> {
  return link.source === 'public_link'
    ? { kind: 'key' }
    : { kind: 'bearer', token: await deps.getAccessToken(deps.store, link.owner_id) }
}

const sticky = ['file_not_found', 'forbidden', 'download_disabled', 'reconnect_required', 'blocked']

// Video bytes for the <video> tag. Serves one slice per request, as asked by the Range header.
export async function handleStream(req: Request, token: string, deps: StreamDeps): Promise<Response> {
  let link: LinkRow | null = null
  try {
    link = await findLink(req, token, deps, 600)
    const base: Record<string, string> = {
      'Content-Type': link.mime_type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Referrer-Policy': 'no-referrer',
    }
    const rangeHeader = req.headers.get('range')
    if (req.method === 'HEAD' && !rangeHeader) {
      return new Response(null, { status: 200, headers: { ...base, 'Content-Length': String(link.size_bytes) } })
    }

    const plan = planRange(rangeHeader, link.size_bytes, chunkSize())
    if (plan.kind === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${link.size_bytes}` } })
    }
    const length = plan.end - plan.start + 1
    const headers = new Headers({ ...base, 'Content-Length': String(length) })
    if (plan.kind === 'partial') headers.set('Content-Range', `bytes ${plan.start}-${plan.end}/${link.size_bytes}`)
    const status = plan.kind === 'partial' ? 206 : 200
    if (req.method === 'HEAD') return new Response(null, { status, headers })

    const upstream = await deps.openRange(link.drive_file_id, await authFor(link, deps), plan.start, plan.end, req.signal)
    const upstreamLength = Number(upstream.headers.get('content-length'))
    const wrongStatus = plan.kind === 'partial' ? upstream.status !== 206 : upstream.status !== 200 && upstream.status !== 206
    if (wrongStatus || (Number.isFinite(upstreamLength) && upstreamLength > 0 && upstreamLength !== length)) {
      await upstream.body?.cancel()
      await deps.store.markLinkError(link.id, 'file_changed')
      throw new AppError(502, 'upstream', 'Google Drive did not return the expected part of the video. The file may have changed.')
    }
    return new Response(upstream.body, { status, headers })
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 })
    if (e instanceof AppError && link && sticky.includes(e.code)) await deps.store.markLinkError(link.id, e.code).catch(() => {})
    return jsonError(e)
  }
}

// Details for the watch page. With ?check=1 it also asks Google whether the file still works,
// which lets the page explain WHY playback failed.
export async function handleInfo(req: Request, token: string, deps: StreamDeps): Promise<Response> {
  try {
    const check = new URL(req.url).searchParams.get('check') === '1'
    const link = await findLink(req, token, deps, check ? 60 : 300)
    const info = { title: link.title, size_bytes: link.size_bytes, mime_type: link.mime_type, created_at: link.created_at }
    if (!check) return jsonOk({ ok: true, ...info })
    try {
      const auth = await authFor(link, deps)
      const meta = await getFileMeta(link.drive_file_id, auth, req.signal)
      validateVideo(meta)
      await probeRange(link.drive_file_id, auth, link.size_bytes, req.signal)
      return jsonOk({ ok: true, ...info, note: 'The file is reachable on Google Drive. If it still does not play, your browser may not support this video format (codec). Try another browser or convert the video to MP4 (H.264).' })
    } catch (e) {
      if (e instanceof AppError) return errorResponse(e)
      throw e
    }
  } catch (e) {
    return jsonError(e)
  }
}
