import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Supabase's new "publishable" key and the older "anon" key work the same way here.
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, supabaseKey as string)
  }
  return client
}
