export type GameStatus = 'waiting' | 'open' | 'closed'

export interface GameState {
  status: GameStatus
  openedAt: number | null
  endsAt: number | null
  lobbyCount: number
  /** Server clock when this state was produced; clients derive their clock offset from it. */
  serverNow: number
}

export interface Player {
  name: string
  phone: string
  department: string
}

export interface Attempt {
  token: string
  code: string
  player: Player
  enteredAt: number
  submittedAt: number | null
  autoSubmitted: boolean
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

export type ApiErrorCode = 'PHONE_TAKEN' | 'GAME_CLOSED' | 'NOT_OPEN' | 'NOT_FOUND' | 'ALREADY_SUBMITTED' | 'NETWORK'

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
  /** Creates an attempt, or resumes the existing one when phone and name match. */
  join(player: Player): Promise<Attempt>
  getAttempt(token: string): Promise<Attempt | null>
  getQuiz(token: string): Promise<QuizPayload>
  saveAnswer(token: string, questionId: string, optionId: string): Promise<void>
  submit(token: string): Promise<Attempt>
}
