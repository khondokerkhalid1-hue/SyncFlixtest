import type { Metadata } from 'next'
import '@fontsource-variable/plus-jakarta-sans'
import './globals.css'
import AuthProvider from '../components/AuthProvider'

export const metadata: Metadata = {
  title: 'SyncFlix - Watch Together. Feel Together.',
  description:
    'SyncFlix is a watch-party platform where friends watch anime, movies, and series together in synchronized rooms.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background font-sans text-foreground antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
