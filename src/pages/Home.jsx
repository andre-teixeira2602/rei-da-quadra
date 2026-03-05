import { useEffect, useState } from 'react'

import { useAppState, useAppActions } from '../state/AppState.jsx'
import { useI18n } from '../i18n/useI18n.js'
import { getCategoryById } from '../services/categories.js'
import { getCourtById } from '../services/courts.js'
import { getKing } from '../services/ranking.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

export default function Home() {
  const { t } = useI18n()
  const { auth, selectedCourtId, selectedCategoryId } = useAppState()
  const { resetDemo } = useAppActions()

  const [court, setCourt] = useState(null)
  const [category, setCategory] = useState(null)
  const [king, setKing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!auth?.isAuthenticated) {
        setCourt(null)
        setCategory(null)
        setKing(null)
        setError('')
        return
      }

      if (!selectedCourtId || !selectedCategoryId) {
        setCourt(null)
        setCategory(null)
        setKing(null)
        setError('')
        return
      }

      setLoading(true)
      setError('')
      try {
        const [c, cat, k] = await Promise.all([
          getCourtById(selectedCourtId),
          getCategoryById(selectedCategoryId),
          getKing(selectedCourtId, selectedCategoryId),
        ])
        setCourt(c)
        setCategory(cat)
        setKing(k)
      } catch (e) {
        setError(getErrorMessage(e, t('home.loadError')))
        setCourt(null)
        setCategory(null)
        setKing(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [auth?.isAuthenticated, selectedCourtId, selectedCategoryId, t])

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header>
        <h2 className="arenaH1">{t('home.title')}</h2>
        <p className="arenaText1">{t('home.subtitle')}</p>
      </header>

      {error && <div className="arenaCard arenaCardFlat" style={{ color: 'var(--error)' }}>{error}</div>}

      {auth?.isAuthenticated && selectedCourtId && selectedCategoryId ? (
        <div className="arenaCard" style={{ display: 'grid', gap: 12 }}>
          {loading ? (
            <p className="arenaText2">{t('common.loading')}</p>
          ) : (
            <>
              {court && (
                <div>
                  <p className="arenaText2" style={{ opacity: 0.7 }}>{t('home.court')}</p>
                  <p className="arenaH2">{court.name}</p>
                  {court.city && <p className="arenaText2">{court.city}</p>}
                  {court.description && <p className="arenaText1" style={{ marginTop: 6 }}>{court.description}</p>}
                </div>
              )}

              {category && (
                <div>
                  <p className="arenaText2" style={{ opacity: 0.7 }}>{t('home.category')}</p>
                  <p className="arenaH2">{category.name}</p>
                </div>
              )}

              {king && (
                <div style={{ padding: 12, background: 'color-mix(in srgb, var(--bg-1), transparent 20%)', borderRadius: 10 }}>
                  <p className="arenaText2" style={{ opacity: 0.7 }}>{t('home.king')}</p>
                  <p className="arenaH2">{king.display_name}</p>
                  <p className="arenaText2" style={{ marginTop: 6 }}>
                    <span className="arenaPill arenaPillElite">ELITE</span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="arenaCard arenaCardFlat">
          <p className="arenaText2">{t('home.selectCourtCategory')}</p>
        </div>
      )}

      <hr style={{ margin: '16px 0' }} />

      <button
        type="button"
        onClick={() => resetDemo()}
        className="arenaButton arenaButtonGhost"
        style={{ padding: '6px 10px', opacity: 0.9 }}
      >
        {t('home.resetDemo')}
      </button>
    </section>
  )
}
