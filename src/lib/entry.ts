const ENTRY_KEY = 'vng23-entry'

/**
 * The QR code on the event screen links to `?k=<entry code>`. The code is kept so a
 * reload still works, and dropped from the address bar so a shared URL carries no code.
 */
export function readEntryCode(): string | null {
  const url = new URL(location.href)
  const fromQr = url.searchParams.get('k')
  if (fromQr) {
    try {
      localStorage.setItem(ENTRY_KEY, fromQr)
    } catch {
      // storage blocked (private mode): the code still works for this page load
    }
    url.searchParams.delete('k')
    history.replaceState(null, '', url)
    return fromQr
  }
  try {
    return localStorage.getItem(ENTRY_KEY)
  } catch {
    return null
  }
}

export function forgetEntryCode() {
  try {
    localStorage.removeItem(ENTRY_KEY)
  } catch {
    // nothing stored
  }
}

export function playUrl(entryCode: string): string {
  return `${location.origin}${location.pathname}?k=${encodeURIComponent(entryCode)}`
}
