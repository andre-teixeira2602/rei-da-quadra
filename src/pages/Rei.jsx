import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { getCategoryById } from '../services/categories.js'
import { getRanking } from '../services/ranking.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import Card from '../design-system/components/Card/Card.jsx'
import Badge from '../design-system/components/Badge/Badge.jsx'
import { SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './rei.css'

export default function Rei() {
  const { t } = useI18n()
  const { auth, selectedCategoryId } = useAppState()
  const categoryId = selectedCategoryId

  const [category, setCategory] = useState(null)
  const [kingRow, setKingRow] = useState(null)
  const [top3, setTop3] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    if (!auth?.isAuthenticated) return
    if (!categoryId) return

    setLoading(true)
    setError('')
    try {
      const [cat, ranking] = await Promise.all([
        getCategoryById(categoryId),
        getRanking(categoryId),
      ])

      setCategory(cat)
      const list = ranking ?? []
      const king = list.find((r) => Number(r?.rank_position ?? NaN) === 1) ?? list[0] ?? null
      setKingRow(king)
      setTop3(list.slice(0, 3))
    } catch (e) {
      const msg = getErrorMessage(e, t('king.loadError'))
      setError(msg.includes('not_authorized') ? t('category.notMember') : msg)
      setKingRow(null)
      setTop3([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isAuthenticated, categoryId])

  const kingLabel = useMemo(() => {
    if (!kingRow) return '—'
    return kingRow.display_name ?? '—'
  }, [kingRow])

  return (
    <div className="rq-container rqKing rq-grid-gap">
      <header className="rqKingHeader">
        <h1 className="rqKingTitle">{t('king.title')}</h1>
        <p className="rq-muted" style={{ margin: 0 }}>
          {category?.name ? `${category.name} · ` : ''}
          {t('king.subtitleNew')}
        </p>
      </header>

      {error ? <Card>{error}</Card> : null}

      <Card
        title={t('king.currentNew')}
        rightSlot={<Badge level="REI" />}
        elevated
      >
        <div className="rqKingRow">
          <div style={{ minWidth: 0 }}>
            <div className="rqKingNameLine">
              <strong style={{ fontSize: 18 }}>{kingLabel}</strong>
              <span className="rqKingCrown" aria-label="Rei atual">
                👑
              </span>
            </div>
            <div className="rq-muted" style={{ marginTop: 6 }}>
              {t('king.ruleNew')}
            </div>
          </div>

          <SecondaryButton type="button" onClick={() => refresh()} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh')}
          </SecondaryButton>
        </div>
      </Card>

      <Card title={t('king.top3')} elevated>
        {top3.length === 0 ? (
          <div className="rqEmpty">{t('king.top3Empty')}</div>
        ) : (
          <ul className="rqTop3List">
            {top3.map((r) => {
              const pos = Number(r.rank_position ?? NaN)
              const elite = pos === 1
              return (
                <li key={r.user_id} className={`rqTop3Row ${elite ? 'rqTop3Elite' : ''}`}>
                  <div className="rqTop3Left">
                    <span className="rqTop3Pos">{Number.isFinite(pos) ? `#${pos}` : '#?'}</span>
                    <span className="rqTop3Name">{r.display_name ?? '—'}</span>
                  </div>
                  {elite ? <span className="rqKingCrown">👑</span> : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

