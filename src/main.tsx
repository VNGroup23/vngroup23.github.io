import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminPage } from './admin/AdminPage'
import App from './App'
import { isMock } from './api'
import { mockDev } from './api/mock'
import './styles.css'

if (isMock) {
  const preview = new URLSearchParams(location.search).get('preview')
  if (preview) mockDev.seedPreview(preview)
}

// #admin opens BTC's page and #qr the event-screen board; switching the hash reloads.
const page = location.hash === '#admin' ? <AdminPage mode="dashboard" /> : location.hash === '#qr' ? <AdminPage mode="qr" /> : <App />
window.addEventListener('hashchange', () => location.reload())

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
