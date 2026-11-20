'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Logo from './Logo'
import Avatar from './Avatar'
import { useAuth } from './AuthProvider'
import { outlineBtn } from '../lib/ui'

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/rooms', label: 'Explore rooms' },
  { href: '/rooms/new', label: 'Create room' },
  { href: '/join', label: 'Join with code' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/my-reviews', label: 'My reviews' },
  { href: '/drive', label: 'My videos' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, profile, loading, signOut } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      try {
        sessionStorage.setItem('syncflix_next', window.location.pathname)
      } catch {}
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted" role="status">
        Loading...
      </main>
    )
  }

  const name = profile?.username ?? 'friend'

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="SyncFlix home" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <Avatar name={name} color={profile?.avatar_color ?? '#7C3AED'} />
            <span className="hidden text-sm font-medium sm:inline">{name}</span>
            <button onClick={signOut} className={`${outlineBtn} !px-4 !py-2`}>Log out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5" aria-label="App navigation">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-card hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  )
}
