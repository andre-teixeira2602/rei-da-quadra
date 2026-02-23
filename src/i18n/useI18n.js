import { useCallback, useMemo } from 'react'

import { useAppActions, useAppState } from '../state/AppState.jsx'
import { SUPPORTED_LANGS, translations } from './translations.js'

function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(lang)
}

function interpolate(template, vars) {
  if (!vars) return template
  return template.replaceAll(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

export function useI18n() {
  const { lang } = useAppState()
  const { setLang } = useAppActions()

  const effectiveLang = isSupportedLang(lang) ? lang : 'pt-BR'

  const dict = useMemo(() => {
    return translations[effectiveLang] ?? translations['pt-BR']
  }, [effectiveLang])

  const t = useCallback(
    (key, vars) => {
      const raw = dict[key] ?? translations['pt-BR'][key] ?? key
      return interpolate(raw, vars)
    },
    [dict],
  )

  const setLanguage = useCallback(
    (nextLang) => {
      if (!isSupportedLang(nextLang)) return
      setLang({ lang: nextLang })
    },
    [setLang],
  )

  return { lang: effectiveLang, setLang: setLanguage, t }
}

