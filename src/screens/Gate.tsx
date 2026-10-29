import { Icon } from '../components/Icon'
import { Logo, stagger } from '../components/ui'

/** Shown to anyone who opens the game without scanning the QR code on the event screen. */
export function Gate({ expired }: { expired: boolean }) {
  return (
    <main className="screen screen--result screen--gate">
      <Logo className="rise" />
      <div className="spacer" />
      <div className="scan-frame rise" style={stagger(1)} aria-hidden="true">
        <Icon name="scan" size={72} />
        <span className="scan-line" />
      </div>
      <header className="message rise" style={stagger(2)}>
        <p className="eyebrow">Minigame kỷ niệm 23 năm</p>
        <h1 className="title">Quét mã QR để tham gia</h1>
        <p className="body muted">
          {expired
            ? 'Mã QR bạn dùng đã hết hiệu lực. Hãy quét lại mã trên màn hình sự kiện nhé.'
            : 'Mở camera điện thoại và quét mã QR trên màn hình sự kiện để vào thi.'}
        </p>
      </header>
      <div className="spacer" />
    </main>
  )
}
