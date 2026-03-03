import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const { t } = useI18n()
  const { auth } = useAppState()

  if (auth?.loading !== false) {
    return <div style={{ padding: 24 }}>Carregando...</div>
  }

  if (auth?.isAuthenticated) return children ?? <Outlet />

  return (
    <Navigate
      to="/login"
      replace
      state={{
        from: location.pathname,
        message: t('auth.required'),
      }}
    />
  )
}

