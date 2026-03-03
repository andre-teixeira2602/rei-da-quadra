import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { listCourts } from '../services/courts.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import Card from '../design-system/components/Card/Card.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './quadras.css'

export default function Quadras() {
  const { t } = useI18n()
  const { auth } = useAppState()
  const location = useLocation()
  const [courts, setCourts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(() => {
    const msg = location.state?.message
    return typeof msg === 'string' && msg.trim() ? { message: msg } : null
  })

  async function load() {
    if (!auth?.isAuthenticated) return
    setLoading(true)
    setError('')
    try {
      const list = await listCourts({ search: search.trim() })
      setCourts(list ?? [])
    } catch (e) {
      setError(getErrorMessage(e, t('courts.loadError')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [auth?.isAuthenticated, search])

  return (
    <div className="rq-container rqQuadras rq-grid-gap">
      <header className="rqQuadrasHeader">
        <h1 className="rqQuadrasTitle">{t('courts.title')}</h1>
        <p className="rqQuadrasSubtitle rq-muted">{t('courts.subtitle')}</p>
      </header>

      {error ? <Card>{error}</Card> : null}
      {toast ? <Card>{toast.message}</Card> : null}

      <div className="rqQuadrasToolbar">
        <input
          type="search"
          className="rqQuadrasSearch"
          placeholder={t('courts.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('courts.searchPlaceholder')}
        />
        <Link to="/quadras/nova">
          <ClayButton type="button">{t('courts.createCourt')}</ClayButton>
        </Link>
      </div>

      <Card title={t('courts.listTitle')}>
        {!auth?.isAuthenticated ? (
          <p className="rqQuadrasEmpty">{t('courts.loginRequired')}</p>
        ) : loading ? (
          <p className="rqQuadrasEmpty">{t('common.loading')}</p>
        ) : courts.length === 0 ? (
          <p className="rqQuadrasEmpty">{t('courts.none')}</p>
        ) : (
          <ul className="rqCourtList" aria-label={t('courts.ariaList')}>
            {courts.map((c) => (
              <li key={c.id} className="rqCourtRow">
                <div className="rqCourtMain">
                  <span className="rqCourtName">{c.name}</span>
                  {c.city ? <span className="rqCourtCity">{c.city}</span> : null}
                  {c.address ? <span className="rqCourtAddress">{c.address}</span> : null}
                  {(c.phone || c.whatsapp) ? (
                    <span className="rqCourtContact">
                      {c.phone || ''} {c.whatsapp ? ` · ${c.whatsapp}` : ''}
                    </span>
                  ) : null}
                </div>
                <div className="rqCourtMeta">
                  {c.is_public ? <span className="rqPill rqPillSuccess">{t('courts.public')}</span> : null}
                  {c.owner_id === auth?.userId ? <span className="rqPill">{t('courts.mine')}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
