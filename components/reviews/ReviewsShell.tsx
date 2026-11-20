'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Logo from '../Logo'
import Avatar from '../Avatar'
import { useAuth } from '../AuthProvider'
import { outlineBtn, primaryBtn } from '../../lib/ui'

// Frame for the Reviews pages. Anyone can look; some pages ask for a login.
export default function ReviewsShell({ children, requireLogin = false }: { children: React.ReactNode; requireLogin?: boolean }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (requireLogin && !loading && !user) {
      try {
        sessionStorage.setItem('syncflix_next', window.location.pathname)
      } catch {}
      router.replace('/login')
    }
  }, [requireLogin, loading, user, router])

  const nav = [
    { href: '/reviews', label: 'Reviews' },
    { href: '/reviews/search', label: 'Search' },
    ...(user ? [{ href: '/my-reviews', label: 'My reviews' }, { href: '/dashboard', label: 'Watch rooms' }] : []),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="SyncFlix home" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {loading ? null : user ? (
              <Link href="/profile" className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Your profile">
                <Avatar name={profile?.username ?? '?'} color={profile?.avatar_color ?? '#7C3AED'} />
                <span className="hidden text-sm font-medium sm:inline">{profile?.username}</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className={`${outlineBtn} !px-4 !py-2`}>Log in</Link>
                <Link href="/signup" className={`${primaryBtn} !px-4 !py-2`}>Sign up</Link>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5" aria-label="Reviews navigation">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-card hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {requireLogin && (loading || !user) ? <p className="text-sm text-muted" role="status">Loading...</p> : children}
      </main>

      <footer className="border-t border-line bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          <p>
            This product uses the{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">TMDB</a>{' '}
            API but is not endorsed or certified by TMDB. Title information and pictures are provided by TMDB.
          </p>
        </div>
      </footer>
    </div>
  )
}
