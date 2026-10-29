import { mockApi } from './mock'
import type { GameApi } from './types'

// Swapped for the Supabase client once the project credentials arrive.
export const api: GameApi = mockApi
export const isMock = true

export * from './types'
