import Logo from './Logo'

const links = [
  { href: '/reviews', label: 'Community reviews' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#preview', label: 'Preview' },
  { href: '#top', label: 'Back to top' },
]

export default function Footer() {
  return (
    <footer className="border-t border-line bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm font-semibold">Watch Together. Feel Together.</p>
            <p className="mt-2 text-sm text-muted">Watch anime, movies and series with friends in synchronized rooms, each on your own device.</p>
          </div>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-col gap-3 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-muted transition hover:text-foreground">{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} SyncFlix. All rights reserved.</p>
          <p>Only watch videos you have the right to use.</p>
        </div>
      </div>
    </footer>
  )
}
