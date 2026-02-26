import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { formatDate } from '../state/utils.js'
import { listMyChallenges, respondChallenge } from '../services/challenges.js'
import { formatProfileLabel, getProfilesByIds } from '../services/profiles.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import Card from '../design-system/components/Card/Card.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './desafios.css'

function statusLabel(status) {
  return status ?? '—'
}

function isExpiredRow(c) {
  if (!c?.expires_at) return false
  const d = new Date(c.expires_at)
  return Number.isFinite(d.getTime()) && d.getTime() <= Date.now()
}

export default function Desafios() {
  const { t } = useI18n()
  const { auth, selectedCategoryId } = useAppState()
  const location = useLocation()
  const navigate = useNavigate()

  const [toast, setToast] = useState(() => {
    const msg = location.state?.message
    return typeof msg === 'string' && msg.trim() ? { message: msg } : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [challenges, setChallenges] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())

  const userId = auth?.userId ?? null
  const categoryId = selectedCategoryId

  async function refresh() {
    if (!userId) return
    if (!categoryId) return

    setLoading(true)
    setError('')
    try {
      const rows = await listMyChallenges({ categoryId })
      setChallenges(rows)

      const ids = []
      for (const c of rows) {
        ids.push(c.challenger_id, c.defender_id)
      }
      setProfilesById(await getProfilesByIds(ids))
    } catch (e) {
      const msg = getErrorMessage(e, 'Não foi possível carregar os desafios.')
      setError(msg.includes('not_authorized') ? t('category.notMember') : msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, categoryId])

  const againstMe = useMemo(
    () => challenges.filter((c) => c.defender_id === userId),
    [challenges, userId],
  )
  const byMe = useMemo(
    () => challenges.filter((c) => c.challenger_id === userId),
    [challenges, userId],
  )

  const againstMeActive = useMemo(
    () => againstMe.filter((c) => c.status === 'pending' || c.status === 'accepted'),
    [againstMe],
  )
  const byMeActive = useMemo(
    () => byMe.filter((c) => c.status === 'pending' || c.status === 'accepted'),
    [byMe],
  )
  const history = useMemo(
    () => challenges.filter((c) => ['declined', 'expired', 'completed'].includes(c.status)),
    [challenges],
  )

  function pillClass({ status, expired }) {
    if (expired || status === 'expired' || status === 'declined') return 'rqPill rqPillDanger'
    if (status === 'accepted') return 'rqPill rqPillSuccess'
    return 'rqPill'
  }

  function pillLabel({ status, expired }) {
    if (expired) return t('challenges.status.expired')
    return t(`challenges.status.${statusLabel(status)}`)
  }

  return (
    <div className="rq-container rqChallenges rq-grid-gap">
      <header className="rqChallengesHeader">
        <h1 className="rqChallengesTitle">{t('challenges.title')}</h1>
        <p className="rqChallengesSubtitle rq-muted">{t('challenges.subtitleNew')}</p>
        <p className="rqChallengesPrivacyNote rq-muted">{t('challenges.privacyNote')}</p>
      </header>

      {toast ? <Card>{toast.message}</Card> : null}
      {error ? <Card>{error}</Card> : null}

      <div className="rqChallengesToolbar">
        <SecondaryButton type="button" onClick={() => refresh()} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </SecondaryButton>
      </div>

      <Card title={t('challenges.againstMe')}>
        <section aria-label={t('challenges.ariaAgainstMe')}>
          {againstMeActive.length === 0 ? (
            <div className="rqEmpty">{t('challenges.noneAgainstMe')}</div>
          ) : (
            <ul className="rqChallengeList">
              {againstMeActive.map((c) => {
                const challenger = profilesById.get(c.challenger_id)
                const defender = profilesById.get(c.defender_id)
                const expired = isExpiredRow(c)
                const isPending = c.status === 'pending'

                return (
                  <li key={c.id} className="rqChallengeRow">
                    <div className="rqChallengeTop">
                      <div style={{ minWidth: 0 }}>
                        <div className="rqChallengeNames">
                          <span className="rqChallengeName">{formatProfileLabel(challenger)}</span>
                          <span className="rqChallengeVs">{t('common.vs')}</span>
                          <span className="rqChallengeName">{formatProfileLabel(defender)}</span>
                        </div>
                        <div className="rqChallengeMeta">
                          <div>
                            {t('challenges.createdAt', { date: formatDate(c.created_at) })} ·{' '}
                            {t('challenges.expiresAt', { date: formatDate(c.expires_at) })}
                          </div>
                        </div>
                      </div>

                      <span className={pillClass({ status: c.status, expired })}>
                        {pillLabel({ status: c.status, expired })}
                      </span>
                    </div>

                    <div className="rqChallengeActions">
                      {isPending ? (
                        <>
                          <ClayButton
                            type="button"
                            disabled={expired || loading}
                            onClick={async () => {
                              setToast(null)
                              try {
                                await respondChallenge(c.id, 'accept')
                                setToast({ message: t('challenges.toast.accepted') })
                                await refresh()
                              } catch (e) {
                                setToast({ message: getErrorMessage(e, t('challenges.toast.acceptError')) })
                              }
                            }}
                          >
                            {t('challenges.accept')}
                          </ClayButton>
                          <SecondaryButton
                            type="button"
                            disabled={expired || loading}
                            onClick={async () => {
                              setToast(null)
                              try {
                                await respondChallenge(c.id, 'decline')
                                setToast({ message: t('challenges.toast.declined') })
                                await refresh()
                              } catch (e) {
                                setToast({ message: getErrorMessage(e, t('challenges.toast.declineError')) })
                              }
                            }}
                          >
                            {t('challenges.decline')}
                          </SecondaryButton>
                        </>
                      ) : null}

                      {c.status === 'accepted' ? (
                        <ClayButton
                          type="button"
                          onClick={() => navigate(`/partidas?challenge=${encodeURIComponent(c.id)}`)}
                        >
                          {t('challenges.reportMatch')}
                        </ClayButton>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </Card>

      <Card title={t('challenges.byMe')}>
        <section aria-label={t('challenges.ariaByMe')}>
          {byMeActive.length === 0 ? (
            <div className="rqEmpty">{t('challenges.noneByMe')}</div>
          ) : (
            <ul className="rqChallengeList">
              {byMeActive.map((c) => {
                const challenger = profilesById.get(c.challenger_id)
                const defender = profilesById.get(c.defender_id)
                const expired = isExpiredRow(c)

                return (
                  <li key={c.id} className="rqChallengeRow">
                    <div className="rqChallengeTop">
                      <div style={{ minWidth: 0 }}>
                        <div className="rqChallengeNames">
                          <span className="rqChallengeName">{formatProfileLabel(challenger)}</span>
                          <span className="rqChallengeVs">{t('common.vs')}</span>
                          <span className="rqChallengeName">{formatProfileLabel(defender)}</span>
                        </div>
                        <div className="rqChallengeMeta">
                          <div>
                            {t('challenges.createdAt', { date: formatDate(c.created_at) })} ·{' '}
                            {t('challenges.expiresAt', { date: formatDate(c.expires_at) })}
                          </div>
                          {c.status === 'pending' ? <div>{t('challenges.awaitingOpponent')}</div> : null}
                        </div>
                      </div>

                      <span className={pillClass({ status: c.status, expired })}>
                        {pillLabel({ status: c.status, expired })}
                      </span>
                    </div>

                    <div className="rqChallengeActions">
                      {c.status === 'accepted' ? (
                        <ClayButton
                          type="button"
                          onClick={() => navigate(`/partidas?challenge=${encodeURIComponent(c.id)}`)}
                        >
                          {t('challenges.reportMatch')}
                        </ClayButton>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </Card>

      <Card title={t('challenges.history')}>
        <section aria-label={t('challenges.ariaHistory')}>
          {history.length === 0 ? (
            <div className="rqEmpty">{t('challenges.noneHistory')}</div>
          ) : (
            <ul className="rqChallengeList">
              {history.map((c) => {
                const challenger = profilesById.get(c.challenger_id)
                const defender = profilesById.get(c.defender_id)
                const expired = c.status === 'expired' || isExpiredRow(c)

                return (
                  <li key={c.id} className="rqChallengeRow">
                    <div className="rqChallengeTop">
                      <div style={{ minWidth: 0 }}>
                        <div className="rqChallengeNames">
                          <span className="rqChallengeName">{formatProfileLabel(challenger)}</span>
                          <span className="rqChallengeVs">{t('common.vs')}</span>
                          <span className="rqChallengeName">{formatProfileLabel(defender)}</span>
                        </div>
                        <div className="rqChallengeMeta">
                          <div>{t('challenges.createdAt', { date: formatDate(c.created_at) })}</div>
                          {c.responded_at ? <div>{t('challenges.respondedAt', { date: formatDate(c.responded_at) })}</div> : null}
                          {c.completed_at ? <div>{t('challenges.completedAt', { date: formatDate(c.completed_at) })}</div> : null}
                        </div>
                      </div>

                      <span className={pillClass({ status: c.status, expired })}>
                        {pillLabel({ status: c.status, expired })}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </Card>
    </div>
  )
}

