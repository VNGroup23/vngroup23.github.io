import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Attempt, type GameState, type QuizQuestion } from '../api'
import { Icon } from '../components/Icon'
import { AnswerOption, Button, DiamondDivider, Sheet } from '../components/ui'
import { WARNING_MS } from '../config'
import { formatCountdown, pad2 } from '../lib/format'
import { useTicker } from '../lib/useGame'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

interface Props {
  attempt: Attempt
  state: GameState
  serverNow: () => number
  onSubmitted: (a: Attempt) => void
}

export function Quiz({ attempt, state, serverNow, onSubmitted }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [sheet, setSheet] = useState<'grid' | 'confirm' | null>(null)
  const [burstKey, setBurstKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const submitting = useRef(false)
  const now = useTicker(serverNow)

  useEffect(() => {
    let alive = true
    let retry: ReturnType<typeof setTimeout>
    const load = () =>
      api
        .getQuiz(attempt.token)
        .then((payload) => {
          if (!alive) return
          setQuestions(payload.questions)
          setAnswers(payload.answers)
          const firstOpen = payload.questions.findIndex((q) => !payload.answers[q.id])
          setIndex(firstOpen === -1 ? payload.questions.length - 1 : firstOpen)
        })
        .catch(() => {
          if (alive) retry = setTimeout(load, 1000)
        })
    load()
    return () => {
      alive = false
      clearTimeout(retry)
    }
  }, [attempt.token])

  const submit = useCallback(async () => {
    if (submitting.current) return
    submitting.current = true
    try {
      onSubmitted(await api.submit(attempt.token))
    } catch {
      submitting.current = false
      setToast('Chưa nộp được bài. Kiểm tra mạng rồi thử lại nhé.')
    }
  }, [attempt.token, onSubmitted])

  // In test mode each player has their own window from joining; otherwise everyone shares BTC's.
  const endsAt = (state.testMode ? attempt.deadline : state.endsAt) ?? 0
  const total = Math.max(1, endsAt - ((state.testMode ? attempt.enteredAt : state.openedAt) ?? 0))
  const remaining = Math.max(0, endsAt - now)
  const danger = remaining <= WARNING_MS

  useEffect(() => {
    if (endsAt && remaining <= 0) submit()
  }, [endsAt, remaining, submit])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  if (!questions) {
    return (
      <main className="screen screen--center">
        <div className="loader" />
      </main>
    )
  }

  const question = questions[index]
  const answeredCount = questions.filter((q) => answers[q.id]).length
  const unanswered = questions.flatMap((q, i) => (answers[q.id] ? [] : [i + 1]))
  const isLast = index === questions.length - 1
  const segClass = (q: QuizQuestion, i: number) => (i === index ? ' is-current' : answers[q.id] ? ' is-done' : '')

  function choose(optionId: string) {
    const qid = question.id
    const previous = answers[qid]
    if (previous === optionId) return
    setAnswers((a) => ({ ...a, [qid]: optionId }))
    setBurstKey((k) => k + 1)
    api.saveAnswer(attempt.token, qid, optionId).catch(() => {
      setAnswers((a) => {
        const next = { ...a }
        if (previous) next[qid] = previous
        else delete next[qid]
        return next
      })
      setToast('Chưa lưu được đáp án. Kiểm tra mạng rồi chọn lại nhé.')
    })
  }

  return (
    <main className="screen screen--quiz">
      <header className="quiz-top">
        <div className="quiz-top-meta">
          <p className="eyebrow">
            Câu {pad2(index + 1)} / {questions.length}
          </p>
          <p className="eyebrow muted">Đã làm {answeredCount} câu</p>
        </div>
        <Button variant="glass" onClick={() => setSheet('confirm')}>
          Nộp bài
        </Button>
      </header>

      <button type="button" className="progress" onClick={() => setSheet('grid')} aria-label="Xem danh sách câu">
        {questions.map((q, i) => (
          <span key={q.id} className={`seg${segClass(q, i)}`} />
        ))}
      </button>

      <section className="quiz-body" key={question.id}>
        <DiamondDivider />
        <h1 className="question">{question.text}</h1>
        <div className="answers">
          {question.options.map((o, i) => (
            <AnswerOption
              key={o.id}
              letter={LETTERS[i]}
              text={o.text}
              selected={answers[question.id] === o.id}
              burstKey={burstKey}
              onSelect={() => choose(o.id)}
            />
          ))}
        </div>
        {danger && (
          <p className="time-warning" role="alert">
            <Icon name="alert" />
            Còn dưới 1 phút! Hết giờ, bài sẽ tự động nộp.
          </p>
        )}
      </section>

      <footer className={`hud${danger ? ' is-danger' : ''}`}>
        <div className="timebar">
          <span className="timebar-fill" style={{ width: `${(remaining / total) * 100}%` }} />
        </div>
        <div className="hud-row">
          <div className="timer">
            <span className="timer-digits">{formatCountdown(remaining)}</span>
            <span className="eyebrow muted">Còn lại</span>
          </div>
          <Button variant="glass" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
            Trước
          </Button>
          {isLast ? (
            <Button onClick={() => setSheet('confirm')}>Nộp bài</Button>
          ) : (
            <Button onClick={() => setIndex((i) => i + 1)}>Câu sau</Button>
          )}
        </div>
      </footer>

      {sheet === 'grid' && (
        <Sheet title="Danh sách câu" onClose={() => setSheet(null)}>
          <div className="qgrid">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                className={`qchip${segClass(q, i)}`}
                onClick={() => {
                  setIndex(i)
                  setSheet(null)
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="legend">
            <span><i className="is-done" />Đã làm</span>
            <span><i className="is-current" />Đang xem</span>
            <span><i />Chưa làm</span>
          </p>
        </Sheet>
      )}

      {sheet === 'confirm' && (
        <Sheet title="Nộp bài ngay?" onClose={() => setSheet(null)}>
          <p className="body muted">
            {unanswered.length
              ? `Bạn còn ${unanswered.length} câu chưa trả lời (câu ${unanswered.slice(0, 8).join(', ')}${unanswered.length > 8 ? '…' : ''}). `
              : `Bạn đã trả lời đủ ${questions.length} câu. `}
            Sau khi nộp, bạn sẽ không sửa được nữa.
          </p>
          <div className="sheet-actions">
            <Button variant="glass" onClick={() => setSheet(null)}>
              Làm tiếp
            </Button>
            <Button
              onClick={() => {
                setSheet(null)
                submit()
              }}
            >
              Nộp bài
            </Button>
          </div>
        </Sheet>
      )}

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </main>
  )
}
