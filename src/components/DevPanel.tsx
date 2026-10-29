import { useEffect, useState } from 'react'
import { mockDev, type LeaderRow } from '../api/mock'
import { formatCountdown } from '../lib/format'
import { useGame } from '../lib/useGame'

const PREVIEWS = ['lobby', 'quiz', 'warning', 'done', 'timeup', 'closed']

/** Preview-only controls that stand in for BTC's admin page while the backend is mocked. */
export function DevPanel() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<LeaderRow[]>([])
  const { state } = useGame()

  useEffect(() => {
    if (open) setRows(mockDev.leaderboard())
  }, [open, state])

  return (
    <>
      <button type="button" className="dev-toggle" onClick={() => setOpen((o) => !o)}>
        DEV
      </button>
      {open && (
        <aside className="dev-panel">
          <p>
            Bản xem trước · trạng thái game: <b>{state?.status}</b>
          </p>
          <div className="dev-actions">
            <button type="button" onClick={() => mockDev.open()}>▶ Mở game (20 phút)</button>
            <button type="button" onClick={() => mockDev.setRemaining(65_000)}>⏩ Tua: còn 65 giây</button>
            <button type="button" onClick={() => mockDev.setRemaining(5_000)}>⏩ Tua: còn 5 giây</button>
            <button type="button" onClick={() => mockDev.close()}>■ Đóng game</button>
            <button type="button" onClick={() => mockDev.addLobby(7)}>+7 người vào phòng</button>
            <button
              type="button"
              onClick={() => {
                mockDev.reset()
                location.href = location.pathname
              }}
            >
              ↺ Xoá hết, chơi lại
            </button>
          </div>
          <p>Xếp hạng (đạt ≥80%):</p>
          <ol className="dev-board">
            {rows.length === 0 && <li>Chưa ai nộp bài</li>}
            {rows.map((r) => (
              <li key={r.name + r.enteredAt} className={r.rank ? '' : 'is-out'}>
                {r.rank ?? '–'}. {r.name} · {r.correct}/{r.total} · {formatCountdown(r.durationMs)}
              </li>
            ))}
          </ol>
          <p>Xem nhanh từng màn:</p>
          <p className="dev-links">
            {PREVIEWS.map((p) => (
              <a key={p} href={`?preview=${p}`}>
                {p}
              </a>
            ))}
          </p>
        </aside>
      )}
    </>
  )
}
