import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isMock, type Attempt } from './api'
import { DevPanel } from './components/DevPanel'
import { SparkleField, StartOverlay } from './components/Effects'
import { SESSION_KEY } from './config'
import { forgetEntryCode, readEntryCode } from './lib/entry'
import { useGame } from './lib/useGame'
import { Gate } from './screens/Gate'
import { Lobby } from './screens/Lobby'
import { Quiz } from './screens/Quiz'
import { Register } from './screens/Register'
import { Result } from './screens/Result'

type View = 'loading' | 'gate' | 'register' | 'lobby' | 'quiz' | 'done' | 'timeup' | 'closed'

export default function App() {
  const { state, serverNow } = useGame()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [booting, setBooting] = useState(true)
  const [showStart, setShowStart] = useState(false)
  const previousView = useRef<View>('loading')
  // Only someone who scanned the event QR code (carrying a valid entry code) may register.
  const [entryCode, setEntryCode] = useState(readEntryCode)
  const [entryOk, setEntryOk] = useState<boolean | null>(null)
  const [entryExpired, setEntryExpired] = useState(false)

  useEffect(() => {
    if (!entryCode) {
      setEntryOk(false)
      return
    }
    let alive = true
    api
      .checkEntry(entryCode)
      .then((ok) => {
        if (!alive) return
        setEntryOk(ok)
        if (!ok) {
          forgetEntryCode()
          setEntryExpired(true)
        }
      })
      // Unreachable server: show the form and let joining give the verdict.
      .catch(() => alive && setEntryOk(true))
    return () => {
      alive = false
    }
  }, [entryCode])

  const badEntry = useCallback(() => {
    forgetEntryCode()
    setEntryCode(null)
    setEntryExpired(true)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY)
    if (!token) {
      setBooting(false)
      return
    }
    api
      .getAttempt(token)
      .then((a) => {
        if (!a) localStorage.removeItem(SESSION_KEY)
        setAttempt(a)
      })
      .catch(() => {})
      .finally(() => setBooting(false))
  }, [])

  // When the game closes under an unsubmitted attempt, the server settles it; fetch the result.
  const status = state?.status
  useEffect(() => {
    if (status === 'closed' && attempt && !attempt.submittedAt) {
      api.getAttempt(attempt.token).then((a) => a && setAttempt(a))
    }
  }, [status, attempt])

  // Test mode switched on while this player waited in the lobby: fetch their own deadline.
  const needsDeadline = !!state?.testMode && !!attempt && !attempt.submittedAt && attempt.deadline == null
  const token = attempt?.token
  useEffect(() => {
    if (needsDeadline && token) api.getAttempt(token).then((a) => a && setAttempt(a))
  }, [needsDeadline, token])

  const join = useCallback((a: Attempt) => {
    localStorage.setItem(SESSION_KEY, a.token)
    setAttempt(a)
  }, [])
  const hideStart = useCallback(() => setShowStart(false), [])

  let view: View = 'loading'
  if (!booting && state) {
    if (!attempt) view = state.status === 'closed' ? 'closed' : entryOk === null ? 'loading' : entryOk ? 'register' : 'gate'
    else if (attempt.submittedAt) view = attempt.autoSubmitted ? 'timeup' : 'done'
    else if (state.status === 'waiting') view = 'lobby'
    else if (state.status === 'open') view = 'quiz'
  }

  useEffect(() => {
    if (view === 'quiz' && (previousView.current === 'lobby' || previousView.current === 'register')) setShowStart(true)
    previousView.current = view
  }, [view])

  return (
    <>
      <div className="stage" aria-hidden="true">
        <SparkleField count={view === 'quiz' ? 10 : 22} />
      </div>
      {view === 'loading' && (
        <main className="screen screen--center">
          <div className="loader" />
        </main>
      )}
      {view === 'gate' && <Gate expired={entryExpired} />}
      {view === 'register' && state && entryCode && (
        <Register status={state.status} entryCode={entryCode} onJoined={join} onBadEntry={badEntry} />
      )}
      {view === 'lobby' && attempt && state && <Lobby attempt={attempt} lobbyCount={state.lobbyCount} />}
      {view === 'quiz' && attempt && state && <Quiz attempt={attempt} state={state} serverNow={serverNow} onSubmitted={setAttempt} />}
      {(view === 'done' || view === 'timeup' || view === 'closed') && <Result kind={view} attempt={attempt} />}
      {showStart && <StartOverlay onDone={hideStart} />}
      {isMock && <DevPanel />}
    </>
  )
}
