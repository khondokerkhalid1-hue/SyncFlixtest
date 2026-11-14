import Link from 'next/link'
import { primaryBtn, outlineBtn } from '../lib/ui'
import RoomPreview from './RoomPreview'

export default function Hero() {
  return (
    <section id="preview" className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:py-24">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Watch Together.
            <br />
            Feel Together.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            Open a room, send the link, and watch anime, movies and series in sync with your friends.
            Everyone plays the video on their own device, so nobody has to share a screen.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/rooms/new" className={`${primaryBtn} px-7 py-3.5 text-base`}>Create a Room</Link>
            <Link href="/rooms" className={`${outlineBtn} px-7 py-3.5 text-base`}>Explore Rooms</Link>
          </div>
          <p className="mt-5 text-sm text-muted">Runs in your browser on Windows, laptops and Android phones.</p>
        </div>
        <RoomPreview />
      </div>
    </section>
  )
}
