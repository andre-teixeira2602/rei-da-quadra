import { useAppActions } from '../state/AppState.jsx'
import { useI18n } from '../i18n/useI18n.js'

export default function Home() {
  const { t } = useI18n()
  const { resetDemo } = useAppActions()

  return (
    <section>
      <h2>{t('home.title')}</h2>
      <p>{t('home.subtitle')}</p>

      <hr style={{ margin: '16px 0' }} />

      <button
        type="button"
        onClick={() => resetDemo()}
        style={{ padding: '6px 10px', opacity: 0.9 }}
      >
        {t('home.resetDemo')}
      </button>
    </section>
  )
}

