import { useEffect, useRef, useState } from 'react'
import type { Attempt } from '../api'
import { Icon } from '../components/Icon'
import { Logo, stagger } from '../components/ui'
import { GAME_MINUTES, TOP_N } from '../config'
import { formatPhone } from '../lib/format'

const RULES = [
  `${GAME_MINUTES} phút cho cả bài thi, tính từ lúc BTC mở game. Vào muộn sẽ còn ít thời gian hơn.`,
  'Mỗi người có thứ tự câu hỏi và đáp án khác nhau.',
  `Đúng từ 80% số câu trở lên mới được xét Top ${TOP_N}.`,
  'Bằng điểm: ai nhanh hơn xếp trên. Bằng cả giờ: ai vào sớm hơn xếp trên.',
]

export function Lobby({ attempt, lobbyCount }: { attempt: Attempt; lobbyCount: number }) {
  // Re-keying the number replays its "bump" animation whenever someone joins.
  const [bump, setBump] = useState(0)
  const previous = useRef(lobbyCount)
  useEffect(() => {
    if (lobbyCount !== previous.current) {
      previous.current = lobbyCount
      setBump((b) => b + 1)
    }
  }, [lobbyCount])

  return (
    <main className="screen screen--lobby">
      <Logo className="rise" />
      <header className="greeting rise" style={stagger(1)}>
        <p className="eyebrow">Xin chào</p>
        <h1 className="title">{attempt.player.name}</h1>
        <p className="body muted">
          {formatPhone(attempt.player.phone)}
        </p>
      </header>
      <div className="medallion rise" style={stagger(2)}>
        <span key={bump} className={`number${bump ? ' count-bump' : ''}`}>
          {lobbyCount}
        </span>
        <span className="body muted">người đã vào</span>
      </div>
      <p className="status rise" style={stagger(3)}>
        <span className="live-dot" />
        Đang chờ BTC mở game…
      </p>
      <section className="card rules rise" style={stagger(4)}>
        <h2 className="eyebrow">Thể lệ</h2>
        <ul>
          {RULES.map((rule) => (
            <li key={rule}>
              <Icon name="diamond" size={14} className="rule-gem" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
