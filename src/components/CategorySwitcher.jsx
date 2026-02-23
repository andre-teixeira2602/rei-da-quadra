import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppActions, useAppState } from '../state/AppState.jsx'
import { listCategories } from '../services/categories.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

export default function CategorySwitcher() {
  const { t } = useI18n()
  const { auth, selectedCategoryId } = useAppState()
  const { setSelectedCategory } = useAppActions()

  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const enabled = Boolean(auth?.isAuthenticated)

  useEffect(() => {
    async function load() {
      if (!enabled) {
        setRows([])
        setError('')
        return
      }
      try {
        setError('')
        const cats = await listCategories()
        setRows(cats ?? [])
      } catch (e) {
        setError(getErrorMessage(e, t('category.loadError')))
        setRows([])
      }
    }
    load()
  }, [enabled, t])

  const options = useMemo(() => {
    return (rows ?? []).map((c) => ({
      id: c.id,
      label: c?.name ? `${c.name}` : c.id,
    }))
  }, [rows])

  if (!enabled) return null

  // Mantém UI mínima: se falhar, ainda deixa o usuário navegar; só mostra tooltip.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={error || undefined}>
      <span className="arenaText2" style={{ fontSize: 12 }}>
        {t('category.label')}
      </span>
      <select
        value={selectedCategoryId ?? ''}
        onChange={(e) => setSelectedCategory({ categoryId: e.target.value })}
        className="arenaSelect"
        aria-label={t('category.ariaLabel')}
      >
        {options.length === 0 ? <option value="">{t('common.loading')}</option> : null}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

