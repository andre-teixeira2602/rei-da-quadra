import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { supabase } from '../supabase/client.js'

import Card from '../design-system/components/Card/Card.jsx'
import Input from '../design-system/components/Input/Input.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './login.css'

export default function SignUp() {
  const { t } = useI18n()
  const { auth } = useAppState()

  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/ranking'
  }, [location.state])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  async function handleSignUp(e) {
    e.preventDefault()
    setToast(null)

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setToast({ kind: 'error', message: t('signup.emailRequired') })
      return
    }
    if (!password.trim()) {
      setToast({ kind: 'error', message: t('signup.passwordRequired') })
      return
    }
    if (password !== confirmPassword) {
      setToast({ kind: 'error', message: t('signup.passwordMismatch') })
      return
    }
    if (password.length < 6) {
      setToast({ kind: 'error', message: t('signup.passwordTooShort') })
      return
    }

    setLoading(true)
    try {
      // Criar usuário no Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password.trim(),
      })

      if (signUpError) {
        setToast({ kind: 'error', message: signUpError.message ?? t('signup.signUpError') })
        setLoading(false)
        return
      }

      // Criar perfil do usuário
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert([
          {
            id: data.user.id,
            email: normalizedEmail,
            display_name: displayName.trim() || normalizedEmail.split('@')[0],
          },
        ])

        if (profileError) {
          setToast({ kind: 'error', message: profileError.message ?? t('signup.profileError') })
          setLoading(false)
          return
        }
      }

      setToast({ kind: 'success', message: t('signup.signUpSuccess') })
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1500)
    } catch (err) {
      setToast({ kind: 'error', message: err.message ?? t('signup.unknownError') })
    } finally {
      setLoading(false)
    }
  }

  if (auth?.isAuthenticated) {
    return (
      <div className="rq-container rqLogin rq-grid-gap">
        <header className="rqLoginHeader">
          <h1 className="rqLoginTitle">{t('signup.title')}</h1>
        </header>
        <div className="rqLoginCardWrap">
          <Card className="rqLoginCard" title={t('signup.alreadySignedIn')} elevated>
            <div className="rq-muted">
              {t('signup.alreadySignedInMessage')}: <strong style={{ color: 'var(--rq-text)' }}>{auth.email ?? ''}</strong>
            </div>
            <div style={{ marginTop: 12 }}>
              <SecondaryButton type="button" onClick={() => navigate('/ranking')}>
                {t('menu.ranking')}
              </SecondaryButton>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="rq-container rqLogin rq-grid-gap">
      <header className="rqLoginHeader">
        <h1 className="rqLoginTitle">{t('signup.title')}</h1>
        <p className="rq-muted" style={{ margin: 0 }}>
          {t('signup.subtitle')}
        </p>
      </header>

      {toast ? (
        <Card
          className="rqToastCard"
          style={{
            borderColor: toast.kind === 'error' ? '#f44336' : '#4caf50',
            color: toast.kind === 'error' ? '#f44336' : '#4caf50',
          }}
        >
          {toast.message}
        </Card>
      ) : null}

      <div className="rqLoginCardWrap">
        <Card className="rqLoginCard" title={t('signup.title')} elevated>
          <form onSubmit={handleSignUp} style={{ display: 'grid', gap: 10 }}>
            <Input
              id="rq-signup-displayname"
              label={t('signup.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              type="text"
              placeholder={t('signup.displayNamePlaceholder')}
              disabled={loading}
            />

            <Input
              id="rq-signup-email"
              label={t('signup.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t('signup.emailPlaceholder')}
              disabled={loading}
            />

            <Input
              id="rq-signup-password"
              label={t('signup.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder={t('signup.passwordPlaceholder')}
              disabled={loading}
            />

            <Input
              id="rq-signup-confirm-password"
              label={t('signup.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              placeholder={t('signup.confirmPasswordPlaceholder')}
              disabled={loading}
            />

            <ClayButton type="submit" disabled={loading}>
              {loading ? t('common.loading') : t('signup.createAccount')}
            </ClayButton>

            <SecondaryButton type="button" onClick={() => navigate('/login')} disabled={loading}>
              {t('signup.backToLogin')}
            </SecondaryButton>
          </form>
        </Card>
      </div>
    </div>
  )
}
