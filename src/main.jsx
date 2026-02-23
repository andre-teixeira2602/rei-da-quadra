import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './design-system/tokens/tokens.css'
import './design-system/tokens/global.css'
import './design-system/arena.css'
import './layout/layout.css'
import './layout/bottomNav.css'
import App from './App.jsx'
import { AppStateProvider } from './state/AppState.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppStateProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppStateProvider>
  </StrictMode>,
)
