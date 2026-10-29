import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** Dark-on-cream QR (high contrast scans reliably even from a distance on an LED wall). */
export function QrImage({ value, size, className }: { value: string; size: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(value, { width: 1024, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2A0833', light: '#FFF8EC' } })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [value])
  return src ? <img className={`qr ${className ?? ''}`} src={src} width={size} height={size} alt="Mã QR vào game" /> : <div className="qr qr--empty" style={{ width: size, height: size }} />
}

export async function downloadQr(value: string, filename: string) {
  const url = await QRCode.toDataURL(value, { width: 2048, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#2A0833', light: '#FFFFFF' } })
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
