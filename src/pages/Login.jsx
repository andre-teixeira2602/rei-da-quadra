import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { supabase } from '../supabase/client.js'

import Card from '../design-system/components/Card/Card.jsx'
import Input from '../design-system/components/Input/Input.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './login.css'

export default function Login() {
  const { t } = useI18n()
  const { auth } = useAppState()

  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/ranking'
  }, [location.state])

  const incomingMessage = useMemo(() => {
    const msg = location.state?.message
    return typeof msg === 'string' ? msg : ''
  }, [location.state])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(incomingMessage ? { message: incomingMessage } : null)

  return (
    <div className="rq-container rqLogin rq-grid-gap">
      <header className="rqLoginHeader">
        <h1 className="rqLoginTitle">{t('login.title')}</h1>
        <p className="rq-muted" style={{ margin: 0 }}>
          {t('login.subtitle')}
        </p>
      </header>

      {toast ? (
        <Card className="rqToastCard">
          {toast.message}
        </Card>
      ) : null}

      <div className="rqLoginCardWrap">
        {auth?.isAuthenticated ? (
          <Card className="rqLoginCard" title={t('login.title')} elevated>
            <div className="rq-muted">
              {t('login.signedInAs')}: <strong style={{ color: 'var(--rq-text)' }}>{auth.email ?? ''}</strong>
            </div>
            <div style={{ marginTop: 12 }}>
              <SecondaryButton type="button" onClick={() => navigate(redirectTo)}>
                {t('menu.ranking')}
              </SecondaryButton>
            </div>
          </Card>
        ) : (
          <Card className="rqLoginCard" title={t('login.title')} elevated>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setToast(null)

                const normalizedEmail = email.trim()
                if (!normalizedEmail) {
                  setToast({ message: t('login.emailRequired') })
                  return
                }
                if (!password.trim()) {
                  setToast({ message: t('login.passwordRequired') })
                  return
                }

                setLoading(true)
                const { error } = await supabase.auth.signInWithPassword({
                  email: normalizedEmail,
                  password: password.trim(),
                })
                setLoading(false)

                if (error) {
                  setToast({ message: error.message ?? t('login.signInError') })
                  return
                }
                navigate(redirectTo, { replace: true })
              }}
              style={{ display: 'grid', gap: 10 }}
            >
              <Input
                id="rq-login-email"
                label={t('login.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="email@exemplo.com"
                disabled={loading}
              />

              <Input
                id="rq-login-password"
                label={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={loading}
              />

              <div className="rqLoginActions">
                <ClayButton type="submit" disabled={loading}>
                  {loading ? t('common.loading') : t('login.signIn')}
                </ClayButton>

                <div className="rqLoginLinks">
                  <button type="button" className="rqLinkButton" onClick={() => setToast({ message: t('common.soon') })}>
                    {t('login.forgotPassword')}
                  </button>
                  <button type="button" className="rqLinkButton" onClick={() => navigate('/signup')}>
                    {t('login.createAccount')}
                  </button>
                </div>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}

