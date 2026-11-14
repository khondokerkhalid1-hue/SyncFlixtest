const features = [
  { title: 'Synchronized playback', text: 'Play, pause, seek and episode changes reach everyone in the room. Late joiners catch up to the current moment, and small drifts are corrected quietly.', wide: true },
  { title: 'Public and private rooms', text: 'Open a room to everyone, or keep it private with an invite link or room code.' },
  { title: 'Live chat and reactions', text: 'Chat with friends, see who is online, and react with emoji.' },
  { title: 'Shared playlist', text: 'Queue videos or episodes and let the next one start automatically.' },
  { title: 'Host controls', text: 'The host controls playback, manages the queue, removes members and passes the host role on.', wide: true },
  { title: 'Made for phone and PC', text: 'A layout built for Android screens as well as laptops, not just a shrunk desktop page.' },
]

export default function Features() {
  return (
    <section id="features" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Everything a watch party needs</h2>
        <p className="mt-3 max-w-xl text-muted">SyncFlix handles the timing so you can enjoy the show.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className={`rounded-2xl border border-line bg-card p-6 ${f.wide ? 'md:col-span-2' : ''}`}>
              <h3 className="text-lg font-bold">{f.title}</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">{f.text}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          SyncFlix plays videos you have the right to use, such as direct video links. It does not work with
          protected streaming services.
        </p>
      </div>
    </section>
  )
}
