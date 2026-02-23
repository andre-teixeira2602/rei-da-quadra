import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { getCategoryById } from '../services/categories.js'
import { createChallenge, getRanking } from '../services/ranking.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

function canChallenge({ myPos, targetPos, range }) {
  if (!Number.isFinite(myPos) || !Number.isFinite(targetPos) || !Number.isFinite(range)) return false
  if (targetPos >= myPos) return false // precisa estar acima (posição menor)
  return myPos - targetPos <= range
}

function getRankPosition(row) {
  // Backend esperado: rank_position. Mantém fallback para position (ambiente antigo).
  const raw = row?.rank_position ?? row?.position
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function isActiveMember(row) {
  // Se backend não enviar status, tratamos como active (MVP).
  return (row?.status ?? 'active') === 'active'
}

export default function Ranking() {
  const { t } = useI18n()
  const { auth, selectedCategoryId } = useAppState()
  const navigate = useNavigate()
  const categoryId = selectedCategoryId

  const [category, setCategory] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null) // { message }
  const [error, setError] = useState('')

  const [modalTarget, setModalTarget] = useState(null) // { user_id, display_name, rank_position }

  const myRow = useMemo(() => rows.find((r) => r.is_me), [rows])
  const myPos = useMemo(() => getRankPosition(myRow), [myRow])
  const range = category?.challenge_range ?? 3

  const challengeTargets = useMemo(() => {
    if (!Number.isFinite(myPos)) return []

    return (rows ?? [])
      .filter((r) => !r?.is_me)
      .filter((r) => isActiveMember(r))
      .filter((r) => {
        const targetPos = getRankPosition(r)
        return canChallenge({ myPos, targetPos, range })
      })
      .sort((a, b) => (getRankPosition(a) ?? 0) - (getRankPosition(b) ?? 0))
  }, [rows, myPos, range])

  const targetsLabel = useMemo(() => {
    if (challengeTargets.length === 0) return t('ranking.noneTargets')
    return challengeTargets
      .map((r) => {
        const pos = getRankPosition(r)
        const labelPos = Number.isFinite(pos) ? `${pos}º` : '?º'
        return `${labelPos} (${r.display_name ?? '—'})`
      })
      .join(', ')
  }, [challengeTargets, t])

  async function refresh() {
    if (!auth?.isAuthenticated) return
    if (!categoryId) return

    setLoading(true)
    setError('')
    try {
      const [cat, rank] = await Promise.all([
        getCategoryById(categoryId),
        getRanking(categoryId),
      ])
      setCategory(cat)
      setRows(rank ?? [])
    } catch (e) {
      const msg = getErrorMessage(e, t('ranking.loadError'))
      setError(msg.includes('not_authorized') ? t('category.notMember') : msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isAuthenticated, categoryId])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setModalTarget(null)
    }
    if (!modalTarget) return undefined
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalTarget])

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <h2 className="arenaH1">{t('ranking.title')}</h2>
        <p className="arenaText1" style={{ margin: 0 }}>
          {category?.name
            ? t('ranking.subtitle', { category: category.name, range })
            : t('ranking.subtitleNoCategory', { range })}
        </p>
      </header>

      {toast ? <div className="arenaCard arenaCardFlat">{toast.message}</div> : null}

      {!auth?.isAuthenticated ? (
        <div className="arenaCard">
          <h3 className="arenaTitle">{t('ranking.loginTitle')}</h3>
          <p className="arenaText1" style={{ margin: '8px 0 0' }}>
            {t('ranking.loginText')}
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <NavLink to="/login" style={{ textDecoration: 'underline', opacity: 0.9 }}>
              {t('ranking.goToLogin')}
            </NavLink>
          </div>
        </div>
      ) : (
        <>
          <div className="arenaCard">
            <div className="arenaCardHeader">
              <h3 className="arenaTitle">{t('ranking.statusTitle')}</h3>
              <button type="button" className="arenaButton arenaButtonGhost" onClick={() => refresh()} disabled={loading}>
                {loading ? t('common.loading') : t('ranking.refresh')}
              </button>
            </div>
            <div className="arenaDivider" />
            {myRow ? (
              <p className="arenaText1" style={{ margin: 0 }}>
                {t('ranking.positionLine', {
                  pos: Number.isFinite(myPos) ? `${myPos}º` : '?º',
                  targets: targetsLabel,
                })}
              </p>
            ) : (
              <p className="arenaText1" style={{ margin: 0 }}>
                {t('ranking.notMemberActive')}
              </p>
            )}
          </div>

          {error ? <div className="arenaCard arenaCardFlat">{error}</div> : null}

          <ul className="arenaLadder" aria-label={t('ranking.ariaList')}>
            {rows.map((r) => {
              const isYou = Boolean(r.is_me)
              const pos = getRankPosition(r)
              const isElite = pos === 1
              const isChallengeable =
                Number.isFinite(myPos) &&
                !isYou &&
                isActiveMember(r) &&
                canChallenge({ myPos, targetPos: pos, range })

              return (
                <li key={r.user_id} className={`arenaRow ${isElite ? 'arenaRowElite' : ''} ${isYou ? 'arenaRowYou' : ''}`}>
                  <div className="arenaPos">{Number.isFinite(pos) ? `#${pos}` : '#?'}</div>

                  <div style={{ minWidth: 0 }}>
                    <div className="arenaName">
                      {r.display_name}
                      {isYou ? <span className="arenaTag">({t('ranking.you')})</span> : null}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {isElite ? <span className="arenaPill arenaPillElite">ELITE</span> : null}
                      {isYou ? <span className="arenaPill">{t('ranking.badgeYou')}</span> : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isChallengeable ? (
                      <button
                        type="button"
                        className="arenaButton arenaButtonPrimary"
                        onClick={() => {
                          setToast(null)
                          setModalTarget(r)
                        }}
                      >
                        {t('ranking.challenge')}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {modalTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('ranking.modalLabel')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 11, 24, 0.72)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 50,
            backdropFilter: 'blur(10px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalTarget(null)
          }}
        >
          <div className="arenaCard" style={{ width: 'min(560px, 100%)' }}>
            <h3 className="arenaTitle">{t('ranking.confirmChallenge')}</h3>
            <p className="arenaText1" style={{ margin: '10px 0 0' }}>
              {t('ranking.modalText', {
                name: modalTarget.display_name,
                pos: Number.isFinite(getRankPosition(modalTarget)) ? `${getRankPosition(modalTarget)}º` : '?º',
              })}
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="arenaButton arenaButtonPrimary"
                onClick={async () => {
                  setToast(null)
                  try {
                    await createChallenge(categoryId, modalTarget.user_id)
                    setModalTarget(null)
                    setToast({ message: t('ranking.toast.challengeCreated') })
                    navigate('/desafios', { replace: false, state: { message: t('ranking.toast.challengeCreated') } })
                  } catch (e) {
                    setToast({ message: getErrorMessage(e, t('ranking.toast.challengeCreateError')) })
                    setModalTarget(null)
                  }
                }}
                disabled={loading}
              >
                {t('common.confirm')}
              </button>

              <button type="button" className="arenaButton arenaButtonGhost" onClick={() => setModalTarget(null)} disabled={loading}>
                {t('common.cancel')}
              </button>
            </div>

            <p className="arenaText2" style={{ margin: '12px 0 0', fontSize: 12 }}>
              {t('ranking.hintEsc')}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

