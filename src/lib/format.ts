export const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${formatClock(ts)}`
}

/** Play time to a tenth of a second, since ties on score are broken by it. */
export function formatDuration(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100))
  return `${Math.floor(tenths / 600)}:${pad2(Math.floor(tenths / 10) % 60)}.${tenths % 10}`
}

export function formatPhone(phone: string): string {
  return phone.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3')
}
