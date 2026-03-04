import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useI18n } from '../../../i18n/useI18n.js'
import { useAppState } from '../../../state/AppState.jsx'
import PageShell from '../../../layout/PageShell.jsx'
import TopBar from '../../../layout/TopBar.jsx'
import StickyCTA from '../../../layout/StickyCTA.jsx'
import { useIsMobile } from '../../../layout/useIsMobile.js'
import { ClayButton } from '../../../design-system/components/Button/Button.jsx'
import { getChallengeById } from '../../../services/challenges.js'
import { listActiveCourts } from '../../../services/courts.js'
import { reportMatchV2 } from '../../../services/matches.js'
import { formatProfileLabel, getProfilesByIds } from '../../../services/profiles.js'
import { getErrorMessage, getRpcErrorKey } from '../../../services/supabaseFetch.js'

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

  const isNormal = (w === 6 && l <= 4) || (w === 7 && (l === 5 || l === 6))
  const isSuperTb = allowSuperTiebreak && w === 10 && l <= 8
  if (!isNormal && !isSuperTb) return { ok: false, reason: 'invalid' }
  return { ok: true, winner, w, l }
}

function computeMatchOutcome(sets) {
  const normalized = (sets ?? []).map((s) => ({ a: asIntOrNull(s?.a), b: asIntOrNull(s?.b) }))
  const completed = normalized.filter((s) => s.a !== null || s.b !== null)
  if (completed.length < 2) return { ok: false, reason: 'need_two_sets' }

  let winsA = 0
  let winsB = 0
  const scoreParts = []

  for (let i = 0; i < normalized.length; i += 1) {
    const s = normalized[i]
    if (s.a === null && s.b === null) continue

    const v = validateTennisSet(s.a, s.b, { allowSuperTiebreak: i === 2 })
    if (!v.ok) return { ok: false, reason: `set_${i + 1}_${v.reason}` }

    if (v.winner === 'A') winsA += 1
    else winsB += 1

    scoreParts.push(`${s.a}-${s.b}`)

    if (winsA === 2 || winsB === 2) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        const nxt = normalized[j]
        if (nxt.a !== null || nxt.b !== null) return { ok: false, reason: 'extra_set' }
      }
      break
    }
  }

  if (winsA === winsB) return { ok: false, reason: 'no_winner' }
  if (Math.max(winsA, winsB) < 2) return { ok: false, reason: 'no_winner' }

  return {
    ok: true,
    winnerSide: winsA > winsB ? 'A' : 'B',
    score: scoreParts.join(' '),
  }
}

export default function RecordMatchPage() {
  const { t } = useI18n()
  const { auth } = useAppState()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isMobile = useIsMobile()

  const challengeId = searchParams.get('challenge') || ''

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')

  const [challenge, setChallenge] = useState(null)
  const [profilesById, setProfilesById] = useState(new Map())
  const [courts, setCourts] = useState([])
  const [courtId, setCourtId] = useState('')
  const [playedAtLocal, setPlayedAtLocal] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [sets, setSets] = useState([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
  const [leftSide, setLeftSide] = useState('challenger') // 'challenger' | 'defender'

  const outcome = useMemo(() => computeMatchOutcome(sets), [sets])

  const challengerLabel = challenge ? formatProfileLabel(profilesById.get(challenge.challenger_id)) : '—'
  const defenderLabel = challenge ? formatProfileLabel(profilesById.get(challenge.defender_id)) : '—'
  const leftLabel = leftSide === 'challenger' ? challengerLabel : defenderLabel
  const rightLabel = leftSide === 'challenger' ? defenderLabel : challengerLabel

  useEffect(() => {
    let alive = true

    async function load() {
      if (!auth?.isAuthenticated) return
      if (!challengeId) {
        setError(t('matches.loadChallengeError'))
        return
      }

      setLoading(true)
      setError('')
      try {
        const [c, courtRows] = await Promise.all([getChallengeById(challengeId), listActiveCourts()])
        if (!alive) return

        setChallenge(c)
        setCourts(courtRows ?? [])
        setCourtId('')
        setSets([{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }])
        setLeftSide('challenger')

        const ids = [c.challenger_id, c.defender_id]
        setProfilesById(await getProfilesByIds(ids))
      } catch (e) {
        if (!alive) return
        setError(getErrorMessage(e, t('matches.loadChallengeError')))
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [auth?.isAuthenticated, challengeId, t])

  const canSubmit =
    Boolean(challenge) &&
    challenge?.status === 'accepted' &&
    outcome.ok &&
    outcome.winnerSide === 'A' &&
    Boolean(parseLocalDateTimeInput(playedAtLocal))

  async function submit() {
    setToast(null)
    setError('')

    if (!challenge) return
    if (challenge.status !== 'accepted') {
      setToast({ message: t('matches.challengeNotAccepted') })
      return
    }

    const playedAt = parseLocalDateTimeInput(playedAtLocal)
    if (!playedAt) {
      setToast({ message: t('matches.invalidDateTime') })
      return
    }

    if (!outcome.ok) {
      setToast({ message: t('matches.invalidScore') })
      return
    }

    if (outcome.winnerSide !== 'A') {
      setToast({ message: t('matches.winnerMustBeLeft') })
      return
    }

    const winnerId = leftSide === 'challenger' ? challenge.challenger_id : challenge.defender_id

    try {
      setLoading(true)
      await reportMatchV2({
        challengeId: challenge.id,
        winnerId,
        score: outcome.score,
        playedAt: playedAt.toISOString(),
        courtId: courtId || null,
      })
      navigate('/partidas', { replace: true, state: { postMatch: { kind: 'pending_confirmation' } } })
    } catch (e) {
      const rpcKey = getRpcErrorKey(e)
      setToast({ message: rpcKey ? t(rpcKey) : getErrorMessage(e, t('matches.reportError')) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageShell>
        <TopBar title={t('matches.reportTitle')} onBack={() => navigate(-1)} />

        {toast ? (
          <div className="arenaCard arenaCardFlat">{toast.message}</div>
        ) : null}
        {error ? (
          <div className="arenaCard arenaCardFlat">{error}</div>
        ) : null}

        <section className="arenaCard" style={{ display: 'grid', gap: 10 }}>
          <div className="arenaSectionKicker">{t('matches.challengeLabel')}</div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div className="leftEmphasis">
              <strong>{leftLabel}</strong> <span className="arenaText2">{t('common.vs')}</span> <strong>{rightLabel}</strong>
            </div>
          </div>

          <button
            type="button"
            className="arenaButton arenaButtonGhost"
            onClick={() => {
              if (loading) return

              setLeftSide((prev) => (prev === 'challenger' ? 'defender' : 'challenger'))

              // inverter placares para manter coerência com “vencedor = esquerda”
              setSets((prev) => prev.map((s) => ({ a: s.b, b: s.a })))
            }}
          >
            {t('matches.swapSides')}
          </button>

          <label className="arenaField">
            <span className="arenaFieldLabel">{t('matches.courtLabel')}</span>
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className="arenaSelect" disabled={loading}>
              <option value="">{t('matches.courtNone')}</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="arenaField">
            <span className="arenaFieldLabel">{t('matches.dateTime')}</span>
            <input
              value={playedAtLocal}
              onChange={(e) => setPlayedAtLocal(e.target.value)}
              type="datetime-local"
              className="arenaInput"
              disabled={loading}
            />
          </label>
        </section>

        <section className="arenaCard" style={{ display: 'grid', gap: 12 }}>
          <div className="arenaSectionKicker">{t('matches.scoreTitle')}</div>

          {[0, 1, 2].map((setIdx) => {
            return (
              <div key={setIdx} className="scoreRow">
                <span className="arenaFieldLabel">{t('matches.setLabel', { n: setIdx + 1 })}</span>
                <div className="scoreBoxes">
                  <input
                    type="number"
                    step={1}
                    min={0}
                    max={10}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sets[setIdx].a}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d]/g, '')
                      setSets((prev) => {
                        const copy = [...prev]
                        copy[setIdx] = { ...copy[setIdx], a: next }
                        return copy
                      })
                    }}
                    className="scoreBoxInput"
                    disabled={loading}
                  />
                  <span className="arenaText2" style={{ fontWeight: 700 }}>
                    ×
                  </span>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    max={10}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sets[setIdx].b}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d]/g, '')
                      setSets((prev) => {
                        const copy = [...prev]
                        copy[setIdx] = { ...copy[setIdx], b: next }
                        return copy
                      })
                    }}
                    className="scoreBoxInput"
                    disabled={loading}
                  />
                </div>
              </div>
            )
          })}

          {outcome.ok ? (
            <div className="arenaText1" style={{ fontSize: 13 }}>
              {outcome.winnerSide === 'A' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    {t('matches.winnerAuto')}: <strong>{leftLabel}</strong>
                  </div>
                  <div>
                    {t('matches.scoreSavedAs')}: <strong>{outcome.score}</strong>
                  </div>
                </div>
              ) : (
                <>{t('matches.winnerMustBeLeft')}</>
              )}
            </div>
          ) : (
            <div className="arenaText1" style={{ fontSize: 13 }}>
              {t('matches.scoreHelp')}
            </div>
          )}
        </section>

        {!isMobile ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ClayButton type="button" disabled={!canSubmit || loading} onClick={submit}>
              {t('matches.ctaConfirm')}
            </ClayButton>
          </div>
        ) : null}
      </PageShell>

      <StickyCTA
        mode="mobile-only"
        label={t('matches.ctaConfirm')}
        disabled={!canSubmit || loading}
        onClick={submit}
      />
    </>
  )
}

