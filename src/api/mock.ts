// In-browser stand-in for the real backend, so the UI can be previewed before Supabase is set up.
// State lives in localStorage and syncs across tabs through the `storage` event.
import { GAME_DURATION_MS, PASS_RATE, SESSION_KEY } from '../config'
import { DEPARTMENTS } from '../data/departments'
import { SAMPLE_QUESTIONS } from '../data/questions.sample'
import { hashSeed, mulberry32, randomToken, shuffled } from '../lib/rng'
import { sameName } from '../lib/validate'
import { ApiError, type Attempt, type GameApi, type GameState, type GameStatus, type Player } from './types'

const DB_KEY = 'vng23-mock-db'
const LATENCY_MS = 120
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L

interface StoredAttempt extends Attempt {
  questionOrder: string[]
  optionOrder: Record<string, number[]>
  answers: Record<string, string>
}

interface Db {
  game: { status: GameStatus; openedAt: number | null; endsAt: number | null }
  extraLobby: number
  attempts: Record<string, StoredAttempt>
}

const freshDb = (): Db => ({ game: { status: 'waiting', openedAt: null, endsAt: null }, extraLobby: 127, attempts: {} })

function read(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    return raw ? (JSON.parse(raw) as Db) : freshDb()
  } catch {
    return freshDb()
  }
}

const listeners = new Set<(s: GameState) => void>()

function write(db: Db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  emit(db)
}

function emit(db: Db) {
  const state = toState(db)
  listeners.forEach((l) => l(state))
}

window.addEventListener('storage', (e) => {
  if (e.key === DB_KEY) emit(read())
})

function statusAt(db: Db, now: number): GameStatus {
  const { status, endsAt } = db.game
  return status === 'open' && endsAt !== null && now >= endsAt ? 'closed' : status
}

function toState(db: Db): GameState {
  const now = Date.now()
  return {
    status: statusAt(db, now),
    openedAt: db.game.openedAt,
    endsAt: db.game.endsAt,
    lobbyCount: db.extraLobby + Object.keys(db.attempts).length,
    serverNow: now,
  }
}

const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

const publicAttempt = (a: StoredAttempt): Attempt => ({
  token: a.token,
  code: a.code,
  player: a.player,
  enteredAt: a.enteredAt,
  submittedAt: a.submittedAt,
  autoSubmitted: a.autoSubmitted,
})

const findByToken = (db: Db, token: string) => Object.values(db.attempts).find((a) => a.token === token)

/** Once the game has closed, an unsubmitted attempt counts as submitted at closing time. */
function settle(db: Db, a: StoredAttempt): boolean {
  if (a.submittedAt || statusAt(db, Date.now()) !== 'closed') return false
  a.submittedAt = db.game.endsAt ?? Date.now()
  a.autoSubmitted = true
  return true
}

function makeCode(db: Db, rand: () => number): string {
  const taken = new Set(Object.values(db.attempts).map((a) => a.code))
  for (;;) {
    let code = 'VN23-'
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
    if (!taken.has(code)) return code
  }
}

function newAttempt(db: Db, player: Player, enteredAt: number): StoredAttempt {
  const token = randomToken()
  const rand = mulberry32(hashSeed(token))
  return {
    token,
    code: makeCode(db, rand),
    player,
    enteredAt,
    submittedAt: null,
    autoSubmitted: false,
    questionOrder: shuffled(
      SAMPLE_QUESTIONS.map((q) => q.id),
      rand,
    ),
    optionOrder: Object.fromEntries(
      SAMPLE_QUESTIONS.map((q) => {
        const order = q.options.map((_, i) => i)
        return [q.id, q.keepOrder ? order : shuffled(order, rand)]
      }),
    ),
    answers: {},
  }
}

export const mockApi: GameApi = {
  getState: () => later(toState(read())),

  subscribe(onChange) {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  },

  getDepartments: () => later(DEPARTMENTS),

  // Any code passes in the preview; the DEV panel links to `?k=DEMO`.
  checkEntry: (code) => later(code.trim().length > 0),

  async join(player, entryCode) {
    if (!entryCode.trim()) throw new ApiError('BAD_ENTRY')
    const db = read()
    const existing = db.attempts[player.phone]
    if (existing) {
      if (!sameName(existing.player.name, player.name)) throw new ApiError('PHONE_TAKEN')
      if (settle(db, existing)) write(db)
      return later(publicAttempt(existing))
    }
    if (statusAt(db, Date.now()) === 'closed') throw new ApiError('GAME_CLOSED')
    const attempt = newAttempt(db, player, Date.now())
    db.attempts[player.phone] = attempt
    write(db)
    return later(publicAttempt(attempt))
  },

  async getAttempt(token) {
    const db = read()
    const a = findByToken(db, token)
    if (!a) return later(null)
    if (settle(db, a)) write(db)
    return later(publicAttempt(a))
  },

  async getQuiz(token) {
    const db = read()
    const a = findByToken(db, token)
    if (!a) throw new ApiError('NOT_FOUND')
    if (statusAt(db, Date.now()) !== 'open') throw new ApiError('NOT_OPEN')
    const byId = new Map(SAMPLE_QUESTIONS.map((q) => [q.id, q]))
    const questions = a.questionOrder.map((id) => {
      const q = byId.get(id)!
      return { id, text: q.text, options: a.optionOrder[id].map((i) => ({ id: `${id}:${i}`, text: q.options[i] })) }
    })
    return later({ questions, answers: { ...a.answers } })
  },

  async saveAnswer(token, questionId, optionId) {
    const db = read()
    const a = findByToken(db, token)
    if (!a) throw new ApiError('NOT_FOUND')
    if (a.submittedAt) throw new ApiError('ALREADY_SUBMITTED')
    if (statusAt(db, Date.now()) !== 'open') throw new ApiError('NOT_OPEN')
    if (!optionId.startsWith(`${questionId}:`)) throw new ApiError('NOT_FOUND')
    a.answers[questionId] = optionId
    write(db)
    await later(undefined)
  },

  async submit(token) {
    const db = read()
    const a = findByToken(db, token)
    if (!a) throw new ApiError('NOT_FOUND')
    if (!a.submittedAt) {
      const now = Date.now()
      const end = db.game.endsAt ?? now
      a.autoSubmitted = now >= end
      a.submittedAt = Math.min(now, end)
      write(db)
    }
    return later(publicAttempt(a))
  },
}

// ---- Dev controls (preview only) -------------------------------------------------

export interface LeaderRow {
  rank: number | null
  name: string
  department: string
  correct: number
  total: number
  durationMs: number
  enteredAt: number
}

export const mockDev = {
  open() {
    const db = read()
    const now = Date.now()
    db.game = { status: 'open', openedAt: now, endsAt: now + GAME_DURATION_MS }
    write(db)
  },
  /** Moves the clock so the open game has `ms` left. */
  setRemaining(ms: number) {
    const db = read()
    if (db.game.status !== 'open') return
    const endsAt = Date.now() + ms
    db.game.endsAt = endsAt
    db.game.openedAt = endsAt - GAME_DURATION_MS
    write(db)
  },
  close() {
    const db = read()
    const now = Date.now()
    db.game.status = 'closed'
    db.game.endsAt = Math.min(db.game.endsAt ?? now, now)
    write(db)
  },
  addLobby(n: number) {
    const db = read()
    db.extraLobby += n
    write(db)
  },
  reset() {
    localStorage.removeItem(DB_KEY)
    localStorage.removeItem(SESSION_KEY)
  },
  /** Ranking rule: ≥80% correct, then most correct, then fastest, then earliest entry. */
  leaderboard(): LeaderRow[] {
    const db = read()
    const byId = new Map(SAMPLE_QUESTIONS.map((q) => [q.id, q]))
    const total = SAMPLE_QUESTIONS.length
    const rows = Object.values(db.attempts)
      .filter((a) => a.submittedAt)
      .map((a) => {
        const correct = Object.entries(a.answers).filter(([qid, oid]) => oid === `${qid}:${byId.get(qid)?.correct}`).length
        const start = Math.max(a.enteredAt, db.game.openedAt ?? a.enteredAt)
        return { name: a.player.name, department: a.player.department, correct, total, durationMs: (a.submittedAt ?? start) - start, enteredAt: a.enteredAt }
      })
      .sort((x, y) => y.correct - x.correct || x.durationMs - y.durationMs || x.enteredAt - y.enteredAt)
    let rank = 0
    return rows.map((r) => ({ ...r, rank: r.correct / total >= PASS_RATE ? ++rank : null }))
  },
  /** Seeds a ready-made state from `?preview=lobby|quiz|warning|done|timeup|closed` for quick review. */
  seedPreview(kind: string) {
    const now = Date.now()
    const db = freshDb()
    const player = { name: 'Nguyễn Văn An', phone: '0912345678', department: 'IT' }
    const a = newAttempt(db, player, now - 90_000)
    db.attempts[player.phone] = a
    const openAt = (msAgo: number) => {
      db.game = { status: 'open', openedAt: now - msAgo, endsAt: now - msAgo + GAME_DURATION_MS }
    }
    const answerFirst = (n: number) => {
      for (const qid of a.questionOrder.slice(0, n)) a.answers[qid] = `${qid}:${a.optionOrder[qid][0]}`
    }
    if (kind === 'quiz') { openAt(5 * 60_000 + 28_000); answerFirst(4) }
    if (kind === 'warning') { openAt(GAME_DURATION_MS - 45_000); answerFirst(17) }
    if (kind === 'done') { openAt(12 * 60_000); answerFirst(20); a.submittedAt = now - 60_000 }
    if (kind === 'timeup') { db.game = { status: 'closed', openedAt: now - GAME_DURATION_MS - 60_000, endsAt: now - 60_000 }; answerFirst(14); a.submittedAt = now - 60_000; a.autoSubmitted = true }
    if (kind === 'closed') { db.game = { status: 'closed', openedAt: now - GAME_DURATION_MS, endsAt: now }; delete db.attempts[player.phone] }
    localStorage.setItem(DB_KEY, JSON.stringify(db))
    if (kind === 'closed') localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, a.token)
  },
}
