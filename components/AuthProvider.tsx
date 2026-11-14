'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

export type Profile = { id: string; username: string; avatar_color: string }

type AuthState = {
  user: User | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  signOut: () => Promise<void>
  reloadProfile: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: false,
  configured: false,
  signOut: async () => {},
  reloadProfile: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [profileTick, setProfileTick] = useState(0)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase || !userId) {
      setProfile(null)
      return
    }
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, username, avatar_color')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile(data as Profile | null)
      })
    return () => {
      cancelled = true
    }
  }, [userId, profileTick])

  const signOut = async () => {
    await getSupabase()?.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, profile, loading, configured: isSupabaseConfigured, signOut, reloadProfile: () => setProfileTick((t) => t + 1) }}
    >
      {children}
    </AuthContext.Provider>
  )
}
