import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { Burst } from './Effects'
import { Icon } from './Icon'

/** Entrance-animation order for elements with the `rise` class. */
export const stagger = (i: number) => ({ '--i': i }) as CSSProperties

export function Button({
  variant = 'gold',
  block,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'glass'; block?: boolean }) {
  return <button className={`btn btn--${variant}${block ? ' btn--block' : ''} ${className}`} {...rest} />
}

export function DiamondDivider({ wide }: { wide?: boolean }) {
  return (
    <div className={`divider${wide ? ' divider--wide' : ''}`} aria-hidden="true">
      <span className="divider-line" />
      <Icon name="diamond" size={12} className="divider-gem" />
      <span className="divider-line" />
    </div>
  )
}

export function Field({
  label,
  error,
  helper,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; helper?: string }) {
  const id = input.id ?? input.name
  return (
    <div className={`field${error ? ' is-error' : ''}`}>
      <label className="eyebrow field-label" htmlFor={id}>
        {label}
      </label>
      <input className="field-input" id={id} aria-invalid={!!error} aria-describedby={`${id}-hint`} {...input} />
      <p className="field-hint" id={`${id}-hint`} role={error ? 'alert' : undefined}>
        {error ?? helper}
      </p>
    </div>
  )
}

export function AnswerOption({
  letter,
  text,
  selected,
  burstKey,
  onSelect,
  disabled,
}: {
  letter: string
  text: string
  selected: boolean
  burstKey: number
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`answer${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      disabled={disabled}
    >
      <span className="answer-badge">
        <Icon name="diamond" size={40} className="answer-gem" />
        <span className="answer-letter">{letter}</span>
        {selected && <Burst key={burstKey} />}
      </span>
      <span className="answer-text">{text}</span>
    </button>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <h2 className="title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return <img className={`logo ${className}`} src={`${import.meta.env.BASE_URL}img/kv-logo.jpg`} alt="23 năm VNGroup · Dấu ấn khát vọng" />
}
