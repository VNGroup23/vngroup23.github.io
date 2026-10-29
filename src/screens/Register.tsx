import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type Attempt, type GameStatus } from '../api'
import { Button, DiamondDivider, Field, SelectField, stagger } from '../components/ui'
import { normalizeName, normalizePhone, validateName, validatePhone } from '../lib/validate'

interface Errors {
  name?: string
  phone?: string
  department?: string
  form?: string
}

const SERVER_ERRORS: Partial<Record<string, Errors>> = {
  PHONE_TAKEN: { phone: 'Số này đã được dùng với tên khác. Nếu là bạn, hãy nhập đúng họ tên đã dùng.' },
  INVALID_NAME: { name: 'Họ tên chỉ gồm chữ cái, ít nhất 2 chữ' },
  INVALID_PHONE: { phone: 'Số điện thoại cần đủ 10 số, bắt đầu bằng 0' },
  INVALID_DEPARTMENT: { department: 'Phòng ban không hợp lệ, bạn chọn lại nhé' },
  GAME_CLOSED: { form: 'Game đã kết thúc, không thể vào thi nữa.' },
  NO_QUESTIONS: { form: 'BTC chưa sẵn sàng, bạn thử lại sau ít phút nhé.' },
}

export function Register({ status, onJoined }: { status: GameStatus; onJoined: (a: Attempt) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [departments, setDepartments] = useState<string[]>([])
  const [department, setDepartment] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    let retry: ReturnType<typeof setTimeout>
    const load = () =>
      api
        .getDepartments()
        .then((list) => {
          if (!alive) return
          setDepartments(list)
          // A single department is preselected; with several, the player must choose.
          if (list.length === 1) setDepartment(list[0])
        })
        .catch(() => {
          if (alive) retry = setTimeout(load, 2000)
        })
    load()
    return () => {
      alive = false
      clearTimeout(retry)
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {
      name: validateName(name) ?? undefined,
      phone: validatePhone(phone) ?? undefined,
      department: department ? undefined : 'Vui lòng chọn phòng ban',
    }
    setErrors(next)
    if (next.name || next.phone || next.department) return
    setBusy(true)
    try {
      onJoined(await api.join({ name: normalizeName(name), phone: normalizePhone(phone), department }))
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'NETWORK'
      setErrors(SERVER_ERRORS[code] ?? { form: 'Không kết nối được. Bạn kiểm tra mạng rồi thử lại nhé.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen screen--register">
      <div className="hero">
        <img src={`${import.meta.env.BASE_URL}img/kv-hero.jpg`} alt="23 năm VNGroup · Dấu ấn khát vọng" />
      </div>
      <form className="register-body" onSubmit={submit} noValidate>
        <header className="heading rise" style={stagger(1)}>
          <p className="eyebrow">Minigame kỷ niệm 23 năm</p>
          <h1 className="display shimmer-text">Thử thách 23 năm</h1>
          <DiamondDivider />
        </header>
        <div className="fields rise" style={stagger(2)}>
          <Field
            label="Họ và tên"
            name="name"
            autoComplete="name"
            placeholder="VD: Nguyễn Văn An"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            helper="Ghi đầy đủ họ tên, có dấu"
          />
          <Field
            label="Số điện thoại"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="VD: 0912 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            helper="Mỗi số chỉ chơi được 1 lần"
          />
          <SelectField
            label="Phòng ban"
            name="department"
            value={department}
            options={departments}
            onChange={setDepartment}
            placeholder={departments.length ? 'Chọn phòng ban' : 'Đang tải…'}
            error={errors.department}
          />
        </div>
        <div className="spacer" />
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" block disabled={busy} className="rise" style={stagger(3)}>
          {busy ? 'Đang vào…' : status === 'open' ? 'Vào thi ngay' : 'Vào phòng chờ'}
        </Button>
      </form>
    </main>
  )
}
