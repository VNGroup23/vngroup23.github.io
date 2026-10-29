import { mockApi } from './mock'
import { supabaseApi } from './supabase'
import type { GameApi } from './types'

// Without Supabase settings (e.g. a fresh clone) the app runs on the in-browser mock.
export const isMock = !import.meta.env.VITE_SUPABASE_URL
export const api: GameApi = isMock ? mockApi : supabaseApi

export * from './types'
