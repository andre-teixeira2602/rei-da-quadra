import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { supabase } from './supabase/client'
import TopNav from './components/TopNav'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './layout/BottomNav'

import DashboardPage from './features/dashboard/pages/DashboardPage'
import Ranking from './pages/Ranking'
import Desafios from './pages/Desafios'
import Rei from './pages/Rei'
import Partidas from './pages/Partidas'
import Login from './pages/Login'
import Perfil from './pages/Perfil'
import RecordMatchPage from './features/matches/pages/RecordMatchPage'

import { useAppActions, useAppState } from './state/AppState'
import { getMyProfile } from './services/profiles'
import { validateNickname } from './services/nickname'

export default function App() {
  const actions = useAppActions()
  const { auth, profile } = useAppState()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      const user = data?.session?.user
      actions.setSession({
        isAuthenticated: !!user,
        userId: user?.id ?? null,
        email: user?.email ?? null,
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      const user = session?.user
      actions.setSession({
        isAuthenticated: !!user,
        userId: user?.id ?? null,
        email: user?.email ?? null,
      })
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [actions])

  useEffect(() => {
    let alive = true

    async function loadProfile() {
      if (!auth?.isAuthenticated || !auth?.userId) {
        actions.setProfile({ displayName: null, loaded: false })
        return
      }

      actions.setProfile({ displayName: null, loaded: false })
      try {
        const p = await getMyProfile(auth.userId)
        if (!alive) return
        actions.setProfile({ displayName: p?.display_name ?? '', loaded: true })
      } catch {
        if (!alive) return
        actions.setProfile({ displayName: '', loaded: true })
      }
    }

    loadProfile()
    return () => {
      alive = false
    }
  }, [auth?.isAuthenticated, auth?.userId, actions])

  useEffect(() => {
    if (!auth?.isAuthenticated) return
    if (!profile?.loaded) return

    const nickname = profile.displayName ?? ''
    const email = auth.email ?? ''
    const valid = validateNickname({ nickname, email })

    if (valid.ok) return
    if (location.pathname === '/perfil') return

    navigate('/perfil', { replace: true, state: { from: location.pathname } })
  }, [auth?.isAuthenticated, auth?.email, profile?.displayName, profile?.loaded, location.pathname, navigate])

  return (
    <div className="appRoot">
      <main className="appMain">
        <TopNav />

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/rei" element={<Rei />} />
          <Route path="/login" element={<Login />} />

          <Route path="/challenge" element={<Navigate to="/desafios" replace />} />
          <Route path="/history" element={<Navigate to="/partidas" replace />} />
          <Route path="/profile" element={<Navigate to="/perfil" replace />} />
          <Route
            path="/record-match"
            element={
              <ProtectedRoute>
                <RecordMatchPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Perfil />
              </ProtectedRoute>
            }
          />

          <Route
            path="/desafios"
            element={
              <ProtectedRoute>
                <Desafios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/partidas"
            element={
              <ProtectedRoute>
                <Partidas />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <BottomNav challengeState={null} />
    </div>
  )
}

