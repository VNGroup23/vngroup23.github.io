import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { API_ERROR_CODES, ApiError, type ApiErrorCode, type Attempt, type GameApi, type GameState, type QuizPayload } from './types'

const POLL_MS = 5000
const RETRIES = 3

let client: SupabaseClient | null = null
function db(): SupabaseClient {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Calls a database function. Every function is idempotent, so network failures are retried. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await db().rpc(fn, args)
    if (!error) return data as T
    const code: ApiErrorCode = (API_ERROR_CODES as readonly string[]).includes(error.message) ? (error.message as ApiErrorCode) : 'NETWORK'
    if (code !== 'NETWORK' || attempt >= RETRIES) throw new ApiError(code, error.message)
    await wait(400 * attempt)
  }
}

export const supabaseApi: GameApi = {
  getState: () => rpc<GameState>('get_state'),

  // Realtime pushes changes to the game row at once; polling also refreshes the lobby
  // count and covers dropped realtime connections.
  subscribe(onChange) {
    let alive = true
    const refresh = () =>
      rpc<GameState>('get_state')
        .then((s) => alive && onChange(s))
        .catch(() => {})
    const channel = db()
      .channel(`game-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game' }, refresh)
      .subscribe()
    const poll = setInterval(refresh, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      db().removeChannel(channel)
    }
  },

  checkEntry: (code) => rpc<boolean>('check_entry', { p_code: code }),

  join: (p, entryCode) =>
    rpc<Attempt>('join_game', {
      p_name: p.name,
      p_phone: p.phone,
      p_entry: entryCode,
      p_user_agent: navigator.userAgent,
    }),

  getAttempt: (token) => rpc<Attempt | null>('get_attempt', { p_token: token }),

  getQuiz: (token) => rpc<QuizPayload>('get_quiz', { p_token: token }),

  saveAnswer: (token, questionId, optionId) =>
    rpc<void>('save_answer', { p_token: token, p_question_id: questionId, p_option_id: optionId }),

  submit: (token) => rpc<Attempt>('submit_attempt', { p_token: token }),
}
