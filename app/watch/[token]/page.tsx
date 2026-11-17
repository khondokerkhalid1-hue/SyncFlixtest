import WatchPlayer from '../../../components/WatchPlayer'

export const metadata = {
  title: 'Watch - SyncFlix',
  robots: { index: false, follow: false },
}

export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <WatchPlayer token={token} />
}
