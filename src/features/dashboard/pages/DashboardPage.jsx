import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useI18n } from '../../../i18n/useI18n.js'
import { useAppState } from '../../../state/AppState.jsx'
import StickyCTA from '../../../layout/StickyCTA.jsx'
import { useIsMobile } from '../../../layout/useIsMobile.js'
import Card from '../../../design-system/components/Card/Card.jsx'
import { ClayButton, SecondaryButton } from '../../../design-system/components/Button/Button.jsx'
import ProgressBar from '../../../design-system/components/ProgressBar/ProgressBar.jsx'
import Badge from '../../../design-system/components/Badge/Badge.jsx'
import ScoreBox from '../../../design-system/components/ScoreBox/ScoreBox.jsx'
import { getCategoryById } from '../../../services/categories.js'
import { listMyChallenges } from '../../../services/challenges.js'
import { getRanking } from '../../../services/ranking.js'
import { listMatchesByCategory } from '../../../services/matches.js'
import { formatProfileLabel, getProfilesByIds } from '../../../services/profiles.js'
import { getErrorMessage } from '../../../services/supabaseFetch.js'

import '../dashboard.css'

function computeCta({ canChallenge, acceptedChallengeId }) {
  if (acceptedChallengeId)
    return { labelKey: 'dashboard.ctaRecord', to: `/record-match?challenge=${encodeURIComponent(acceptedChallengeId)}` }
  if (canChallenge) return { labelKey: 'dashboard.ctaEnterArena', to: '/ranking' }
  return { label: null, to: null }
}

function parseScoreSets(score) {
  if (typeof score !== 'string' || !score.trim()) return []
  // expected: "6-4 6-3" or "6-4 3-6 10-8"
  return score
    .trim()
    .split(/\s+/)
    .map((part) => {
      const [a, b] = part.split('-')
      const na = Number(a)
      const nb = Number(b)
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return null
      return [na, nb]
    })
    .filter(Boolean)
}

export default function DashboardPage() {
  const { t } = useI18n()
  const { auth, profile, selectedCategoryId } = useAppState()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const categoryId = selectedCategoryId

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState(null)
  const [ranking, setRanking] = useState([])
  const [acceptedChallengeId, setAcceptedChallengeId] = useState(null)
  const [recentMatches, setRecentMatches] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())

  const myRow = useMemo(() => (ranking ?? []).find((r) => r.is_me), [ranking])
  const myPos = useMemo(() => Number(myRow?.rank_position ?? NaN), [myRow])
  const range = category?.challenge_range ?? 3

  const maxPos = useMemo(() => {
    let m = 0
    for (const r of ranking ?? []) {
      if ((r.status ?? 'active') !== 'active') continue
      const p = Number(r.rank_position ?? NaN)
      if (!Number.isFinite(p)) continue
      if (p > m) m = p
    }
    return m
  }, [ranking])

  const canChallenge = useMemo(() => {
    if (!Number.isFinite(myPos)) return false
    return (ranking ?? []).some((r) => {
      if (r.is_me) return false
      if ((r.status ?? 'active') !== 'active') return false
      const p = Number(r.rank_position ?? NaN)
      if (!Number.isFinite(p)) return false
      return p < myPos && p >= myPos - range
    })
  }, [ranking, myPos, range])

  const nextTargetPos = useMemo(() => {
    if (!Number.isFinite(myPos) || myPos <= 1) return null
    return myPos - 1
  }, [myPos])

  const nextTargetRow = useMemo(() => {
    if (!Number.isFinite(nextTargetPos)) return null
    return (ranking ?? []).find((r) => Number(r.rank_position ?? NaN) === nextTargetPos) ?? null
  }, [ranking, nextTargetPos])

  const riskChallengerPos = useMemo(() => {
    if (!Number.isFinite(myPos)) return null
    let closest = null
    for (const r of ranking ?? []) {
      if (r.is_me) continue
      if ((r.status ?? 'active') !== 'active') continue
      const p = Number(r.rank_position ?? NaN)
      if (!Number.isFinite(p)) continue
      if (p > myPos && p <= myPos + range) {
        if (closest === null || p < closest) closest = p
      }
    }
    return closest
  }, [ranking, myPos, range])

  const riskRow = useMemo(() => {
    if (!Number.isFinite(riskChallengerPos)) return null
    return (ranking ?? []).find((r) => Number(r.rank_position ?? NaN) === riskChallengerPos) ?? null
  }, [ranking, riskChallengerPos])

  const progressPct = useMemo(() => {
    if (!Number.isFinite(myPos) || !Number.isFinite(maxPos) || maxPos <= 1) return 0
    const pct = (maxPos - myPos) / (maxPos - 1)
    return Math.max(0, Math.min(1, pct))
  }, [myPos, maxPos])

  const rankBadgeLevel = useMemo(() => {
    if (!Number.isFinite(myPos)) return 'INICIANTE'
    if (myPos === 1) return 'REI'
    return 'COMPETIDOR'
  }, [myPos])

  const displayName = profile?.displayName ?? auth?.email ?? '—'
  const initials = useMemo(() => {
    const src = String(displayName ?? '').trim()
    if (!src) return '—'
    const parts = src.split(/[\s._-]+/).filter(Boolean)
    const a = parts[0]?.[0] ?? src[0]
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
    return `${a}${b}`.toUpperCase()
  }, [displayName])

  const cta = useMemo(() => computeCta({ canChallenge, acceptedChallengeId }), [canChallenge, acceptedChallengeId])

  useEffect(() => {
    let alive = true

    async function load() {
      if (!auth?.isAuthenticated || !categoryId || !auth?.userId) return

      setLoading(true)
      setError('')
      try {
        const [cat, rank, ch, matches] = await Promise.all([
          getCategoryById(categoryId),
          getRanking(categoryId),
          listMyChallenges({ categoryId }),
          listMatchesByCategory({ categoryId, limit: 3 }),
        ])
        if (!alive) return
        setCategory(cat)
        setRanking(rank ?? [])

        const accepted = (ch ?? []).find((c) => c.status === 'accepted')
        setAcceptedChallengeId(accepted?.id ?? null)

        const m = matches ?? []
        setRecentMatches(m)
        const ids = []
        for (const row of m) ids.push(row.winner_id, row.loser_id)
        setProfilesById(await getProfilesByIds(ids))
      } catch (e) {
        if (!alive) return
        const msg = getErrorMessage(e, t('dashboard.loadError'))
        setError(msg.includes('not_authorized') ? t('category.notMember') : msg)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [auth?.isAuthenticated, auth?.userId, categoryId, t])

  const primaryCtaLabel = cta?.labelKey ? t(cta.labelKey) : null
  const progressLabel = useMemo(() => {
    const pct = Math.round(progressPct * 100)
    if (!Number.isFinite(pct)) return ''
    const target = Number.isFinite(nextTargetPos) ? `#${nextTargetPos}` : '#?'
    return `${pct}% ${t('dashboard.to')} ${target}`
  }, [progressPct, nextTargetPos, t])

  const winStreak = useMemo(() => {
    if (!auth?.userId) return 0
    let s = 0
    for (const m of recentMatches ?? []) {
      if (m?.winner_id === auth.userId) s += 1
      else break
    }
    return s
  }, [auth?.userId, recentMatches])

  return (
    <>
      <div className="rq-container rqDashboard">
        {/* TopBar removido aqui para o header “arena” assumir o topo (TopNav já existe globalmente). */}

        <header className="rqArenaHeader">
          <div className="rqLeagueMark" aria-hidden="true">
            <span className="rqLeagueCrown">👑</span>
            <span className="rqLeagueText">{t('dashboard.leagueMark')}</span>
          </div>

          <div className="rqArenaTitle">{t('app.title')}</div>
          <div className="rqArenaSub">
            {category?.name ? (
              <>
                <span className="rqMutedStrong">{category.name}</span>
                <span className="rqDot">•</span>
              </>
            ) : null}
            <span className="rq-muted">{t('dashboard.leagueSubtitle')}</span>
          </div>
        </header>

        <div className="rqPlayerStrip">
          <div className="rqAvatar" aria-hidden="true">
            {initials}
          </div>
          <div className="rqPlayerInfo">
            <div className="rqPlayerName">{displayName}</div>
            <div className="rqPlayerMeta">
              <Badge level={rankBadgeLevel} />
              {Number.isFinite(myPos) ? <span className="rqSeasonPill">{`#${myPos}`}</span> : null}
            </div>
          </div>
        </div>

        {error ? <Card className="rq-grid-gap">{error}</Card> : null}

        <div className="rqDashboardGrid">
          <section className="rq-grid-gap">
            <Card elevated title={t('dashboard.rankingCardTitle')} className="rqRankingCard">
              <div className="rqRankingHero">
                <div className="rqHeroCenter">
                  <div className="rqHeroRank">{Number.isFinite(myPos) ? `#${myPos}` : '—'}</div>
                  <div className="rqHeroLabel">{t('dashboard.positionInLeague')}</div>
                </div>

                <div className="rqHeroLine">
                  {Number.isFinite(nextTargetPos) ? (
                    <div className="rqCallout rqCalloutUp">
                      <span className="rqCalloutIcon" aria-hidden="true">
                        ↑
                      </span>
                      <span>
                        {t('dashboard.canChallenge')} <strong>{`#${nextTargetPos}`}</strong>{' '}
                        {nextTargetRow?.display_name ? <strong>{nextTargetRow.display_name}</strong> : null}
                      </span>
                    </div>
                  ) : (
                    <div className="rqCallout rqCalloutSafe">
                      <span className="rqCalloutIcon" aria-hidden="true">
                        ✓
                      </span>
                      <span>{t('dashboard.noAbove')}</span>
                    </div>
                  )}

                  {riskChallengerPos ? (
                    <div className="rqCallout rqCalloutDown">
                      <span className="rqCalloutIcon" aria-hidden="true">
                        ↓
                      </span>
                      <span>
                        {t('dashboard.riskBy')} <strong>{`#${riskChallengerPos}`}</strong>{' '}
                        {riskRow?.display_name ? <strong>{riskRow.display_name}</strong> : null}
                      </span>
                    </div>
                  ) : (
                    <div className="rqCallout rqCalloutSafe">
                      <span className="rqCalloutIcon" aria-hidden="true">
                        ✓
                      </span>
                      <span>{t('dashboard.safe')}</span>
                    </div>
                  )}

                  <ProgressBar value={progressPct * 100} label={t('dashboard.progressAria')} />
                  {progressLabel ? <div className="rqProgressLabel">{progressLabel}</div> : null}

                  {acceptedChallengeId ? <div className="rqHeroText">{t('dashboard.challengeBannerBody')}</div> : null}

                  {/* CTA: evitar duplicar com StickyCTA no mobile */}
                  {!isMobile && primaryCtaLabel ? (
                    <div className="rqCtaRow">
                      <ClayButton
                        type="button"
                        className="rqCtaButton"
                        disabled={loading || !cta?.to}
                        onClick={() => {
                          if (!cta?.to) return
                          navigate(cta.to)
                        }}
                      >
                        {primaryCtaLabel}
                      </ClayButton>
                    </div>
                  ) : null}

                  {!isMobile ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <SecondaryButton type="button" onClick={() => navigate('/ranking')} disabled={loading}>
                        {t('dashboard.openRanking')}
                      </SecondaryButton>
                      <SecondaryButton type="button" onClick={() => navigate('/challenge')} disabled={loading}>
                        {t('dashboard.goChallenges')}
                      </SecondaryButton>
                      <SecondaryButton type="button" onClick={() => navigate('/history')} disabled={loading}>
                        {t('dashboard.goHistory')}
                      </SecondaryButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card title={t('dashboard.achievements')}>
              <div className="rqAchievementRow">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="rqAchievementIcon" aria-hidden="true">
                    ★
                  </div>
                  <div className="rqAchievementText">
                    <div className="rqAchievementTitle">
                      {winStreak > 0 ? t('dashboard.streakTitle', { n: winStreak }) : t('dashboard.achievementsSoon')}
                    </div>
                    <div className="rqAchievementSub">
                      {winStreak > 0 ? t('dashboard.streakSub') : t('dashboard.achievementsSoonSub')}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <section className="rq-grid-gap">
            <Card title={t('dashboard.lastMatches')}>
              {recentMatches.length === 0 ? (
                <div className="rqEmpty">{t('dashboard.noMatchesYet')}</div>
              ) : (
                <div className="rq-grid-gap">
                  {recentMatches.map((m) => {
                    const isWin = auth?.userId && m.winner_id === auth.userId
                    const opponentId = isWin ? m.loser_id : m.winner_id
                    const opponentLabel = formatProfileLabel(profilesById.get(opponentId))
                    const sets = parseScoreSets(m.score)

                    return (
                      <div key={m.id} className="rqMatchRow rqMatchRow--arena">
                        <div className="rqMatchTop">
                          <div className="rqMatchOpponent">{t('dashboard.vs', { name: opponentLabel })}</div>
                          <span className={`rqResultPill ${isWin ? 'rqResultWin' : 'rqResultLoss'}`}>
                            {isWin ? t('dashboard.win') : t('dashboard.loss')}
                          </span>
                        </div>

                        <div className="rqScoreLine" aria-label={t('dashboard.scoreAria')}>
                          {sets.length === 0 ? (
                            <span className="rq-muted">{m.score || '—'}</span>
                          ) : (
                            sets.map(([a, b], idx) => (
                              <span key={idx} className="rqSetGroup">
                                <ScoreBox value={a} state={isWin ? 'win' : 'neutral'} />
                                <ScoreBox value={b} state={!isWin ? 'loss' : 'neutral'} />
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </section>
        </div>
      </div>

      <StickyCTA
        label={isMobile ? primaryCtaLabel : null}
        disabled={loading || !cta.to}
        onClick={() => {
          if (!cta.to) return
          navigate(cta.to)
        }}
      />
    </>
  )
}

