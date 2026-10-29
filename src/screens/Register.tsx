import { useState, type FormEvent } from 'react'
import { api, ApiError, type Attempt, type GameStatus } from '../api'
import { Button, DiamondDivider, Field, SelectField, stagger } from '../components/ui'
import { DEPARTMENTS } from '../data/departments'
import { normalizeName, normalizePhone, validateName, validatePhone } from '../lib/validate'

interface Errors {
  name?: string
  phone?: string
  form?: string
}

export function Register({ status, onJoined }: { status: GameStatus; onJoined: (a: Attempt) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState(DEPARTMENTS[0])
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = { name: validateName(name) ?? undefined, phone: validatePhone(phone) ?? undefined }
    setErrors(next)
    if (next.name || next.phone) return
    setBusy(true)
    try {
      onJoined(await api.join({ name: normalizeName(name), phone: normalizePhone(phone), department }))
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'NETWORK'
      if (code === 'PHONE_TAKEN') setErrors({ phone: 'Số này đã được dùng với tên khác. Nếu là bạn, hãy nhập đúng họ tên đã dùng.' })
      else if (code === 'GAME_CLOSED') setErrors({ form: 'Game đã kết thúc, không thể vào thi nữa.' })
      else setErrors({ form: 'Không kết nối được. Bạn kiểm tra mạng rồi thử lại nhé.' })
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
          <SelectField label="Phòng ban" name="department" value={department} options={DEPARTMENTS} onChange={setDepartment} />
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
