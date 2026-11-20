import 'server-only'
import { AppError, bad } from './errors'
import { driveApiBase } from './env'

export type DriveAuth = { kind: 'key' } | { kind: 'bearer'; token: string }

export type FileMeta = {
  id: string
  name: string
  mimeType: string
  size: number
  thumbnailLink: string | null
  trashed: boolean
  canDownload: boolean | undefined
  copyRequiresWriterPermission: boolean
}

export const ALLOWED_MIME = ['video/mp4', 'video/webm']
const FILE_ID = /^[A-Za-z0-9_-]{10,128}$/
export const isValidFileId = (id: unknown): id is string => typeof id === 'string' && FILE_ID.test(id)

// Accepts only real Google Drive file links. The file id is checked against a strict pattern, so nothing
// else from the pasted text is ever used to build a request.
export function extractDriveFileId(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw bad('That does not look like a link.')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) {
    throw bad('Only https://drive.google.com links are supported.')
  }
  if (/^\/drive\/(u\/\d+\/)?folders\//.test(url.pathname)) {
    throw bad('This is a folder link. Open the video itself and copy that link.')
  }
  const m = url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/)
  const id = m ? m[1] : url.pathname === '/open' || url.pathname === '/uc' ? url.searchParams.get('id') : null
  if (!id || !FILE_ID.test(id)) throw bad('Could not find a Google Drive file in this link.')
  return id
}

async function call(
  id: string,
  params: Record<string, string>,
  auth: DriveAuth,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<Response> {
  const url = new URL(`${driveApiBase()}/files/${encodeURIComponent(id)}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { ...init.headers }
  if (auth.kind === 'key') {
    const key = process.env.GOOGLE_DRIVE_API_KEY
    if (!key) throw new AppError(503, 'not_configured', 'Pasting Drive links is not set up on the server yet.')
    url.searchParams.set('key', key)
  } else {
    headers.Authorization = `Bearer ${auth.token}`
  }
  try {
    // redirect: 'error' means a response can never send us to some other address (SSRF protection)
    return await fetch(url, { headers, signal: init.signal, redirect: 'error', cache: 'no-store' })
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new AppError(502, 'upstream', 'Could not reach Google Drive. Try again in a moment.')
  }
}

async function mapError(res: Response, auth: DriveAuth): Promise<AppError> {
  let reason = ''
  let googleMessage = ''
  try {
    const j = await res.json()
    reason = String(j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? '')
    googleMessage = String(j?.error?.message ?? '')
  } catch {}
  // Google's own words help to find the real cause. Anything that looks like an API key is removed first.
  const detail = [reason, googleMessage].filter(Boolean).join(': ').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]').slice(0, 200) || undefined
  const notShared =
    auth.kind === 'key'
      ? 'The file was not found. It may be private, deleted, or not shared with "Anyone with the link".'
      : 'The file was not found. It may have been deleted, or SyncFlix no longer has access to it. Pick it again with Google Drive.'

  if (res.status === 401) {
    return auth.kind === 'bearer'
      ? new AppError(409, 'reconnect_required', 'Google Drive access expired. Connect Google Drive again.')
      : new AppError(502, 'upstream', 'Google Drive refused the request. Try again later.')
  }
  if (res.status === 404) return new AppError(404, 'file_not_found', notShared)
  if (res.status === 416) return new AppError(416, 'bad_range', 'That part of the video does not exist.')
  if (res.status === 429) return new AppError(429, 'rate_limited', 'Google Drive is limiting requests right now. Try again in a few minutes.', 120)
  if (res.status === 403) {
    if (reason === 'downloadQuotaExceeded') {
      return new AppError(429, 'quota', 'Google Drive has temporarily limited downloads of this file (too many views or downloads). Try again later; it can take up to a day.', 600)
    }
    if (/rateLimit|dailyLimit|quotaExceeded/i.test(reason)) {
      return new AppError(429, 'rate_limited', 'Google Drive is limiting requests right now. Try again in a few minutes.', 120)
    }
    if (reason === 'cannotDownloadFile') {
      return new AppError(403, 'download_disabled', 'The owner turned off downloading for this file, so it cannot be streamed.')
    }
    if (reason === 'cannotDownloadAbusiveFile') {
      return new AppError(403, 'blocked', 'Google has blocked downloads of this file. Google does this for files it has flagged, for example as malware, spam or copyright-protected.', undefined, detail)
    }
    return new AppError(403, 'forbidden', auth.kind === 'key'
      ? 'Google Drive refused access. SyncFlix reads the file like a stranger would, so your own owner or editor access does not count. The file must be shared as "Anyone with the link" (Viewer or higher), downloading must be allowed, and Google must not have flagged the file.'
      : 'Google Drive refused access. Pick the file again with Google Drive.', undefined, detail)
  }
  return new AppError(502, 'upstream', 'Google Drive returned an unexpected answer. Try again later.', undefined, detail)
}

const FIELDS =
  'id,name,mimeType,size,thumbnailLink,trashed,capabilities/canDownload,copyRequiresWriterPermission'

export async function getFileMeta(id: string, auth: DriveAuth, signal?: AbortSignal): Promise<FileMeta> {
  const res = await call(id, { fields: FIELDS, supportsAllDrives: 'true' }, auth, { signal })
  if (!res.ok) throw await mapError(res, auth)
  const j = await res.json()
  const thumb = typeof j.thumbnailLink === 'string' && j.thumbnailLink.startsWith('https://') ? j.thumbnailLink : null
  return {
    id: String(j.id ?? id),
    name: String(j.name ?? ''),
    mimeType: String(j.mimeType ?? ''),
    size: Number(j.size ?? 0),
    thumbnailLink: thumb,
    trashed: Boolean(j.trashed),
    canDownload: typeof j.capabilities?.canDownload === 'boolean' ? j.capabilities.canDownload : undefined,
    copyRequiresWriterPermission: Boolean(j.copyRequiresWriterPermission),
  }
}

export function validateVideo(meta: FileMeta): void {
  if (meta.trashed) throw new AppError(404, 'file_not_found', 'This file is in the Google Drive trash.')
  if (!ALLOWED_MIME.includes(meta.mimeType)) {
    throw new AppError(415, 'unsupported_type', `This file type (${meta.mimeType.slice(0, 60) || 'unknown'}) is not supported. Use an MP4 or WebM video.`)
  }
  if (meta.canDownload === false || meta.copyRequiresWriterPermission) {
    throw new AppError(403, 'download_disabled', 'The owner turned off downloading for this file, so it cannot be streamed.')
  }
  if (!Number.isSafeInteger(meta.size) || meta.size <= 0) {
    throw new AppError(415, 'unsupported_type', 'Google Drive did not report a file size, so this file cannot be streamed.')
  }
}

// Asks Drive for one byte. Proves the file can really be downloaded and that partial downloads (seeking) work.
export async function probeRange(id: string, auth: DriveAuth, expectedSize: number, signal?: AbortSignal): Promise<void> {
  const res = await call(id, { alt: 'media', supportsAllDrives: 'true' }, auth, { headers: { Range: 'bytes=0-0' }, signal })
  if (!res.ok) throw await mapError(res, auth)
  await res.body?.cancel()
  const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1])
  if (res.status !== 206 || !Number.isFinite(total)) {
    throw new AppError(422, 'no_range_support', 'Google Drive did not allow partial downloads for this file, so seeking would not work. No link was created.')
  }
  if (total !== expectedSize) {
    throw new AppError(502, 'upstream', 'Google Drive reported two different sizes for this file. Try again in a moment.')
  }
}

export async function openRange(id: string, auth: DriveAuth, start: number, end: number, signal?: AbortSignal): Promise<Response> {
  const res = await call(id, { alt: 'media', supportsAllDrives: 'true' }, auth, { headers: { Range: `bytes=${start}-${end}` }, signal })
  if (!res.ok) throw await mapError(res, auth)
  return res
}
