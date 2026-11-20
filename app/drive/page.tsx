'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import AppShell from '../../components/AppShell'
import { getSupabase } from '../../lib/supabase'
import { api, ApiFailure, formatBytes } from '../../lib/drive-client'
import { pickVideo } from '../../lib/picker'
import { dangerBtn, inputClass, outlineBtn, primaryBtn } from '../../lib/ui'
import type { DriveLinkRow } from '../../lib/types'

type Status = { features: { publicLinks: boolean; oauth: boolean }; connected: boolean; picker: { apiKey: string; appId: string } }
type Created = { title: string; watch_path: string; stream_path: string }

const problemText: Record<string, string> = {
  file_not_found: 'The file was deleted, moved, or is no longer shared.',
  forbidden: 'Google Drive refused access. SyncFlix reads the file like a stranger, so your own editor access does not count: share it as "Anyone with the link", allow downloads, and make sure Google has not flagged it.',
  download_disabled: 'The owner turned off downloading for this file.',
  reconnect_required: 'Google Drive access ended. Connect Google Drive again.',
  blocked: 'Google has blocked downloads of this file.',
  file_changed: 'The file changed in Google Drive after the link was made.',
}

const errorClass = 'rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300'
const okClass = 'rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'

function Rights({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>I own this video or have permission to share it.</label>
    </div>
  )
}

function DriveView() {
  const [status, setStatus] = useState<Status | null>(null)
  const [links, setLinks] = useState<DriveLinkRow[] | null>(null)
  const [url, setUrl] = useState('')
  const [rights1, setRights1] = useState(false)
  const [rights2, setRights2] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState('')

  const loadLinks = useCallback(async () => {
    const { data } = await getSupabase()!
      .from('drive_links')
      .select('id, token, source, title, mime_type, size_bytes, thumbnail_url, status, last_error, created_at')
      .order('created_at', { ascending: false })
    setLinks((data ?? []) as DriveLinkRow[])
  }, [])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('connected')) setNotice('Google Drive is connected. Now choose a video.')
    const e = q.get('error')
    if (e) setError(e === 'denied' ? 'You did not allow access to Google Drive.' : e === 'scope' ? 'The Google Drive permission was not granted. Try again and allow access.' : 'Connecting Google Drive did not work. Please try again.')
    if (q.toString()) window.history.replaceState(null, '', '/drive')
    api<Status>('/api/drive/status').then(setStatus).catch((err: ApiFailure) => setError(err.message))
    loadLinks()
  }, [loadLinks])

  async function createFrom(body: Record<string, unknown>, key: string) {
    setError('')
    setNotice('')
    setCreated(null)
    setBusy(key)
    try {
      const { link } = await api<{ link: Created }>('/api/drive/links', { method: 'POST', body })
      setCreated(link)
      loadLinks()
      return true
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Something went wrong. Please try again.')
      return false
    } finally {
      setBusy('')
    }
  }

  async function onPaste(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return setError('Paste a Google Drive link first.')
    if (!rights1) return setError('Please confirm that you own this video or have permission to share it.')
    if (await createFrom({ source: 'public_link', url: url.trim(), rightsConfirmed: true }, 'paste')) setUrl('')
  }

  async function connect() {
    setError('')
    setBusy('connect')
    try {
      const { url: next } = await api<{ url: string }>('/api/drive/oauth/start', { method: 'POST' })
      window.location.assign(next)
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not start the connection.')
      setBusy('')
    }
  }

  async function choose() {
    if (!status) return
    if (!rights2) return setError('Please confirm that you own this video or have permission to share it.')
    if (!status.picker.apiKey || !status.picker.appId) return setError('Google Picker is not set up on this site yet.')
    setError('')
    setBusy('pick')
    try {
      const { accessToken } = await api<{ accessToken: string }>('/api/drive/oauth/picker-token', { method: 'POST' })
      const doc = await pickVideo({ token: accessToken, apiKey: status.picker.apiKey, appId: status.picker.appId })
      if (doc) await createFrom({ source: 'oauth', fileId: doc.id, rightsConfirmed: true }, 'pick')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Google Drive.')
    } finally {
      setBusy('')
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? Links made from your connected Drive stop working until you connect again. Your files in Google Drive are not touched.')) return
    try {
      await api('/api/drive/disconnect', { method: 'POST' })
      setStatus((s) => (s ? { ...s, connected: false } : s))
      setNotice('Google Drive disconnected.')
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not disconnect.')
    }
  }

  async function remove(link: DriveLinkRow) {
    if (!window.confirm('Delete this link? Anyone using it loses access right away. Your video in Google Drive is not deleted.')) return
    const { error: err } = await getSupabase()!.from('drive_links').delete().eq('id', link.id)
    if (err) return setError('Could not delete the link. Please try again.')
    setLinks((prev) => (prev ?? []).filter((l) => l.id !== link.id))
    if (created && created.watch_path.endsWith(link.token)) setCreated(null)
  }

  async function copy(path: string, label: string) {
    try {
      await navigator.clipboard.writeText(window.location.origin + path)
      setCopied(label + path)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setError('Could not copy. Select the link and copy it by hand.')
    }
  }

  const unavailable = <p className="mt-3 text-sm text-muted">This is not set up on this site yet.</p>

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">My video links</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Turn a video in your Google Drive into a SyncFlix link. Google Drive is not a video host, so a link works only while the file
        stays in Drive and Google&apos;s limits allow it. Only use videos you own or may share.
      </p>

      {error && <p role="alert" className={`mt-5 ${errorClass}`}>{error}</p>}
      {notice && <p role="status" className={`mt-5 ${okClass}`}>{notice}</p>}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-6" aria-labelledby="m1">
          <h2 id="m1" className="text-lg font-bold">Paste a Google Drive link</h2>
          <p className="mt-2 text-sm text-muted">In Google Drive, share the video as &quot;Anyone with the link&quot; (Viewer), then paste its link here. Downloading must be allowed.</p>
          {status && !status.features.publicLinks ? unavailable : (
            <form onSubmit={onPaste} className="mt-4 space-y-4" noValidate>
              <div>
                <label htmlFor="drive-url" className="sr-only">Google Drive link</label>
                <input id="drive-url" className={`${inputClass} !mt-0`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." inputMode="url" />
              </div>
              <Rights id="rights1" checked={rights1} onChange={setRights1} />
              <button type="submit" disabled={busy === 'paste'} className={primaryBtn}>{busy === 'paste' ? 'Checking the file...' : 'Create link'}</button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-card p-6" aria-labelledby="m2">
          <h2 id="m2" className="text-lg font-bold">Connect Google Drive</h2>
          <p className="mt-2 text-sm text-muted">Pick videos from your own Drive. SyncFlix can only see the files you choose, never the rest of your Drive.</p>
          {status && !status.features.oauth ? unavailable : !status?.connected ? (
            <button onClick={connect} disabled={!status || busy === 'connect'} className={`${primaryBtn} mt-4`}>{busy === 'connect' ? 'Opening Google...' : 'Connect Google Drive'}</button>
          ) : (
            <div className="mt-4 space-y-4">
              <Rights id="rights2" checked={rights2} onChange={setRights2} />
              <div className="flex flex-wrap gap-3">
                <button onClick={choose} disabled={busy === 'pick'} className={primaryBtn}>{busy === 'pick' ? 'Working...' : 'Choose a video'}</button>
                <button onClick={disconnect} className={outlineBtn}>Disconnect</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {created && (
        <section className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6" aria-label="New link">
          <h2 className="font-bold">Link created: {created.title}</h2>
          <p className="mt-2 text-sm text-muted">To watch with friends, open a room and paste the video file link into &quot;Set video&quot; or the queue.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => copy(created.stream_path, 'file')} className={outlineBtn}>Copy video file link</button>
            <button onClick={() => copy(created.watch_path, 'watch')} className={outlineBtn}>Copy watch page link</button>
            <a href={created.watch_path} target="_blank" rel="noopener noreferrer" className={outlineBtn}>Preview</a>
          </div>
        </section>
      )}

      <h2 className="mt-12 text-xl font-bold">Your links</h2>
      {links === null ? (
        <p className="mt-4 text-sm text-muted" role="status">Loading your links...</p>
      ) : links.length === 0 ? (
        <p className="mt-4 max-w-md text-sm text-muted">No links yet. Create one above.</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {links.map((l) => (
            <li key={l.id} className="flex gap-4 rounded-2xl border border-line bg-card p-4">
              <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-surface">
                {l.thumbnail_url && (
                  // Thumbnails come from Google and may expire; the box stays empty if one fails to load.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.thumbnail_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{l.title || 'Untitled video'}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatBytes(l.size_bytes)}, {new Date(l.created_at).toLocaleDateString()}, {l.source === 'oauth' ? 'connected Drive' : 'pasted link'}
                </p>
                {l.last_error && (
                  <p className="mt-1 text-xs text-red-300">
                    {problemText[l.last_error.split(':')[0]] ?? 'This link had a problem.'}
                    {l.last_error.includes(':') && <span className="text-muted"> Google said: {l.last_error.slice(l.last_error.indexOf(':') + 1)}</span>}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => copy(`/api/v/${l.token}/stream`, 'file')} className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>
                    {copied === `file/api/v/${l.token}/stream` ? 'Copied' : 'Copy video file link'}
                  </button>
                  <button onClick={() => copy(`/watch/${l.token}`, 'watch')} className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>
                    {copied === `watch/watch/${l.token}` ? 'Copied' : 'Copy watch link'}
                  </button>
                  <a href={`/watch/${l.token}`} target="_blank" rel="noopener noreferrer" className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>Preview</a>
                  <button onClick={() => remove(l)} className={`${dangerBtn} !px-3 !py-1.5 !text-xs`}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 max-w-2xl text-xs text-muted">
        Anyone who has a link can watch the video, so share links only with people you trust. Deleting a link stops it working at once; it
        never deletes your file in Google Drive.
      </p>
    </>
  )
}

export default function DrivePage() {
  return (
    <AppShell>
      <DriveView />
    </AppShell>
  )
}
