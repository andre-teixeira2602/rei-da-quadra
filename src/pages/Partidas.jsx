import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { formatDate } from '../state/utils.js'
import { getChallengeById } from '../services/challenges.js'
import { confirmMatchResult, disputeMatchResult, listMatchesByCategory, reportMatch, reportMatchAntiFraud } from '../services/matches.js'
import { listActiveCourts } from '../services/courts.js'
import { formatProfileLabel, getProfilesByIds } from '../services/profiles.js'
import { getErrorMessage } from '../services/supabaseFetch.js'
import { ANTI_FRAUD_V1_ENABLED } from '../config/flags.js'

import Card from '../design-system/components/Card/Card.jsx'
import { SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './partidas.css'

const styles = {
  page: { display: 'grid', gap: 12 },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 12,
    background: 'var(--card)',
  },
  list: { paddingLeft: 0, margin: 0, listStyle: 'none', display: 'grid', gap: 8 },
  row: {
    border: '1px solid color-mix(in srgb, var(--border), transparent 22%)',
    borderRadius: 10,
    padding: '10px 12px',
    background: 'color-mix(in srgb, var(--card), transparent 12%)',
    display: 'grid',
    gap: 6,
  },
  meta: { opacity: 0.75, fontSize: 13 },
  badge: {
    border: '1px solid currentColor',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 12,
    opacity: 0.9,
    display: 'inline-block',
  },
  empty: {
    border: '1px dashed color-mix(in srgb, var(--border), transparent 12%)',
    borderRadius: 10,
    padding: 12,
    background: 'color-mix(in srgb, var(--bg-1), transparent 20%)',
    opacity: 0.9,
  },
  toast: {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 10,
    background: 'color-mix(in srgb, var(--bg-1), transparent 22%)',
  },
  field: { display: 'grid', gap: 6 },
  input: { width: '100%', padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(10, 18, 42, 0.65)', color: 'var(--text)' },
  scoreBox: { width: 56, height: 52, padding: 0, borderRadius: 14, border: '1px solid var(--border)', textAlign: 'center', background: 'rgba(10, 18, 42, 0.65)', color: 'var(--text)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  scoreRow: { display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, alignItems: 'center' },
  scoreGrid: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowActions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  button: { padding: '6px 10px' },
}

function toLocalDateTimeInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseLocalDateTimeInput(value) {
  if (typeof value !== 'string' || !value.includes('T')) return null
  const [datePart, timePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map((x) => Number(x))
  const [hh, mm] = timePart.split(':').map((x) => Number(x))
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null
  // Date(year, monthIndex, day, hour, minute) => local time
  const out = new Date(y, m - 1, d, hh, mm, 0, 0)
  if (Number.isNaN(out.getTime())) return null
  return out
}

function asIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function validateTennisSet(a, b, { allowSuperTiebreak } = {}) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, reason: 'incomplete' }
  if (a === b) return { ok: false, reason: 'tied' }
  if (a < 0 || b < 0) return { ok: false, reason: 'range' }
  if (a > 10 || b > 10) return { ok: false, reason: 'range' }

  const winner = a > b ? 'A' : 'B'
  const w = Math.max(a, b)
  const l = Math.min(a, b)

  // Regras práticas (MVP):
  // - Set normal: 6-0..6-4, 7-5, 7-6
  // - 3º set pode ser super tie-break: 10-0..10-8
  const isNormal =
    (w === 6 && l <= 4) ||
    (w === 7 && (l === 5 || l === 6))
  const isSuperTb = allowSuperTiebreak && w === 10 && l <= 8

  if (!isNormal && !isSuperTb) return { ok: false, reason: 'invalid' }
  return { ok: true, winner, w, l }
}

function computeMatchOutcome(sets) {
  // sets: [{a:number|null,b:number|null}, ...] length 3
  const normalized = (sets ?? []).map((s) => ({ a: asIntOrNull(s?.a), b: asIntOrNull(s?.b) }))

  const completed = normalized.filter((s) => s.a !== null || s.b !== null)
  if (completed.length < 2) return { ok: false, reason: 'need_two_sets' }

  let winsA = 0
  let winsB = 0
  const scoreParts = []

  for (let i = 0; i < normalized.length; i += 1) {
    const s = normalized[i]
    const isEmpty = s.a === null && s.b === null
    if (isEmpty) continue

    const v = validateTennisSet(s.a, s.b, { allowSuperTiebreak: i === 2 })
    if (!v.ok) return { ok: false, reason: `set_${i + 1}_${v.reason}` }

    if (v.winner === 'A') winsA += 1
    else winsB += 1

    // Persistência: sempre salvar "winner-loser" em cada set.
    scoreParts.push(`${v.w}-${v.l}`)

    if (winsA === 2 || winsB === 2) {
      // Se já decidiu em 2 sets, não aceitamos sets adicionais preenchidos.
      for (let j = i + 1; j < normalized.length; j += 1) {
        const nxt = normalized[j]
        if (nxt.a !== null || nxt.b !== null) return { ok: false, reason: 'extra_set' }
      }
      break
    }
  }

  if (winsA === winsB) return { ok: false, reason: 'no_winner' }
  const winnerSide = winsA > winsB ? 'A' : 'B'

  // Best-of-3: precisa fechar 2 sets.
  if (Math.max(winsA, winsB) < 2) return { ok: false, reason: 'no_winner' }

  return { ok: true, winnerSide, winsA, winsB, score: scoreParts.join(' ') }
}

export default function Partidas() {
  const { t } = useI18n()
  const { auth, selectedCategoryId } = useAppState()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [challenge, setChallenge] = useState(null)
  const [sets, setSets] = useState([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
  const [playedAtLocal, setPlayedAtLocal] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [courts, setCourts] = useState([])
  const [courtId, setCourtId] = useState('')

  const [matches, setMatches] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())

  const challengeId = searchParams.get('challenge') || ''
  const effectiveCategoryId = challenge?.category_id ?? selectedCategoryId
  const postMatch = location?.state?.postMatch ?? null

  useEffect(() => {
    if (!challengeId) return
    navigate(`/record-match?challenge=${encodeURIComponent(challengeId)}`, { replace: true })
  }, [challengeId, navigate])

  useEffect(() => {
    if (!postMatch) return
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location.pathname, location.search, navigate, postMatch])

  const orderedMatches = useMemo(() => {
    return [...matches].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  }, [matches])

  const pendingForMe = useMemo(() => {
    const userId = auth?.userId
    if (!userId) return []
    return matches.filter((m) => {
      if (!m || m.status !== 'pending_confirm') return false
      const involved = m.winner_id === userId || m.loser_id === userId
      const isReporter = m.reported_by === userId
      return involved && !isReporter
    })
  }, [matches, auth?.userId])

  async function refreshMatches() {
    if (!auth?.isAuthenticated) return
    if (!effectiveCategoryId) return

    setLoading(true)
    setError('')
    try {
      const rows = await listMatchesByCategory({ categoryId: effectiveCategoryId, limit: 50 })
      setMatches(rows)

      const ids = []
      for (const m of rows) ids.push(m.winner_id, m.loser_id)
      if (challenge) ids.push(challenge.challenger_id, challenge.defender_id)
      setProfilesById(await getProfilesByIds(ids))
    } catch (e) {
      const msg = getErrorMessage(e, t('matches.loadError'))
      setError(msg.includes('not_authorized') ? t('category.notMember') : msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isAuthenticated, effectiveCategoryId, t])

  useEffect(() => {
    let alive = true

    async function loadCourts() {
      if (!auth?.isAuthenticated) {
        setCourts([])
        return
      }
      try {
        const rows = await listActiveCourts()
        if (!alive) return
        setCourts(rows ?? [])
      } catch {
        if (!alive) return
        setCourts([])
      }
    }

    loadCourts()
    return () => {
      alive = false
    }
  }, [auth?.isAuthenticated])

  useEffect(() => {
    async function loadChallenge() {
      if (!challengeId) {
        setChallenge(null)
        setSets([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
        return
      }

      setLoading(true)
      setError('')
      try {
        const c = await getChallengeById(challengeId)
        setChallenge(c)
        setSets([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
        setCourtId('')

        const ids = [c.challenger_id, c.defender_id]
        setProfilesById(await getProfilesByIds(ids))
      } catch (e) {
        setChallenge(null)
        setSets([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
        setError(getErrorMessage(e, t('matches.loadChallengeError')))
      } finally {
        setLoading(false)
      }
    }

    loadChallenge()
  }, [challengeId, t])

  const challengerLabel = challenge ? formatProfileLabel(profilesById.get(challenge.challenger_id)) : '—'
  const defenderLabel = challenge ? formatProfileLabel(profilesById.get(challenge.defender_id)) : '—'

  const outcome = useMemo(() => computeMatchOutcome(sets), [sets])
  const canSubmit = Boolean(challenge) && challenge?.status === 'accepted' && outcome.ok

  const scoreRefs = useRef([])
  function setScoreRef(idx, el) {
    scoreRefs.current[idx] = el
  }
  function focusScore(idx) {
    const el = scoreRefs.current[idx]
    if (el && typeof el.focus === 'function') el.focus()
  }

  return (
    <div className="rq-container rqMatches rq-grid-gap">
      <header className="rqMatchesHeader">
        <h1 className="rqMatchesTitle">{t('matches.title')}</h1>
        <p className="rq-muted" style={{ margin: 0 }}>
          {t('matches.subtitle')}
        </p>
      </header>

      {postMatch ? (
        <div className="arenaCard arenaSuccessGlow">
          <div className="arenaSectionKicker">
            {postMatch.kind === 'reported_pending'
              ? t('postMatch.pendingTitle')
              : postMatch.kind === 'reported_and_confirmed'
              ? t('postMatch.confirmedTitle')
              : t('postMatch.title')}
          </div>
          <div style={{ marginTop: 8, fontWeight: 850, letterSpacing: 0.2 }}>
            {postMatch.kind === 'reported_pending'
              ? t('postMatch.pendingBody')
              : postMatch.kind === 'reported_and_confirmed'
              ? t('postMatch.confirmedBody')
              : t('postMatch.body')}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="arenaButton arenaButtonPrimary" onClick={() => navigate('/ranking')}>
              {t('postMatch.ctaRanking')}
            </button>
            <button type="button" className="arenaButton arenaButtonGhost" onClick={() => navigate('/desafios')}>
              {t('postMatch.ctaChallenges')}
            </button>
          </div>
        </div>
      ) : null}

      {pendingForMe.length > 0 ? (
        <Card title={t('matches.pendingTitle')}>
          <p style={{ margin: '0 0 8px', opacity: 0.8 }}>{t('matches.pendingHelp')}</p>
          <ul className="rqMatchesList" aria-label={t('matches.pendingAria')}>
            {pendingForMe.map((m) => {
              const winner = profilesById.get(m.winner_id)
              const loser = profilesById.get(m.loser_id)
              const courtName = m?.court?.name ?? null

              return (
                <li key={m.id} className="rqMatchRowPremium">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{formatProfileLabel(winner)}</strong>
                    <span style={{ opacity: 0.7 }}>{t('matches.verbWon')}</span>
                    <strong>{formatProfileLabel(loser)}</strong>
                  </div>

                  <div style={styles.meta}>
                    {formatDate(m.played_at)}
                    {m.score ? ` · ${t('matches.scoreShort')}: ${m.score}` : ''}
                    {courtName ? ` · ${t('matches.courtShort')}: ${courtName}` : ''}
                  </div>

                  <div style={styles.rowActions}>
                    <button
                      type="button"
                      style={styles.button}
                      disabled={loading}
                      onClick={async () => {
                        setToast(null)
                        try {
                          setLoading(true)
                          await confirmMatchResult({ matchId: m.id })
                          setToast({ message: t('matches.confirmSuccess') })
                          await refreshMatches()
                        } catch (err) {
                          setToast({ message: getErrorMessage(err, t('matches.confirmError')) })
                        } finally {
                          setLoading(false)
                        }
                      }}
                    >
                      {t('matches.confirmResult')}
                    </button>
                    <button
                      type="button"
                      style={styles.button}
                      disabled={loading}
                      onClick={async () => {
                        const reason = window.prompt(t('matches.disputePrompt'))
                        if (reason === null) return
                        setToast(null)
                        try {
                          setLoading(true)
                          await disputeMatchResult({ matchId: m.id, reason })
                          setToast({ message: t('matches.disputeSuccess') })
                          await refreshMatches()
                        } catch (err) {
                          setToast({ message: getErrorMessage(err, t('matches.disputeError')) })
                        } finally {
                          setLoading(false)
                        }
                      }}
                    >
                      {t('matches.disputeResult')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {toast ? <div style={styles.toast}>{toast.message}</div> : null}
      {error ? <div style={styles.toast}>{error}</div> : null}

      {challenge ? (
        <Card title={t('matches.reportTitle')}>
          <p style={{ margin: '8px 0 0', opacity: 0.85 }}>
            {t('matches.challengeLabel')}: <strong>{challengerLabel}</strong> vs <strong>{defenderLabel}</strong>
          </p>
          <p style={{ margin: '8px 0 0', opacity: 0.75 }}>
            {t('matches.challengeStatus')}: <strong>{challenge.status}</strong>
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setToast(null)

              const playedAt = parseLocalDateTimeInput(playedAtLocal)
              if (!playedAt) {
                setToast({ message: t('matches.invalidDateTime') })
                return
              }
              if (!challenge || challenge.status !== 'accepted') {
                setToast({ message: t('matches.challengeNotAccepted') })
                return
              }
              if (!outcome.ok) {
                setToast({ message: t('matches.invalidScore') })
                return
              }

              const winnerId = outcome.winnerSide === 'A' ? challenge.challenger_id : challenge.defender_id

              try {
                setLoading(true)

                if (ANTI_FRAUD_V1_ENABLED) {
                  await reportMatchAntiFraud({
                    challengeId: challenge.id,
                    winnerId,
                    score: outcome.score,
                    playedAt: playedAt.toISOString(),
                    courtId: courtId || null,
                  })
                  setToast({ message: t('postMatch.pendingBody') })
                  setChallenge(null)
                  await refreshMatches()
                  navigate('/partidas', { replace: true, state: { postMatch: { kind: 'reported_pending' } } })
                } else {
                  await reportMatch({
                    challengeId: challenge.id,
                    winnerId,
                    score: outcome.score,
                    playedAt: playedAt.toISOString(),
                    courtId: courtId || null,
                  })
                  setToast({ message: t('matches.reported') })
                  setChallenge(null)
                  await refreshMatches()
                  navigate('/ranking')
                }
              } catch (err) {
                setToast({ message: getErrorMessage(err, t('matches.reportError')) })
              } finally {
                setLoading(false)
              }
            }}
            style={{ display: 'grid', gap: 10, marginTop: 10 }}
          >
            <label style={styles.field}>
              <span style={{ opacity: 0.8, fontSize: 13 }}>{t('matches.courtLabel')}</span>
              <select
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                style={styles.input}
                disabled={loading}
              >
                <option value="">{t('matches.courtNone')}</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.field}>
              <span style={{ opacity: 0.8, fontSize: 13 }}>{t('matches.scoreTitle')}</span>

              {[0, 1, 2].map((setIdx) => {
                const aKey = setIdx * 2
                const bKey = setIdx * 2 + 1

                return (
                  <div key={setIdx} style={styles.scoreRow}>
                    <span style={{ opacity: 0.8, fontSize: 13 }}>{t('matches.setLabel', { n: setIdx + 1 })}</span>
                    <div style={styles.scoreGrid}>
                      <span style={{ fontSize: 13, opacity: 0.8 }}>{challengerLabel}</span>
                      <input
                        ref={(el) => setScoreRef(aKey, el)}
                        type="number"
                        step={1}
                        min={0}
                        max={10}
                        inputMode="numeric"
                        value={sets[setIdx].a}
                        onChange={(e) => {
                          const next = e.target.value
                          setSets((prev) => {
                            const copy = [...prev]
                            copy[setIdx] = { ...copy[setIdx], a: next }
                            return copy
                          })
                          if (next !== '') focusScore(bKey)
                        }}
                        style={styles.scoreBox}
                        disabled={loading}
                      />
                      <span style={{ opacity: 0.7 }}>x</span>
                      <input
                        ref={(el) => setScoreRef(bKey, el)}
                        type="number"
                        step={1}
                        min={0}
                        max={10}
                        inputMode="numeric"
                        value={sets[setIdx].b}
                        onChange={(e) => {
                          const next = e.target.value
                          setSets((prev) => {
                            const copy = [...prev]
                            copy[setIdx] = { ...copy[setIdx], b: next }
                            return copy
                          })
                          if (next !== '' && setIdx < 2) focusScore((setIdx + 1) * 2)
                        }}
                        style={styles.scoreBox}
                        disabled={loading}
                      />
                      <span style={{ fontSize: 13, opacity: 0.8 }}>{defenderLabel}</span>
                    </div>
                  </div>
                )
              })}

              {!outcome.ok ? (
                <div style={{ ...styles.meta }}>
                  {t('matches.scoreHelp')}
                </div>
              ) : (
                <div style={{ ...styles.meta }}>
                  {t('matches.winnerAuto')}:{' '}
                  <strong>{outcome.winnerSide === 'A' ? challengerLabel : defenderLabel}</strong> ·{' '}
                  {t('matches.scoreSavedAs')}: <strong>{outcome.score}</strong>
                </div>
              )}
            </div>

            <label style={styles.field}>
              <span style={{ opacity: 0.8, fontSize: 13 }}>{t('matches.dateTime')}</span>
              <input
                value={playedAtLocal}
                onChange={(e) => setPlayedAtLocal(e.target.value)}
                type="datetime-local"
                style={styles.input}
                disabled={loading}
              />
            </label>

            <div style={styles.rowActions}>
              <button type="submit" style={styles.button} disabled={loading || !canSubmit}>
                {loading ? t('common.saving') : t('common.confirm')}
              </button>
              <button
                type="button"
                style={styles.button}
                disabled={loading}
                onClick={() => navigate('/desafios')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="rqMatchesToolbar">
        <SecondaryButton type="button" onClick={() => refreshMatches()} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </SecondaryButton>
      </div>

      {orderedMatches.length === 0 ? (
        <div className="rqEmpty">{t('matches.none')}</div>
      ) : (
        <ul className="rqMatchesList" aria-label={t('matches.ariaList')}>
          {orderedMatches.map((m) => {
            const winner = profilesById.get(m.winner_id)
            const loser = profilesById.get(m.loser_id)
            const courtName = m?.court?.name ?? null

            return (
              <li key={m.id} className="rqMatchRowPremium">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{formatProfileLabel(winner)}</strong>
                  <span style={{ opacity: 0.7 }}>{t('matches.verbWon')}</span>
                  <strong>{formatProfileLabel(loser)}</strong>
                </div>

                <div style={styles.meta}>
                  {formatDate(m.played_at)}
                  {m.score ? ` · ${t('matches.scoreShort')}: ${m.score}` : ''}
                  {courtName ? ` · ${t('matches.courtShort')}: ${courtName}` : ''}
                </div>

                {m.challenge_id ? (
                  <div>
                    <span style={styles.badge}>{t('matches.linkedToChallenge')}</span>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

