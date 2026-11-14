const chat = [
  { name: 'Rafi', color: 'bg-secondary', text: 'Ready when you are' },
  { name: 'Nadia', color: 'bg-primary', text: 'Host pressed play, we are in sync' },
  { name: 'Imran', color: 'bg-teal-600', text: 'That opening scene though' },
]

export default function RoomPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-primary/10" role="img" aria-label="Illustration of a SyncFlix watch room with video, chat and members">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Friday Anime Night</p>
          <p className="text-xs text-muted">Hosted by Nadia</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          In sync
        </span>
      </div>

      <div className="grid md:grid-cols-[1fr_13rem]">
        <div>
          <div className="relative aspect-video overflow-hidden bg-[#0e0e14]">
            <div className="absolute -left-10 top-4 h-48 w-48 rounded-full bg-primary/50 blur-3xl" />
            <div className="absolute -right-6 bottom-0 h-52 w-52 rounded-full bg-secondary/50 blur-3xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
            </div>
            <p className="absolute bottom-3 left-4 text-xs text-white/80">Episode 3</p>
          </div>
          <div className="px-4 py-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full w-full origin-left animate-playhead rounded-full bg-brand-gradient" />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>Everyone is at the same moment</span>
              <span className="flex -space-x-2">
                {['N', 'R', 'I', 'S'].map((l, i) => (
                  <span key={l} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-white ${['bg-primary', 'bg-secondary', 'bg-teal-600', 'bg-surface'][i]}`}>
                    {l}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-line p-4 md:border-l md:border-t-0">
          <p className="mb-3 text-xs font-semibold text-muted">Room chat</p>
          <ul className="space-y-3">
            {chat.map((m) => (
              <li key={m.name} className="flex gap-2">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${m.color}`}>{m.name[0]}</span>
                <div>
                  <p className="text-xs font-semibold">{m.name}</p>
                  <p className="text-xs text-muted">{m.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
