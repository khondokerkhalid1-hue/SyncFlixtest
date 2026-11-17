import 'server-only'
import { AppError, bad } from './errors'
import { newToken } from './crypto'
import { extractDriveFileId, getFileMeta, isValidFileId, probeRange, validateVideo, type DriveAuth } from './drive'
import { getAccessToken } from './google-auth'
import { limit } from './request'
import type { LinkRow, Store } from './store'

export const MAX_LINKS_PER_USER = 50

export type CreateInput = { source: unknown; url?: unknown; fileId?: unknown; rightsConfirmed: unknown }

// Checks the file with Google first. A link is only created when the file really can be streamed.
export async function createLink(store: Store, userId: string, input: CreateInput): Promise<LinkRow> {
  if (input.rightsConfirmed !== true) {
    throw bad('Please confirm that you own this video or have permission to share it.')
  }
  await limit(store, `create:user:${userId}`, 20, 3600)
  if ((await store.countLinks(userId)) >= MAX_LINKS_PER_USER) {
    throw new AppError(409, 'too_many_links', `You can have up to ${MAX_LINKS_PER_USER} links. Delete some first.`)
  }

  let fileId: string
  let auth: DriveAuth
  if (input.source === 'public_link') {
    if (typeof input.url !== 'string' || input.url.length > 500) throw bad('Paste a Google Drive link.')
    fileId = extractDriveFileId(input.url)
    auth = { kind: 'key' }
  } else if (input.source === 'oauth') {
    if (!isValidFileId(input.fileId)) throw bad('That Google Drive file could not be read.')
    fileId = input.fileId
    auth = { kind: 'bearer', token: await getAccessToken(store, userId) }
  } else {
    throw bad('Unknown way of creating a link.')
  }

  const meta = await getFileMeta(fileId, auth)
  validateVideo(meta)
  await probeRange(fileId, auth, meta.size)

  return store.insertLink({
    owner_id: userId,
    token: newToken(),
    source: input.source,
    drive_file_id: fileId,
    title: meta.name.slice(0, 300),
    mime_type: meta.mimeType,
    size_bytes: meta.size,
    thumbnail_url: meta.thumbnailLink,
  })
}

// What the browser may see about a link. Paths only: the browser builds full addresses itself.
export const publicLink = (row: LinkRow) => ({
  id: row.id,
  source: row.source,
  title: row.title,
  mime_type: row.mime_type,
  size_bytes: row.size_bytes,
  thumbnail_url: row.thumbnail_url,
  created_at: row.created_at,
  watch_path: `/watch/${row.token}`,
  stream_path: `/api/v/${row.token}/stream`,
})
