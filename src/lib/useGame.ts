import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type GameState } from '../api'

/** Live game state plus a clock aligned to the server's. */
export function useGame() {
  const [state, setState] = useState<GameState | null>(null)
  const offset = useRef(0)

  useEffect(() => {
    let alive = true
    const apply = (s: GameState) => {
      offset.current = s.serverNow - Date.now()
      if (alive) setState(s)
    }
    api.getState().then(apply)
    const unsubscribe = api.subscribe(apply)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const serverNow = useCallback(() => Date.now() + offset.current, [])
  return { state, serverNow }
}

/** Re-renders every `intervalMs` and returns the current server time. */
export function useTicker(serverNow: () => number, intervalMs = 250): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(id)
  }, [serverNow, intervalMs])
  return now
}
