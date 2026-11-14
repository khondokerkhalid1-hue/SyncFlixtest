const steps = [
  { title: 'Create a room', text: 'Pick a name, choose public or private, and add a video link.' },
  { title: 'Invite your friends', text: 'Share the room link or code. Private rooms open only with it.' },
  { title: 'Press play together', text: 'The host plays, pauses or skips, and every screen follows.' },
  { title: 'Chat and react', text: 'Talk in the room chat and send reactions while you watch.' },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-3 max-w-xl text-muted">Four steps from an empty room to everyone watching the same moment.</p>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-line bg-card p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
