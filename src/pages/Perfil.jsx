import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppActions, useAppState } from '../state/AppState.jsx'
import { updateMyDisplayName } from '../services/profiles.js'
import { validateNickname } from '../services/nickname.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import Card from '../design-system/components/Card/Card.jsx'
import Input from '../design-system/components/Input/Input.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './perfil.css'

export default function Perfil() {
  const { t } = useI18n()
  const { auth, profile } = useAppState()
  const actions = useAppActions()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = useMemo(() => {
    const from = location.state?.from
    return typeof from === 'string' && from.startsWith('/') ? from : '/ranking'
  }, [location.state])

  const [nickname, setNickname] = useState(profile?.displayName ?? '')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const validation = useMemo(() => {
    return validateNickname({ nickname, email: auth?.email ?? '' })
  }, [nickname, auth?.email])

  const validationMessage = useMemo(() => {
    if (validation.ok) return ''
    const reason = validation.reason
    if (reason === 'too_short') return t('profile.nicknameTooShort')
    if (reason === 'too_long') return t('profile.nicknameTooLong')
    if (reason === 'invalid_chars') return t('profile.nicknameInvalidChars')
    if (reason === 'email_prefix') return t('profile.nicknameEmailPrefix')
    return t('profile.nicknameInvalid')
  }, [validation, t])

  return (
    <div className="rq-container rqProfile rq-grid-gap">
      <header className="rqProfileHeader">
        <h1 className="rqProfileTitle">{t('profile.title')}</h1>
        <p className="rq-muted" style={{ margin: 0 }}>
          {t('profile.subtitle')}
        </p>
      </header>

      {toast ? <Card>{toast.message}</Card> : null}

      <div className="rqProfileCardWrap">
        <Card title={t('profile.title')} className="rqProfileCard" elevated>
          <div className="rqProfileSignedIn">
            {t('profile.signedInAs')}: <strong style={{ color: 'var(--rq-text)' }}>{auth?.email ?? '—'}</strong>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setToast(null)

              if (!auth?.userId) {
                setToast({ message: t('profile.errorNotAuthenticated') })
                return
              }

              if (!validation.ok) {
                setToast({ message: validationMessage })
                return
              }

              try {
                setLoading(true)
                const updated = await updateMyDisplayName({
                  userId: auth.userId,
                  displayName: validation.value,
                })
                actions.setProfile({ displayName: updated?.display_name ?? validation.value, loaded: true })
                setToast({ message: t('profile.saved') })
                navigate(redirectTo, { replace: true })
              } catch (err) {
                setToast({ message: getErrorMessage(err, t('profile.saveError')) })
              } finally {
                setLoading(false)
              }
            }}
            style={{ display: 'grid', gap: 10, marginTop: 10 }}
          >
            <Input
              id="rq-nickname"
              label={t('profile.nicknameLabel')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              type="text"
              autoComplete="nickname"
              placeholder={t('profile.nicknamePlaceholder')}
              disabled={loading}
              error={!validation.ok ? validationMessage : ''}
            />

            <div className="rqProfileActions">
              <ClayButton type="submit" disabled={loading || !validation.ok}>
                {loading ? t('common.saving') : t('common.save')}
              </ClayButton>
              <SecondaryButton type="button" disabled={loading} onClick={() => navigate(redirectTo)}>
                {t('common.cancel')}
              </SecondaryButton>
            </div>
          </form>
        </Card>
      </div>

      {profile?.loaded && validation.ok ? (
        <div className="rqProfileSignedIn">
          {t('profile.currentNickname')}: <strong style={{ color: 'var(--rq-text)' }}>{profile.displayName}</strong>
        </div>
      ) : null}
    </div>
  )
}

