type Cell = string | number | boolean | null | undefined

const escape = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Keeps leading zeros when the file is opened in Excel. */
export const asText = (s: string) => `="${s}"`

/** Downloads a UTF-8 CSV (with BOM so Excel shows Vietnamese correctly). */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const body = '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
