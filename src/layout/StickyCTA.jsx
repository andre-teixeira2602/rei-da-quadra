import { useMemo } from 'react'

import { useIsMobile } from './useIsMobile.js'

export default function StickyCTA({ label, disabled, onClick, variant = 'primary', mode = 'mobile-only' }) {
  const isMobile = useIsMobile()
  const className = useMemo(() => {
    if (variant === 'danger') return 'ctaButton ctaButtonDanger'
    return 'ctaButton ctaButtonPrimary'
  }, [variant])

  if (mode === 'never') return null
  if (!label) return null
  if (mode === 'mobile-only' && !isMobile) return null

  return (
    <div className="stickyCta" role="region" aria-label="Ação primária">
      <div className="stickyCtaInner">
        <button type="button" className={className} disabled={disabled} onClick={onClick}>
          {label}
        </button>
      </div>
    </div>
  )
}

