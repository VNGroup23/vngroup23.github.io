import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type Vars = CSSProperties & Record<`--${string}`, string | number>

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** Twinkling gold four-point stars scattered over the stage. Pure CSS animation. */
export function SparkleField({ count = 22 }: { count?: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        '--x': `${rand(2, 98)}%`,
        '--y': `${rand(2, 96)}%`,
        '--s': `${rand(6, 14)}px`,
        '--d': `${rand(0, 6)}s`,
        '--t': `${rand(2.8, 5.5)}s`,
      })),
    [count],
  )
  return (
    <div className="sparkles" aria-hidden="true">
      {stars.map((style, i) => (
        <span key={i} className="sparkle" style={style as Vars} />
      ))}
    </div>
  )
}

/** One-shot shower of gold diamonds. */
export function Confetti({ count = 56 }: { count?: number }) {
  const pieces = useMemo(() => {
    const colors = ['#FCD17A', '#FFE7AE', '#D9A443', '#F86C31', '#C9A6EE', '#FFF8EC']
    return Array.from({ length: count }, (_, i) => ({
      '--x': `${rand(0, 100)}vw`,
      '--dx': `${rand(-18, 18)}vw`,
      '--rot': `${rand(240, 900) * (i % 2 ? 1 : -1)}deg`,
      '--s': `${rand(6, 12)}px`,
      '--d': `${rand(0, 0.9)}s`,
      '--t': `${rand(2.4, 4.2)}s`,
      '--c': colors[i % colors.length],
    }))
  }, [count])
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="confetti-piece" style={style as Vars} />
      ))}
    </div>
  )
}

/** Rays bursting out of a point; remount (change `key`) to replay. */
export function Burst({ rays = 8 }: { rays?: number }) {
  return (
    <span className="burst" aria-hidden="true">
      {Array.from({ length: rays }, (_, i) => (
        <span key={i} className="burst-ray" style={{ '--a': `${(360 / rays) * i}deg` } as Vars} />
      ))}
    </span>
  )
}

/** Full-screen "game is open" flourish, dismissed on its own or on tap. */
export function StartOverlay({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const leave = setTimeout(() => setLeaving(true), 1500)
    const done = setTimeout(onDone, 1900)
    return () => {
      clearTimeout(leave)
      clearTimeout(done)
    }
  }, [onDone])
  return (
    <div className={`start-overlay${leaving ? ' is-leaving' : ''}`} onClick={onDone} role="status">
      <span className="start-ring" />
      <span className="start-ring start-ring--late" />
      <SparkleField count={16} />
      <p className="eyebrow">BTC đã mở game</p>
      <p className="start-title">Bắt đầu!</p>
    </div>
  )
}
