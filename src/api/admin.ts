import { rpc } from './supabase'
import type { GameState } from './types'

export interface ResultRow {
  id: string
  rank: number | null
  name: string
  phone: string
  code: string
  correct: number
  answered: number
  total: number
  durationMs: number | null
  enteredAt: number
  submittedAt: number | null
  autoSubmitted: boolean
  qualified: boolean
  disqualified: boolean
  disqualifyReason: string | null
  userAgent: string | null
}

export interface AnswerLogRow {
  code: string
  name: string
  phone: string
  questionId: string
  question: string
  answer: string
  isCorrect: boolean
  at: number
}

export const adminApi = {
  check: (key: string) => rpc<boolean>('admin_check', { p_key: key }),
  open: (key: string) => rpc<GameState>('admin_open', { p_key: key }),
  close: (key: string) => rpc<GameState>('admin_close', { p_key: key }),
  setRemaining: (key: string, seconds: number) => rpc<GameState>('admin_set_remaining', { p_key: key, p_seconds: seconds }),
  reveal: (key: string, on: boolean) => rpc<GameState>('admin_reveal', { p_key: key, p_on: on }),
  reset: (key: string) => rpc<GameState>('admin_reset', { p_key: key }),
  setTestMode: (key: string, on: boolean) => rpc<GameState>('admin_set_test_mode', { p_key: key, p_on: on }),
  results: (key: string) => rpc<ResultRow[]>('admin_results', { p_key: key }),
  disqualify: (key: string, attemptId: string, reason: string | null) =>
    rpc<void>('admin_disqualify', { p_key: key, p_attempt_id: attemptId, p_reason: reason }),
  answerLog: (key: string) => rpc<AnswerLogRow[]>('admin_answer_log', { p_key: key }),
  entryCode: (key: string) => rpc<string>('admin_entry', { p_key: key }),
  rotateEntryCode: (key: string) => rpc<string>('admin_rotate_entry', { p_key: key }),
}
