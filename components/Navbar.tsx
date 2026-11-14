'use client'

import { useState } from 'react'
import Link from 'next/link'
import Logo from './Logo'
import { useAuth } from './AuthProvider'

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#preview', label: 'Preview' },
]

const ghost = 'rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const solid = 'rounded-xl bg-brand-gradient px-4 py-2 text-center text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function AuthActions({ mobile = false }: { mobile?: boolean }) {
  const { user, loading, signOut } = useAuth()
  const wrap = mobile ? 'mt-3 grid grid-cols-2 gap-3' : 'flex items-center gap-2'
  const secondary = mobile ? `${ghost} border border-line bg-card text-center text-foreground` : ghost

  if (loading) return null
  if (user) {
    return (
      <div className={wrap}>
        <button onClick={signOut} className={secondary}>Log out</button>
        <Link href="/dashboard" className={solid}>Dashboard</Link>
      </div>
    )
  }
  return (
    <div className={wrap}>
      <Link href="/login" className={secondary}>Log in</Link>
      <Link href="/signup" className={solid}>Sign up</Link>
    </div>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-background/95">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main navigation">
        <a href="#top" aria-label="SyncFlix home" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Logo />
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm text-muted transition hover:text-foreground">{l.label}</a>
            </li>
          ))}
        </ul>

        <div className="hidden md:block"><AuthActions /></div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-card md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
          </svg>
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base text-muted transition hover:bg-card hover:text-foreground">
                {l.label}
              </a>
            ))}
            <AuthActions mobile />
          </div>
        </div>
      )}
    </header>
  )
}
