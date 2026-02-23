import { useEffect, useState } from 'react'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(max-width: 1023px)')?.matches ?? false
  })

  useEffect(() => {
    const mql = window.matchMedia?.('(max-width: 1023px)')
    if (!mql) return undefined

    const onChange = (e) => setIsMobile(Boolean(e.matches))
    mql.addEventListener?.('change', onChange)
    // Safari fallback
    mql.addListener?.(onChange)

    return () => {
      mql.removeEventListener?.('change', onChange)
      mql.removeListener?.(onChange)
    }
  }, [])

  return isMobile
}

