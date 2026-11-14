'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Logo from './Logo'
import { useAuth } from './AuthProvider'
import { getSupabase } from '../lib/supabase'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  const router = useRouter()
  const { user, configured } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let next = '/dashboard'
    try {
      const saved = sessionStorage.getItem('syncflix_next')
      sessionStorage.removeItem('syncflix_next')
      if (saved && saved.startsWith('/') && !saved.startsWith('//')) next = saved
    } catch {}
    router.replace(next)
  }, [user, router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    const supabase = getSupabase()
    if (!supabase) {
      setError('SyncFlix is not connected to its database yet.')
      return
    }

    const name = username.trim().toLowerCase()
    if (isSignup) {
      if (!/^[a-z0-9_]{3,20}$/.test(name)) {
        setError('Username must be 3 to 20 characters: letters, numbers and underscore only.')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
    }

    setBusy(true)
    try {
      if (isSignup) {
        const { data: free } = await supabase.rpc('username_available', { name })
        if (free === false) {
          setError('That username is already taken. Try another one.')
          return
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: name } },
        })
        if (err) {
          setError(
            /registered|exists/i.test(err.message)
              ? 'An account with this email already exists. Try logging in.'
              : err.message
          )
          return
        }
        if (!data.session) {
          setNotice('Account created. Check your email and open the confirmation link, then log in.')
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) {
          setError(
            /invalid login/i.test(err.message)
              ? 'Wrong email or password.'
              : /not confirmed/i.test(err.message)
                ? 'Please confirm your email first. Check your inbox.'
                : err.message
          )
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <Link href="/" aria-label="SyncFlix home" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Logo />
      </Link>

      <div className="mt-10 w-full max-w-md rounded-2xl border border-line bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-muted">
          {isSignup ? 'Join SyncFlix and start watching with friends.' : 'Log in to join your rooms.'}
        </p>

        {!configured && (
          <p className="mt-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted" role="alert">
            This site is not connected to its database yet, so accounts cannot be created or used.
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {isSignup && (
            <div>
              <label htmlFor="username" className="text-sm font-medium">Username</label>
              <input id="username" className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="nadia_01" required />
            </div>
          )}
          <div>
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} required />
          </div>

          {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}

          <button type="submit" disabled={busy || !configured} className="w-full rounded-xl bg-brand-gradient px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {isSignup ? 'Already have an account? ' : 'New to SyncFlix? '}
          <Link href={isSignup ? '/login' : '/signup'} className="font-semibold text-foreground underline underline-offset-4 hover:text-primary">
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </main>
  )
}
