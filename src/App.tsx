import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isMock, type Attempt } from './api'
import { DevPanel } from './components/DevPanel'
import { SparkleField, StartOverlay } from './components/Effects'
import { SESSION_KEY } from './config'
import { useGame } from './lib/useGame'
import { Lobby } from './screens/Lobby'
import { Quiz } from './screens/Quiz'
import { Register } from './screens/Register'
import { Result } from './screens/Result'

type View = 'loading' | 'register' | 'lobby' | 'quiz' | 'done' | 'timeup' | 'closed'

export default function App() {
  const { state, serverNow } = useGame()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [booting, setBooting] = useState(true)
  const [showStart, setShowStart] = useState(false)
  const previousView = useRef<View>('loading')

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

  const join = useCallback((a: Attempt) => {
    localStorage.setItem(SESSION_KEY, a.token)
    setAttempt(a)
  }, [])
  const hideStart = useCallback(() => setShowStart(false), [])

  let view: View = 'loading'
  if (!booting && state) {
    if (!attempt) view = state.status === 'closed' ? 'closed' : 'register'
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
      {view === 'register' && state && <Register status={state.status} onJoined={join} />}
      {view === 'lobby' && attempt && state && <Lobby attempt={attempt} lobbyCount={state.lobbyCount} />}
      {view === 'quiz' && attempt && state && <Quiz attempt={attempt} state={state} serverNow={serverNow} onSubmitted={setAttempt} />}
      {(view === 'done' || view === 'timeup' || view === 'closed') && <Result kind={view} attempt={attempt} />}
      {showStart && <StartOverlay onDone={hideStart} />}
      {isMock && <DevPanel />}
    </>
  )
}
