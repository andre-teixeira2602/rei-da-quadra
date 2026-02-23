import { NavLink } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'

function Icon({ name }) {
  const common = {
    className: 'bottomNavIcon',
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  }

  switch (name) {
    case 'home':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'trophy':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M7 4h10v3a5 5 0 0 1-10 0V4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9 20h6M10 16h4M12 12v4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M7 6H5a2 2 0 0 0 2 4M17 6h2a2 2 0 0 1-2 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'swords':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M7 5l5 5M7 10l5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9 7 4.8 2.8a1.2 1.2 0 0 0-1.7 1.7L7.3 8.7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M17 5l-5 5M17 10l-5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M15 7l4.2-4.2a1.2 1.2 0 0 1 1.7 1.7L16.7 8.7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M10 14l-2 2M14 14l2 2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'history':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 12a8.5 8.5 0 1 0 2.1-5.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M3 5v4h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'crown':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M5 9l3 3 4-6 4 6 3-3v10H5V9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M7 19h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common} aria-hidden="true">
          <path
            d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M4.5 20a7.5 7.5 0 0 1 15 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )
  }
}

function Item({ to, label, icon, ariaLabel, showDot }) {
  return (
    <li>
      <NavLink
        to={to}
        aria-label={ariaLabel ?? label}
        className={({ isActive }) => `bottomNavLink ${isActive ? 'bottomNavLinkActive' : ''}`}
      >
        <span className="bottomNavIconWrap" aria-hidden="true">
          <Icon name={icon} />
          {showDot ? <span className="navDot" aria-hidden="true" /> : null}
        </span>
        <span className="bottomNavLabel">{label}</span>
      </NavLink>
    </li>
  )
}

export default function BottomNav({ challengeState }) {
  const { t } = useI18n()
  const showDot = challengeState && challengeState !== 'IDLE'

  return (
    <nav className="bottomNav" aria-label={t('nav.bottom')}>
      <ul className="bottomNavList">
        <Item to="/" icon="home" label={t('menu.home')} />
        <Item to="/ranking" icon="trophy" label={t('menu.ranking')} />
        <Item to="/challenge" icon="swords" label={t('menu.challenges')} showDot={showDot} />
        <Item to="/history" icon="history" label={t('menu.matches')} />
        <Item to="/rei" icon="crown" label={t('menu.king')} />
        <Item to="/profile" icon="user" label={t('menu.profile')} />
      </ul>
    </nav>
  )
}

