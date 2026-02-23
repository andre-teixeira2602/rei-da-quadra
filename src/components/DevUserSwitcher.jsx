import { useMemo } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppActions, useAppState } from '../state/AppState.jsx'
import { formatPlayerLabel } from '../state/utils.js'

const styles = {
  wrap: {
    marginTop: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    opacity: 0.9,
    flexWrap: 'wrap',
  },
  label: { fontSize: 12, opacity: 0.75 },
  select: {
    padding: '4px 8px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 13,
    background: '#fff',
  },
}

export default function DevUserSwitcher() {
  const { t } = useI18n()
  const { players, currentUserId } = useAppState()
  const { setCurrentUser } = useAppActions()

  const orderedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.position - b.position)
  }, [players])

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>{t('dev.simulateUser')}</span>
      <select
        value={currentUserId}
        onChange={(e) => setCurrentUser({ userId: Number(e.target.value) })}
        style={styles.select}
        aria-label={t('dev.simulateUser')}
      >
        {orderedPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {formatPlayerLabel(p)}
          </option>
        ))}
      </select>
    </div>
  )
}

