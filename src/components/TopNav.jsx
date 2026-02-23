import { NavLink } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { supabase } from '../supabase/client.js'
import CategorySwitcher from './CategorySwitcher.jsx'
import DevUserSwitcher from './DevUserSwitcher.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'

export default function TopNav() {
  const { t } = useI18n()
  const { auth, profile } = useAppState()

  return (
    <header className="topNav">
      <div className="topNavInner">
        <div className="topNavBrand">
          <div>
            <h1 className="topNavTitle">{t('app.title')}</h1>
            <p className="topNavTagline">{t('app.tagline')}</p>
          </div>
          <span className="arenaPill arenaPillElite">ARENA</span>
        </div>

        <div className="topNavRow">
          <nav aria-label={t('nav.main')}>
            <ul className="topNavLinks">
              <li>
                <NavLink to="/" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.home')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/ranking" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.ranking')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/desafios" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.challenges')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/partidas" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.matches')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/rei" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.king')}
                </NavLink>
              </li>
            </ul>
          </nav>

          <div className="topNavRight">
            <LanguageSwitcher />

            {auth?.isAuthenticated ? <CategorySwitcher /> : null}

            {import.meta.env.DEV && !auth.isAuthenticated && <DevUserSwitcher />}

            {auth?.isAuthenticated ? (
              <>
                <span className="topNavAuth">
                  {t('login.signedInAs')}: <strong style={{ color: 'var(--text-0)' }}>{profile?.displayName ?? '—'}</strong>
                </span>
                <NavLink to="/perfil" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                  {t('menu.profile')}
                </NavLink>
                <button type="button" className="arenaButton arenaButtonGhost" onClick={() => supabase.auth.signOut()}>
                  {t('menu.logout')}
                </button>
              </>
            ) : (
              <NavLink to="/login" className={({ isActive }) => `topNavLink ${isActive ? 'topNavLinkActive' : ''}`}>
                {t('menu.login')}
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

