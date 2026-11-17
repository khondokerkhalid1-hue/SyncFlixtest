import 'server-only'
import { openRange } from './drive'
import { getAccessToken } from './google-auth'
import { supabaseStore } from './store'
import type { StreamDeps } from './stream'

export const realDeps = (): StreamDeps => ({ store: supabaseStore(), openRange, getAccessToken })
