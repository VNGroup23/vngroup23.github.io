export function normalizeName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ')
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase('vi') === normalizeName(b).toLocaleLowerCase('vi')
}

export function validateName(raw: string): string | null {
  const name = normalizeName(raw)
  if (!name) return 'Vui lòng nhập họ và tên'
  const words = name.split(' ')
  if (words.length < 2) return 'Vui lòng nhập đầy đủ họ và tên'
  if (!words.every((w) => /^[\p{L}\p{M}]+$/u.test(w))) return 'Họ tên chỉ gồm chữ cái, không có số hay ký tự đặc biệt'
  if (name.length > 50) return 'Họ tên dài quá 50 ký tự'
  return null
}

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[\s.\-()]/g, '')
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
  else if (/^84\d{9}$/.test(digits)) digits = '0' + digits.slice(2)
  return digits
}

export function validatePhone(raw: string): string | null {
  const phone = normalizePhone(raw)
  if (!phone) return 'Vui lòng nhập số điện thoại'
  if (!/^0[35789]\d{8}$/.test(phone)) return 'Số điện thoại cần đủ 10 số, bắt đầu bằng 0'
  return null
}
