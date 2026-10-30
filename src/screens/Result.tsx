import type { Attempt } from '../api'
import { Confetti } from '../components/Effects'
import { Icon } from '../components/Icon'
import { DiamondDivider, Logo, stagger } from '../components/ui'
import { TOP_N } from '../config'
import { formatClock, formatPhone } from '../lib/format'

export type ResultKind = 'done' | 'timeup' | 'closed'

const COPY: Record<ResultKind, { title: string; body: string }> = {
  done: { title: 'Đã nộp bài!', body: `Cảm ơn bạn đã tham gia. BTC sẽ công bố Top ${TOP_N} trên màn hình sự kiện.` },
  timeup: { title: 'Hết giờ!', body: `Bài làm của bạn đã được tự động nộp. BTC sẽ công bố Top ${TOP_N} trên màn hình sự kiện.` },
  closed: { title: 'Game đã kết thúc', body: `Cảm ơn bạn đã quan tâm. Hãy theo dõi Top ${TOP_N} trên màn hình sự kiện nhé!` },
}

export function Result({ kind, attempt }: { kind: ResultKind; attempt: Attempt | null }) {
  const copy = COPY[kind]
  const celebrate = kind === 'done'
  return (
    <main className="screen screen--result">
      {celebrate && <Confetti />}
      <Logo className="rise" />
      <div className={`medal medal--${celebrate ? 'gold' : 'danger'}`}>
        {celebrate && <span className="medal-rays" aria-hidden="true" />}
        <Icon name={celebrate ? 'check' : 'hourglass'} size={48} />
      </div>
      <header className="message rise" style={stagger(2)}>
        <h1 className={`title${celebrate ? ' shimmer-text' : ''}`}>{copy.title}</h1>
        <p className="body muted">{copy.body}</p>
      </header>
      {attempt?.submittedAt && (
        <section className="card ticket rise" style={stagger(3)}>
          <p className="eyebrow muted">Mã bài làm</p>
          <p className="ticket-code">{attempt.code}</p>
          <DiamondDivider wide />
          <dl className="receipt">
            <div>
              <dt>Họ và tên</dt>
              <dd>{attempt.player.name}</dd>
            </div>
            <div>
              <dt>Số điện thoại</dt>
              <dd>{formatPhone(attempt.player.phone)}</dd>
            </div>
            <div>
              <dt>Nộp lúc</dt>
              <dd>
                {formatClock(attempt.submittedAt)}
                {attempt.autoSubmitted ? ' (tự động)' : ''}
              </dd>
            </div>
          </dl>
        </section>
      )}
      <div className="spacer" />
      {attempt?.submittedAt && <p className="eyebrow muted rise" style={stagger(4)}>Chụp màn hình này để đối chiếu khi cần</p>}
    </main>
  )
}
