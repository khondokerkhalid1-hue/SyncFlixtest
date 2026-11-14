'use client'

import Link from 'next/link'
import Logo from '../components/Logo'
import { outlineBtn, primaryBtn } from '../lib/ui'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Link href="/" aria-label="SyncFlix home"><Logo /></Link>
      <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-muted">An unexpected problem happened. Try again, or go back to the home page.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button onClick={reset} className={primaryBtn}>Try again</button>
        <Link href="/" className={outlineBtn}>Home page</Link>
      </div>
    </main>
  )
}
