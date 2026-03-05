import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppActions, useAppState } from '../state/AppState.jsx'
import { listPublicCourts } from '../services/courts.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

/**
 * Componente CourtSwitcher
 * Permite selecionar a quadra ativa (padrão: CategorySwitcher)
 * Exibido no TopNav quando há quadras disponíveis
 */
export default function CourtSwitcher() {
  const { t } = useI18n()
  const { auth, selectedCourtId } = useAppState()
  const { setSelectedCourt, setCourts } = useAppActions()

  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const enabled = Boolean(auth?.isAuthenticated)

  useEffect(() => {
    async function load() {
      if (!enabled) {
        setRows([])
        setCourts({ courts: [] })
        setError('')
        return
      }
      try {
        setError('')
        const courts = await listPublicCourts()
        setRows(courts ?? [])
        setCourts({ courts: courts ?? [] })
      } catch (e) {
        setError(getErrorMessage(e, t('court.loadError')))
        setRows([])
        setCourts({ courts: [] })
      }
    }
    load()
  }, [enabled, t, setCourts])

  const options = useMemo(() => {
    return (rows ?? []).map((c) => ({
      id: c.id,
      label: c?.name ? `${c.name}${c.city ? ` - ${c.city}` : ''}` : c.id,
    }))
  }, [rows])

  if (!enabled || options.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={error || undefined}>
      <span className="arenaText2" style={{ fontSize: 12 }}>
        {t('court.label')}
      </span>
      <select
        value={selectedCourtId ?? ''}
        onChange={(e) => setSelectedCourt({ courtId: e.target.value })}
        className="arenaSelect"
        aria-label={t('court.ariaLabel')}
      >
        <option value="">
          {options.length === 0 ? t('common.loading') : t('court.select')}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
