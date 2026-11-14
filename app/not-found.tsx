import Link from 'next/link'
import Logo from '../components/Logo'
import { outlineBtn, primaryBtn } from '../lib/ui'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Link href="/" aria-label="SyncFlix home"><Logo /></Link>
      <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-sm text-muted">This page does not exist, or the link was typed wrong.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={primaryBtn}>Go to the home page</Link>
        <Link href="/rooms" className={outlineBtn}>Explore rooms</Link>
      </div>
    </main>
  )
}
