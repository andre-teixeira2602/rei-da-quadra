import { useMemo } from 'react'

import { useI18n } from '../i18n/useI18n.js'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()

  const options = useMemo(
    () => [
      { id: 'pt-BR', label: 'Português (BR)' },
      { id: 'en', label: 'English' },
      { id: 'es', label: 'Español' },
      { id: 'fr', label: 'Français' },
    ],
    [],
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="arenaText2" style={{ fontSize: 12 }}>
        {t('i18n.language')}
      </span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="arenaSelect"
        aria-label={t('i18n.language')}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

