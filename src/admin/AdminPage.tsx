import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, isMock } from '../api'
import { adminApi, type ResultRow } from '../api/admin'
import { SparkleField } from '../components/Effects'
import { downloadQr, QrImage } from '../components/QrImage'
import { Button, DiamondDivider, Logo } from '../components/ui'
import { TOP_N } from '../config'
import { asText, downloadCsv } from '../lib/csv'
import { playUrl } from '../lib/entry'
import { formatClock, formatCountdown, formatDateTime, formatDuration, formatPhone } from '../lib/format'
import { useGame, useTicker } from '../lib/useGame'

const KEY_STORAGE = 'vng23-admin-key'
const STATUS_LABEL = { waiting: 'Đang chờ mở game', open: 'Đang thi', closed: 'Đã kết thúc' }

/** `dashboard` is BTC's control page (#admin); `qr` is the full-screen QR board (#qr). */
export function AdminPage({ mode }: { mode: 'dashboard' | 'qr' }) {
  const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) ?? '')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(!!key)
  const [loginError, setLoginError] = useState('')

  const login = useCallback(async (candidate: string) => {
    setChecking(true)
    setLoginError('')
    try {
      if (await adminApi.check(candidate)) {
        sessionStorage.setItem(KEY_STORAGE, candidate)
        setKey(candidate)
        setAuthed(true)
      } else {
        sessionStorage.removeItem(KEY_STORAGE)
        setLoginError('Mã quản trị không đúng')
      }
    } catch {
      setLoginError('Không kết nối được, thử lại nhé')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE)
    if (stored && !isMock) login(stored)
  }, [login])

  const logout = () => {
    sessionStorage.removeItem(KEY_STORAGE)
    setAuthed(false)
    setKey('')
  }

  return (
    <>
      <div className="stage" aria-hidden="true" />
      {isMock ? (
        <main className="admin admin--narrow">
          <section className="card">Trang quản trị chỉ chạy khi app đã nối Supabase.</section>
        </main>
      ) : authed ? (
        mode === 'qr' ? <QrBoard adminKey={key} /> : <Dashboard adminKey={key} onLogout={logout} />
      ) : (
        <Login checking={checking} error={loginError} onSubmit={login} />
      )}
    </>
  )
}

function Login({ checking, error, onSubmit }: { checking: boolean; error: string; onSubmit: (key: string) => void }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <main className="admin admin--narrow">
      <Logo />
      <form className="card admin-login" onSubmit={submit}>
        <p className="eyebrow">Trang quản trị BTC</p>
        <div className={`field${error ? ' is-error' : ''}`}>
          <label className="eyebrow field-label" htmlFor="admin-key">
            Mã quản trị
          </label>
          <input
            className="field-input"
            id="admin-key"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <p className="field-hint">{error}</p>
        </div>
        <Button type="submit" block disabled={checking}>
          {checking ? 'Đang kiểm tra…' : 'Vào trang quản trị'}
        </Button>
      </form>
    </main>
  )
}

function Dashboard({ adminKey, onLogout }: { adminKey: string; onLogout: () => void }) {
  const { state, serverNow } = useGame()
  const now = useTicker(serverNow, 500)
  const [rows, setRows] = useState<ResultRow[]>([])
  const [view, setView] = useState<'top' | 'all'>('top')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const fail = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiError ? e.code : 'NETWORK'
      if (code === 'FORBIDDEN') onLogout()
      setMessage(code === 'NOT_WAITING' ? 'Game đã được mở trước đó.' : 'Có lỗi kết nối, thử lại nhé.')
    },
    [onLogout],
  )

  const refresh = useCallback(() => adminApi.results(adminKey).then(setRows).catch(fail), [adminKey, fail])

  const status = state?.status
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh, status])

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
      if (done) setMessage(done)
      await refresh()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const openGame = () =>
    confirm('Mở game? Đồng hồ 20 phút bắt đầu chạy ngay cho tất cả người chơi.') &&
    run(() => adminApi.open(adminKey), 'Đã mở game.')
  const closeGame = () =>
    confirm('Kết thúc game ngay? Bài của mọi người sẽ được tự động nộp.') &&
    run(() => adminApi.close(adminKey), 'Đã kết thúc game.')
  const disqualify = (row: ResultRow) => {
    if (row.disqualified) return run(() => adminApi.disqualify(adminKey, row.id, null))
    const reason = prompt(`Lý do loại ${row.name}?`, 'Thông tin không hợp lệ')
    if (reason) run(() => adminApi.disqualify(adminKey, row.id, reason))
  }

  const exportResults = () =>
    downloadCsv(`ket-qua-23-nam-${Date.now()}.csv`, [
      ['Hạng', 'Họ và tên', 'Số điện thoại', 'Phòng ban', 'Số câu đúng', 'Tổng số câu', 'Tỉ lệ đúng', 'Thời gian làm bài (giây)', 'Vào lúc', 'Nộp lúc', 'Tự động nộp', 'Đạt ≥80%', 'Bị loại', 'Lý do loại', 'Mã bài làm', 'Thiết bị'],
      ...rows.map((r) => [
        r.rank ?? '',
        r.name,
        asText(r.phone),
        r.department,
        r.correct,
        r.total,
        `${Math.round((r.correct / Math.max(1, r.total)) * 1000) / 10}%`,
        r.durationMs === null ? '' : (r.durationMs / 1000).toFixed(1),
        formatDateTime(r.enteredAt),
        r.submittedAt ? formatDateTime(r.submittedAt) : '',
        r.autoSubmitted ? 'Có' : '',
        r.qualified ? 'Có' : '',
        r.disqualified ? 'Có' : '',
        r.disqualifyReason ?? '',
        r.code,
        r.userAgent ?? '',
      ]),
    ])

  const exportLog = () =>
    run(async () => {
      const log = await adminApi.answerLog(adminKey)
      downloadCsv(`lich-su-tra-loi-23-nam-${Date.now()}.csv`, [
        ['Mã bài làm', 'Họ và tên', 'Số điện thoại', 'Mã câu', 'Câu hỏi', 'Đáp án đã chọn', 'Đúng/Sai', 'Thời điểm'],
        ...log.map((l) => [l.code, l.name, asText(l.phone), l.questionId, l.question, l.answer, l.isCorrect ? 'Đúng' : 'Sai', formatDateTime(l.at)]),
      ])
    })

  const submitted = rows.filter((r) => r.submittedAt).length
  const qualified = rows.filter((r) => r.rank !== null).length
  const shown = view === 'top' ? rows.filter((r) => r.rank !== null && r.rank <= TOP_N) : rows
  const remaining = state?.endsAt ? state.endsAt - now : 0

  return (
    <main className="admin">
      <header className="admin-head">
        <Logo className="admin-logo" />
        <div className="admin-head-text">
          <p className="eyebrow">Trang quản trị BTC</p>
          <h1 className="title">Thử thách 23 năm</h1>
        </div>
        <Button variant="glass" onClick={onLogout}>
          Thoát
        </Button>
      </header>

      <section className="card admin-control">
        <div className="admin-status">
          <span className={`pill pill--${status ?? 'waiting'}`}>{status ? STATUS_LABEL[status] : '…'}</span>
          {status === 'open' && <span className="admin-countdown">{formatCountdown(remaining)}</span>}
        </div>
        <dl className="admin-stats">
          <div>
            <dt>Đã vào</dt>
            <dd>{state?.lobbyCount ?? 0}</dd>
          </div>
          <div>
            <dt>Đã nộp</dt>
            <dd>{submitted}</dd>
          </div>
          <div>
            <dt>Đạt ≥80%</dt>
            <dd>{qualified}</dd>
          </div>
        </dl>
        <div className="admin-actions">
          {status === 'waiting' && (
            <Button onClick={openGame} disabled={busy}>
              Mở game (20 phút)
            </Button>
          )}
          {status === 'open' && (
            <Button variant="glass" onClick={closeGame} disabled={busy}>
              Kết thúc sớm
            </Button>
          )}
          {status === 'closed' && <p className="muted">Game đã kết thúc. Tải kết quả ở bảng bên dưới.</p>}
        </div>
        {message && <p className="admin-msg">{message}</p>}
      </section>

      <EntryCard adminKey={adminKey} />

      <section className="card admin-results">
        <div className="admin-results-head">
          <div className="admin-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'top'} onClick={() => setView('top')}>
              Top {TOP_N}
            </button>
            <button type="button" role="tab" aria-selected={view === 'all'} onClick={() => setView('all')}>
              Tất cả ({rows.length})
            </button>
          </div>
          <div className="admin-exports">
            <Button variant="glass" onClick={exportResults} disabled={!rows.length}>
              Tải kết quả (Excel)
            </Button>
            <Button variant="glass" onClick={exportLog} disabled={busy || !rows.length}>
              Tải lịch sử trả lời
            </Button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="results">
            <thead>
              <tr>
                <th>Hạng</th>
                <th>Họ và tên</th>
                <th>SĐT</th>
                <th>Phòng ban</th>
                <th>Đúng</th>
                <th>Thời gian</th>
                <th>Vào lúc</th>
                <th>Nộp lúc</th>
                <th>Mã bài</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10} className="results-empty">
                    {view === 'top' ? 'Chưa có ai đạt từ 80% trở lên.' : 'Chưa có người chơi.'}
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className={r.disqualified ? 'is-out' : r.rank === null ? 'is-below' : r.rank <= 3 ? 'is-podium' : ''}>
                  <td className="results-rank">{r.rank ?? '–'}</td>
                  <td>
                    {r.name}
                    {r.disqualified && <span className="results-reason">Bị loại: {r.disqualifyReason}</span>}
                  </td>
                  <td>{formatPhone(r.phone)}</td>
                  <td>{r.department}</td>
                  <td>
                    {r.correct}/{r.total}
                  </td>
                  <td>{r.durationMs === null ? (r.submittedAt ? '' : 'đang làm') : formatDuration(r.durationMs)}</td>
                  <td>{formatClock(r.enteredAt)}</td>
                  <td>
                    {r.submittedAt ? formatClock(r.submittedAt) : ''}
                    {r.autoSubmitted ? ' (tự động)' : ''}
                  </td>
                  <td className="results-code">{r.code}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => disqualify(r)} disabled={busy}>
                      {r.disqualified ? 'Khôi phục' : 'Loại'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Tools adminKey={adminKey} status={status} busy={busy} run={run} />
    </main>
  )
}

function Tools({
  adminKey,
  status,
  busy,
  run,
}: {
  adminKey: string
  status: string | undefined
  busy: boolean
  run: (action: () => Promise<unknown>, done?: string) => Promise<void>
}) {
  const [departments, setDepartments] = useState('')

  useEffect(() => {
    api.getDepartments().then((list) => setDepartments(list.join('\n'))).catch(() => {})
  }, [])

  const saveDepartments = () => {
    const names = departments.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!names.length) return
    run(async () => setDepartments((await adminApi.setDepartments(adminKey, names)).join('\n')), 'Đã lưu danh sách phòng ban.')
  }
  const resetAll = () => {
    const typed = prompt('Xoá TOÀN BỘ bài thi và đưa game về trạng thái chờ? Gõ XOA để xác nhận.')
    if (typed?.trim().toUpperCase() === 'XOA') run(() => adminApi.reset(adminKey), 'Đã xoá toàn bộ bài thi, game về trạng thái chờ.')
  }

  return (
    <details className="card admin-tools">
      <summary className="eyebrow">Cài đặt & công cụ chạy thử</summary>
      <div className="admin-tools-body">
        <div>
          <p className="admin-tool-title">Danh sách phòng ban (mỗi dòng một phòng)</p>
          <textarea className="field-input admin-textarea" value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder={'IT\nKế toán\nNhân sự'} />
          <Button variant="glass" onClick={saveDepartments} disabled={busy}>
            Lưu phòng ban
          </Button>
        </div>
        <div>
          <p className="admin-tool-title">Chạy thử</p>
          <div className="admin-actions">
            <Button variant="glass" onClick={() => run(() => adminApi.setRemaining(adminKey, 65), 'Đã tua: còn 65 giây.')} disabled={busy || status !== 'open'}>
              Tua: còn 65 giây
            </Button>
            <Button variant="glass" onClick={resetAll} disabled={busy}>
              Xoá hết, về trạng thái chờ
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}

function EntryCard({ adminKey }: { adminKey: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminApi.entryCode(adminKey).then(setCode).catch(() => {})
  }, [adminKey])

  const url = code ? playUrl(code) : ''
  const rotate = async () => {
    if (!confirm('Đổi mã mới? Mọi mã QR đã in hoặc đã chiếu sẽ không dùng được nữa. Người đã vào phòng chờ không bị ảnh hưởng.')) return
    setBusy(true)
    try {
      setCode(await adminApi.rotateEntryCode(adminKey))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card admin-entry">
      {code ? <QrImage value={url} size={168} /> : <div className="qr qr--empty" />}
      <div className="admin-entry-body">
        <p className="eyebrow">Mã QR vào game</p>
        <p className="muted">Người chơi chỉ vào được khi quét mã này. Mở link không có mã sẽ chỉ thấy màn “Quét mã QR để tham gia”.</p>
        <code className="admin-code">{url || '…'}</code>
        <div className="admin-actions">
          <Button onClick={() => window.open('#qr', '_blank')} disabled={!code}>
            Mở màn hình QR (chiếu lên bảng)
          </Button>
          <Button variant="glass" onClick={() => downloadQr(url, 'ma-qr-thu-thach-23-nam.png')} disabled={!code}>
            Tải ảnh QR để in
          </Button>
          <Button variant="glass" onClick={rotate} disabled={busy || !code}>
            Đổi mã mới
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Full-screen board for the event screen: the QR code, live lobby count and the countdown. */
function QrBoard({ adminKey }: { adminKey: string }) {
  const { state, serverNow } = useGame()
  const now = useTicker(serverNow, 500)
  const [code, setCode] = useState<string | null>(null)

  // Re-read the code so a new one picked on the admin page reaches the screen.
  useEffect(() => {
    const load = () => adminApi.entryCode(adminKey).then(setCode).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [adminKey])

  const status = state?.status
  return (
    <main className="board">
      <SparkleField count={30} />
      <section className="board-info">
        <Logo className="board-logo rise" />
        <p className="eyebrow rise">Minigame kỷ niệm 23 năm</p>
        <h1 className="board-title shimmer-text rise">Thử thách 23 năm</h1>
        <DiamondDivider />
        <ol className="board-steps rise">
          <li>Mở camera điện thoại</li>
          <li>Quét mã QR bên cạnh</li>
          <li>Điền họ tên, số điện thoại, phòng ban</li>
        </ol>
        <div className="board-status rise">
          {status === 'open' ? (
            <>
              <span className="board-number">{formatCountdown((state?.endsAt ?? 0) - now)}</span>
              <span>Game đang diễn ra · vào muộn sẽ còn ít thời gian hơn</span>
            </>
          ) : status === 'closed' ? (
            <span className="board-number board-number--small">Game đã kết thúc</span>
          ) : (
            <>
              <span key={state?.lobbyCount} className="board-number count-bump">
                {state?.lobbyCount ?? 0}
              </span>
              <span>người đã vào phòng chờ</span>
            </>
          )}
        </div>
      </section>
      <section className="board-qr rise">
        <div className="board-qr-frame">{code ? <QrImage value={playUrl(code)} size={640} /> : <div className="qr qr--empty" />}</div>
        <p className="eyebrow">Quét để tham gia</p>
      </section>
    </main>
  )
}
