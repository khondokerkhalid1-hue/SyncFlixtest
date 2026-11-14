'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { checkVideoUrl, parseServerTime, planCorrection, targetPosition } from '../lib/sync'
import { friendlyError, inputClass, outlineBtn, primaryBtn } from '../lib/ui'

type Playback = {
  room_id: string
  video_url: string | null
  title: string
  is_playing: boolean
  position_seconds: number
  updated_at: string
  updated_by: string | null
  version: number
  current_item_id: number | null
}

type Patch = { video_url?: string | null; title?: string; is_playing?: boolean; position?: number }

const VIDEO_ERROR =
  'This video could not be played. Check that the link opens a video file directly (like .mp4 or .webm), that it starts with https://, and that the website lets other sites play it.'

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export default function SyncPlayer({ roomId, canControl, userId }: { roomId: string; canControl: boolean; userId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<Playback | null>(null)
  const offsetRef = useRef(0) // server clock minus this device's clock, in milliseconds
  const ignoreUntil = useRef(0) // events caused by our own sync actions are ignored until this time
  const sendChain = useRef<Promise<unknown>>(Promise.resolve())
  const hostRef = useRef(canControl)
  hostRef.current = canControl

  const [state, setState] = useState<Playback | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [live, setLive] = useState<'connecting' | 'live' | 'reconnecting'>('connecting')
  const [needsTap, setNeedsTap] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [formError, setFormError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [clock, setClock] = useState({ current: 0, duration: 0 })
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  // Move this device's video to where the room's state says it should be.
  const syncVideo = useCallback((hard: boolean) => {
    const v = videoRef.current
    const s = stateRef.current
    if (!v || !s || !s.video_url || v.readyState < 1) return
    const target = targetPosition(s, Date.now() + offsetRef.current)
    const plan = planCorrection({ isPlaying: s.is_playing, target, current: v.currentTime, hard, duration: v.duration })

    if (plan.seekTo !== null) {
      ignoreUntil.current = Date.now() + 800
      v.currentTime = plan.seekTo
    }
    if (v.playbackRate !== plan.rate) v.playbackRate = plan.rate
    if (plan.shouldPlay && v.paused) {
      ignoreUntil.current = Date.now() + 800
      v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    } else if (!plan.shouldPlay && !v.paused) {
      ignoreUntil.current = Date.now() + 800
      v.pause()
    }
  }, [])

  const applyRemote = useCallback(
    (next: Playback, initial = false) => {
      const prev = stateRef.current
      if (prev && next.version <= prev.version) return // old or repeated message
      if (!prev || prev.video_url !== next.video_url) setVideoError('')
      stateRef.current = next
      setState(next)
      if (!initial && hostRef.current && next.updated_by === userId) return // my own change coming back
      syncVideo(false)
    },
    [syncVideo, userId]
  )

  // Host: send a change to everyone. Changes are sent one after another so they stay in order.
  const send = useCallback(
    (patch: Patch) => {
      const s = stateRef.current
      const args = {
        p_room: roomId,
        p_video_url: patch.video_url !== undefined ? patch.video_url : (s?.video_url ?? null),
        p_title: patch.title ?? s?.title ?? '',
        p_is_playing: patch.is_playing ?? s?.is_playing ?? false,
        p_position: Math.max(0, patch.position ?? s?.position_seconds ?? 0),
      }
      sendChain.current = sendChain.current.then(async () => {
        const { error } = await getSupabase()!.rpc('set_playback', args)
        setFormError(error ? friendlyError(error.message) : '')
      })
    },
    [roomId]
  )

  // Connect: measure the server clock, load the current state, then listen for live changes.
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false
    let firstLoad = true

    const measureOffset = async () => {
      let best = Infinity
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now()
        const { data } = await supabase.rpc('server_time')
        const t1 = Date.now()
        if (data && t1 - t0 < best) {
          best = t1 - t0
          offsetRef.current = parseServerTime(String(data)) - (t0 + t1) / 2
        }
      }
    }

    const fetchState = async () => {
      const { data } = await supabase.from('playback_states').select('*').eq('room_id', roomId).maybeSingle()
      if (cancelled) return
      if (data) applyRemote(data as Playback, firstLoad)
      firstLoad = false
      setLoaded(true)
    }

    let channel: ReturnType<typeof supabase.channel> | null = null
    measureOffset().then(() => {
      if (cancelled) return
      channel = supabase
        .channel(`playback-${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'playback_states', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (payload.new && 'version' in payload.new) applyRemote(payload.new as Playback)
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setLive('live')
            fetchState() // also runs after every reconnect, so nothing is missed
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setLive('reconnecting')
          }
        })
    })

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        measureOffset().then(fetchState)
      }
    }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      cancelled = true
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
      if (channel) supabase.removeChannel(channel)
    }
  }, [roomId, applyRemote])

  // Members: keep correcting small drifts. Host: report the position every 15 seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      const v = videoRef.current
      const s = stateRef.current
      if (!v || !s?.video_url) return
      if (hostRef.current) {
        if (s.is_playing && s.updated_by === userId && !v.paused && v.readyState >= 3) send({ is_playing: true, position: v.currentTime })
      } else if (v.readyState >= 3 && !needsTap) {
        syncVideo(false)
      }
    }, hostRef.current ? 15000 : 2000)
    return () => clearInterval(timer)
  }, [canControl, needsTap, send, syncVideo])

  // Host's own play, pause and seek become the room's state.
  const hostEvent = (kind: 'play' | 'pause' | 'seek') => () => {
    const v = videoRef.current
    if (!canControl || !v || Date.now() < ignoreUntil.current) return
    if (kind === 'pause' && v.ended) return // the video simply finished; onEnded decides what happens next
    const playing = kind === 'play' ? true : kind === 'pause' ? false : !v.paused
    send({ is_playing: playing, position: v.currentTime })
  }

  // When a video ends, anyone who may control the room asks for the next queue item.
  // The database makes sure only one request counts, so no episode is skipped.
  async function onEnded() {
    if (!canControl) return
    const from = stateRef.current?.current_item_id ?? null
    const { data, error } = await getSupabase()!.rpc('play_next', { p_room: roomId, p_from: from })
    if (error) return setFormError(friendlyError(error.message))
    if (data === 'empty') send({ is_playing: false, position: videoRef.current?.duration ?? 0 })
  }

  function setVideo(e: FormEvent) {
    e.preventDefault()
    const problem = checkVideoUrl(urlInput)
    if (problem) return setFormError(problem)
    setFormError('')
    send({ video_url: urlInput.trim(), title: titleInput.trim(), is_playing: false, position: 0 })
    setUrlInput('')
    setTitleInput('')
  }

  function tapToPlay() {
    const v = videoRef.current
    if (!v) return
    setNeedsTap(false)
    syncVideo(true)
    v.play().catch(() => setNeedsTap(true))
  }

  function resync() {
    const supabase = getSupabase()
    supabase
      ?.from('playback_states')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          stateRef.current = data as Playback
          setState(data as Playback)
        }
        syncVideo(true)
      })
  }

  const hasVideo = Boolean(state?.video_url)
  const chip =
    live === 'live'
      ? { text: 'Live', dot: 'bg-emerald-400' }
      : live === 'connecting'
        ? { text: 'Connecting...', dot: 'bg-yellow-400' }
        : { text: 'Reconnecting...', dot: 'bg-red-400' }

  return (
    <section aria-label="Video player">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{state?.title || (hasVideo ? 'Now playing' : 'No video yet')}</p>
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium" role="status">
          <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
          {chip.text}
        </span>
      </div>

      <div ref={frameRef} className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-black">
        {hasVideo ? (
          <video
            key={state!.video_url!}
            ref={videoRef}
            src={state!.video_url!}
            className="h-full w-full"
            controls={canControl}
            playsInline
            preload="auto"
            muted={muted}
            onLoadedMetadata={(e) => {
              setVideoError('')
              e.currentTarget.volume = volume
              syncVideo(true)
            }}
            onCanPlay={() => syncVideo(false)}
            onPlay={hostEvent('play')}
            onPause={hostEvent('pause')}
            onSeeked={hostEvent('seek')}
            onEnded={onEnded}
            onTimeUpdate={(e) => setClock({ current: e.currentTarget.currentTime, duration: e.currentTarget.duration })}
            onError={() => setVideoError(VIDEO_ERROR)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm text-muted">
              {!loaded
                ? 'Loading...'
                : canControl
                  ? 'No video yet. Paste a video link below to start.'
                  : 'Waiting for the host to choose a video.'}
            </p>
          </div>
        )}

        {needsTap && hasVideo && (
          <button onClick={tapToPlay} className="absolute inset-0 flex items-center justify-center bg-black/70 text-base font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Tap to join the playback
          </button>
        )}
      </div>

      {videoError && <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{videoError}</p>}

      {hasVideo && !canControl && (
        <div className="mt-3 rounded-2xl border border-line bg-card p-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${clock.duration > 0 ? Math.min(100, (clock.current / clock.duration) * 100) : 0}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{formatTime(clock.current)} / {formatTime(clock.duration)}</span>
            <span className="flex-1" />
            <button onClick={() => setMuted(!muted)} className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>{muted ? 'Unmute' : 'Mute'}</button>
            <label className="flex items-center gap-2">
              <span className="sr-only">Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const x = Number(e.target.value); setVolume(x); if (videoRef.current) videoRef.current.volume = x }} className="w-24 accent-primary" />
            </label>
            <button onClick={() => frameRef.current?.requestFullscreen?.()} className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>Fullscreen</button>
            <button onClick={resync} className={`${outlineBtn} !px-3 !py-1.5 !text-xs`}>Resync</button>
          </div>
          <p className="mt-3 text-xs text-muted">The host controls playback. Use Resync if your video drifts.</p>
        </div>
      )}

      {canControl && (
        <form onSubmit={setVideo} className="mt-4 space-y-3 rounded-2xl border border-line bg-card p-4" noValidate>
          <p className="text-sm font-semibold">Choose the video</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label htmlFor="video-url" className="sr-only">Video link</label>
              <input id="video-url" className={`${inputClass} !mt-0`} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com/video.mp4" inputMode="url" />
            </div>
            <div>
              <label htmlFor="video-title" className="sr-only">Title (optional)</label>
              <input id="video-title" className={`${inputClass} !mt-0`} value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder="Title (optional)" maxLength={100} />
            </div>
          </div>
          <button type="submit" className={primaryBtn}>Set video</button>
          <p className="text-xs text-muted">
            Use a direct link to a video file (.mp4 or .webm) that you have the right to use. YouTube, Netflix and other streaming
            sites do not work here.
          </p>
        </form>
      )}
      {formError && <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{formError}</p>}
    </section>
  )
}
