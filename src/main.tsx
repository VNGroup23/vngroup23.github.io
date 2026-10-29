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

// #admin opens BTC's page; switching the hash reloads into the other page.
const isAdmin = location.hash === '#admin'
window.addEventListener('hashchange', () => location.reload())

createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin ? <AdminPage /> : <App />}</StrictMode>)
