import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n.js'
import { useAppState, useAppActions } from '../state/AppState.jsx'
import { listPublicCourts, listAllCourts, createCourt, updateCourt, deactivateCourt } from '../services/courts.js'
import { getErrorMessage } from '../services/supabaseFetch.js'
import Card from '../design-system/components/Card/Card.jsx'
import { SecondaryButton } from '../design-system/components/Button/Button.jsx'

const SURFACES = ['hard', 'clay', 'grass', 'carpet', 'synthetic']

const styles = {
  page: { display: 'grid', gap: 16 },
  header: { display: 'grid', gap: 4 },
  title: { margin: 0, fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 900, letterSpacing: 0.5 },
  subtitle: { margin: 0, opacity: 0.65, fontSize: 14 },
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  form: { display: 'grid', gap: 12 },
  field: { display: 'grid', gap: 4, fontSize: 14 },
  input: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    color: 'inherit',
    fontSize: 14,
    padding: '9px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    color: 'inherit',
    fontSize: 14,
    padding: '9px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  rowActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  courtCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'grid',
    gap: 6,
  },
  courtName: { fontWeight: 800, fontSize: 15, margin: 0 },
  courtMeta: { fontSize: 12, opacity: 0.65, margin: 0 },
  badge: {
    display: 'inline-block',
    border: '1px solid',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  toast: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    opacity: 0.5,
    fontSize: 14,
  },
}

const EMPTY_FORM = { name: '', city: '', address: '', surface: '', description: '' }

export default function Quadras() {
  const { t } = useI18n()
  const { auth } = useAppState()
  const { setSelectedCourt, setCourts } = useAppActions()

  // Modo: 'public' (diretório público) ou 'admin' (gerenciamento)
  const [mode, setMode] = useState('public')

  const [publicCourts, setPublicCourts] = useState([])
  const [allCourts, setAllCourts] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingCourt, setEditingCourt] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [confirmDeactivate, setConfirmDeactivate] = useState(null)

  async function loadPublicCourts() {
    setLoading(true)
    setToast(null)
    try {
      const rows = await listPublicCourts()
      setPublicCourts(rows)
      setCourts({ courts: rows })
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.loadError')) })
    } finally {
      setLoading(false)
    }
  }

  async function loadAllCourts() {
    setLoading(true)
    setToast(null)
    try {
      const rows = await listAllCourts()
      setAllCourts(rows)
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.loadError')) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPublicCourts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mode === 'admin' && auth?.isAuthenticated) {
      loadAllCourts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, auth?.isAuthenticated])

  function openNewForm() {
    setEditingCourt(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setToast(null)
  }

  function openEditForm(court) {
    setEditingCourt(court)
    setForm({
      name: court.name || '',
      city: court.city || '',
      address: court.address || '',
      surface: court.surface || '',
      description: court.description || '',
    })
    setShowForm(true)
    setToast(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingCourt(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setToast({ kind: 'error', message: t('courts.nameRequired') })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      if (editingCourt) {
        await updateCourt({ id: editingCourt.id, ...form, is_active: editingCourt.is_active })
        setToast({ kind: 'success', message: t('courts.updateSuccess') })
      } else {
        await createCourt(form)
        setToast({ kind: 'success', message: t('courts.createSuccess') })
      }
      cancelForm()
      await loadAllCourts()
      await loadPublicCourts()
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.saveError')) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(court) {
    setSaving(true)
    setToast(null)
    try {
      await deactivateCourt({ id: court.id })
      setToast({ kind: 'success', message: t('courts.deactivateSuccess') })
      setConfirmDeactivate(null)
      await loadAllCourts()
      await loadPublicCourts()
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.deactivateError')) })
    } finally {
      setSaving(false)
    }
  }

  function handleSelectCourt(courtId) {
    setSelectedCourt({ courtId })
  }

  const displayCourts = mode === 'public' ? publicCourts : allCourts
  const activeCourts = displayCourts.filter((c) => c.is_active)
  const inactiveCourts = displayCourts.filter((c) => !c.is_active)

  function surfaceLabel(s) {
    if (!s) return null
    const map = {
      hard: t('courts.surfaceHard'),
      clay: t('courts.surfaceClay'),
      grass: t('courts.surfaceGrass'),
      carpet: t('courts.surfaceCarpet'),
      synthetic: t('courts.surfaceSynthetic'),
    }
    return map[s] || s
  }

  return (
    <div className="rq-container rq-grid-gap" style={styles.page}>
      {/* Cabeçalho */}
      <header style={styles.header}>
        <h1 style={styles.title}>{t('courts.title')}</h1>
        <p className="rq-muted" style={styles.subtitle}>
          {t('courts.subtitle')}
        </p>
      </header>

      {/* Toast */}
      {toast && (
        <div
          style={{
            ...styles.toast,
            borderColor: toast.kind === 'error' ? '#f44336' : '#4caf50',
            color: toast.kind === 'error' ? '#f44336' : '#4caf50',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Abas: Público / Admin */}
      {auth?.isAuthenticated && (
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
          <button
            type="button"
            onClick={() => setMode('public')}
            style={{
              padding: '8px 12px',
              background: mode === 'public' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: mode === 'public' ? 700 : 400,
            }}
          >
            {t('courts.publicDirectory')}
          </button>
          <button
            type="button"
            onClick={() => setMode('admin')}
            style={{
              padding: '8px 12px',
              background: mode === 'admin' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: mode === 'admin' ? 700 : 400,
            }}
          >
            {t('courts.adminPanel')}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={styles.toolbar}>
        {mode === 'admin' && auth?.isAuthenticated && !showForm && (
          <button type="button" className="arenaButton arenaButtonPrimary" onClick={openNewForm}>
            + {t('courts.addCourt')}
          </button>
        )}
        <SecondaryButton type="button" onClick={() => (mode === 'public' ? loadPublicCourts() : loadAllCourts())} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </SecondaryButton>
      </div>

      {/* Formulário de cadastro / edição (apenas admin) */}
      {mode === 'admin' && showForm && (
        <Card title={editingCourt ? t('courts.editTitle') : t('courts.newTitle')}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.field}>
              <span>{t('courts.nameLabel')} *</span>
              <input
                type="text"
                style={styles.input}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('courts.namePlaceholder')}
                disabled={saving}
                required
              />
            </label>

            <label style={styles.field}>
              <span>{t('courts.cityLabel')}</span>
              <input
                type="text"
                style={styles.input}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder={t('courts.cityPlaceholder')}
                disabled={saving}
              />
            </label>

            <label style={styles.field}>
              <span>{t('courts.addressLabel')}</span>
              <input
                type="text"
                style={styles.input}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder={t('courts.addressPlaceholder')}
                disabled={saving}
              />
            </label>

            <label style={styles.field}>
              <span>{t('courts.descriptionLabel')}</span>
              <textarea
                style={{ ...styles.input, minHeight: 80 }}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('courts.descriptionPlaceholder')}
                disabled={saving}
              />
            </label>

            <label style={styles.field}>
              <span>{t('courts.surfaceLabel')}</span>
              <select
                style={styles.select}
                value={form.surface}
                onChange={(e) => setForm((f) => ({ ...f, surface: e.target.value }))}
                disabled={saving}
              >
                <option value="">{t('courts.surfaceNone')}</option>
                {SURFACES.map((s) => (
                  <option key={s} value={s}>
                    {surfaceLabel(s)}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.rowActions}>
              <button type="submit" className="arenaButton arenaButtonPrimary" disabled={saving}>
                {saving ? t('common.saving') : editingCourt ? t('common.save') : t('courts.createButton')}
              </button>
              <button type="button" className="arenaButton arenaButtonGhost" onClick={cancelForm} disabled={saving}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Lista de quadras */}
      {!loading && activeCourts.length === 0 && !showForm ? (
        <div style={styles.emptyState}>
          <p>{t('courts.noCourts')}</p>
          {mode === 'admin' && auth?.isAuthenticated && (
            <button type="button" className="arenaButton arenaButtonPrimary" onClick={openNewForm} style={{ marginTop: 12 }}>
              + {t('courts.addCourt')}
            </button>
          )}
        </div>
      ) : (
        <>
          {activeCourts.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, opacity: 0.55, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>
                {t('courts.activeCourts')} ({activeCourts.length})
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {activeCourts.map((court) => (
                  <div key={court.id} style={styles.courtCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <p style={styles.courtName}>{court.name}</p>
                      <span style={{ ...styles.badge, color: '#4caf50', borderColor: '#4caf50' }}>
                        {t('courts.active')}
                      </span>
                    </div>

                    {(court.city || court.address) && (
                      <p style={styles.courtMeta}>
                        {[court.city, court.address].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {court.description && <p style={styles.courtMeta}>{court.description}</p>}

                    {court.surface && <p style={styles.courtMeta}>{surfaceLabel(court.surface)}</p>}

                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        className="arenaButton arenaButtonPrimary"
                        onClick={() => handleSelectCourt(court.id)}
                        style={{ fontSize: 12 }}
                      >
                        {t('courts.selectCourt')}
                      </button>

                      {mode === 'admin' && (
                        <>
                          <button
                            type="button"
                            className="arenaButton arenaButtonGhost"
                            onClick={() => openEditForm(court)}
                            style={{ fontSize: 12 }}
                            disabled={saving}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="arenaButton arenaButtonGhost"
                            onClick={() => setConfirmDeactivate(court)}
                            style={{ fontSize: 12, color: '#f44336' }}
                            disabled={saving}
                          >
                            {t('common.deactivate')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {mode === 'admin' && inactiveCourts.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, opacity: 0.55, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>
                {t('courts.inactiveCourts')} ({inactiveCourts.length})
              </h2>
              <div style={{ display: 'grid', gap: 10, opacity: 0.6 }}>
                {inactiveCourts.map((court) => (
                  <div key={court.id} style={styles.courtCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <p style={styles.courtName}>{court.name}</p>
                      <span style={{ ...styles.badge, color: '#999', borderColor: '#999' }}>
                        {t('courts.inactive')}
                      </span>
                    </div>
                    {(court.city || court.address) && (
                      <p style={styles.courtMeta}>
                        {[court.city, court.address].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Modal de confirmação de desativação */}
      {confirmDeactivate && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 11, 24, 0.72)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 50,
            backdropFilter: 'blur(10px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeactivate(null)
          }}
        >
          <div className="arenaCard" style={{ width: 'min(400px, 100%)' }}>
            <h3 className="arenaTitle">{t('courts.confirmDeactivate')}</h3>
            <p className="arenaText1" style={{ margin: '10px 0 0' }}>
              {confirmDeactivate.name}
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="arenaButton arenaButtonPrimary"
                onClick={() => handleDeactivate(confirmDeactivate)}
                disabled={saving}
              >
                {t('common.confirm')}
              </button>

              <button
                type="button"
                className="arenaButton arenaButtonGhost"
                onClick={() => setConfirmDeactivate(null)}
                disabled={saving}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
