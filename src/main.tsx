import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isMock } from './api'
import { mockDev } from './api/mock'
import './styles.css'

if (isMock) {
  const preview = new URLSearchParams(location.search).get('preview')
  if (preview) mockDev.seedPreview(preview)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
