export type GameStatus = 'waiting' | 'open' | 'closed'

export interface GameState {
  status: GameStatus
  openedAt: number | null
  endsAt: number | null
  lobbyCount: number
  /** BTC has revealed the winners on the event screen. */
  resultsRevealed?: boolean
  /** Rehearsal mode: no lobby, every player gets their own 20 minutes from joining. */
  testMode?: boolean
  /** Server clock when this state was produced; clients derive their clock offset from it. */
  serverNow: number
}

export interface Player {
  name: string
  phone: string
}

export interface Attempt {
  token: string
  code: string
  player: Player
  enteredAt: number
  submittedAt: number | null
  autoSubmitted: boolean
  /** When this attempt's time runs out; null while the game has not opened. */
  deadline?: number | null
}

export interface QuizOption {
  id: string
  text: string
}

/** A question as this attempt sees it: already in the attempt's own order, without the answer key. */
export interface QuizQuestion {
  id: string
  text: string
  options: QuizOption[]
}

export interface QuizPayload {
  questions: QuizQuestion[]
  /** questionId → optionId the player already picked (for resuming). */
  answers: Record<string, string>
}

export const API_ERROR_CODES = [
  'BAD_ENTRY',
  'PHONE_TAKEN',
  'GAME_CLOSED',
  'NOT_OPEN',
  'NOT_FOUND',
  'ALREADY_SUBMITTED',
  'INVALID_NAME',
  'INVALID_PHONE',
  'NO_QUESTIONS',
  'NOT_WAITING',
  'FORBIDDEN',
  'RETRY',
  'NETWORK',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export class ApiError extends Error {
  readonly code: ApiErrorCode
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export interface GameApi {
  getState(): Promise<GameState>
  subscribe(onChange: (state: GameState) => void): () => void
  /** Whether a code from the event-screen QR code is the current entry code. */
  checkEntry(code: string): Promise<boolean>
  /** Creates an attempt, or resumes the existing one when phone and name match. Needs the QR entry code. */
  join(player: Player, entryCode: string): Promise<Attempt>
  getAttempt(token: string): Promise<Attempt | null>
  getQuiz(token: string): Promise<QuizPayload>
  saveAnswer(token: string, questionId: string, optionId: string): Promise<void>
  submit(token: string): Promise<Attempt>
}
