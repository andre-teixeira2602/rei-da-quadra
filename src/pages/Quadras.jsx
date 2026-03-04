import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { listAllCourts, createCourt, updateCourt, deactivateCourt } from '../services/courts.js'
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

const EMPTY_FORM = { name: '', city: '', address: '', surface: '' }

export default function Quadras() {
  const { t } = useI18n()
  const { auth } = useAppState()

  const [courts, setCourts] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingCourt, setEditingCourt] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [confirmDeactivate, setConfirmDeactivate] = useState(null)

  async function loadCourts() {
    setLoading(true)
    setToast(null)
    try {
      const rows = await listAllCourts()
      setCourts(rows)
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.loadError')) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCourts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      await loadCourts()
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
      await loadCourts()
    } catch (e) {
      setToast({ kind: 'error', message: getErrorMessage(e, t('courts.deactivateError')) })
    } finally {
      setSaving(false)
    }
  }

  const activeCourts = courts.filter((c) => c.is_active)
  const inactiveCourts = courts.filter((c) => !c.is_active)

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

      {/* Toolbar */}
      <div style={styles.toolbar}>
        {auth?.isAuthenticated && !showForm && (
          <button type="button" className="arenaButton arenaButtonPrimary" onClick={openNewForm}>
            + {t('courts.addCourt')}
          </button>
        )}
        <SecondaryButton type="button" onClick={loadCourts} disabled={loading}>
          {loading ? t('common.loading') : t('common.refresh')}
        </SecondaryButton>
      </div>

      {/* Formulário de cadastro / edição */}
      {showForm && (
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

      {/* Lista de quadras ativas */}
      {!loading && activeCourts.length === 0 && !showForm ? (
        <div style={styles.emptyState}>
          <p>{t('courts.noCourts')}</p>
          {auth?.isAuthenticated && (
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

                    {court.surface && (
                      <p style={styles.courtMeta}>
                        {t('courts.surfaceLabel')}: <strong>{surfaceLabel(court.surface)}</strong>
                      </p>
                    )}

                    {auth?.isAuthenticated && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        <button
                          type="button"
                          className="arenaButton arenaButtonGhost"
                          style={{ fontSize: 12, padding: '4px 12px' }}
                          onClick={() => openEditForm(court)}
                        >
                          {t('common.edit')}
                        </button>
                        {confirmDeactivate === court.id ? (
                          <>
                            <button
                              type="button"
                              className="arenaButton arenaButtonPrimary"
                              style={{ fontSize: 12, padding: '4px 12px', background: '#f44336', borderColor: '#f44336' }}
                              disabled={saving}
                              onClick={() => handleDeactivate(court)}
                            >
                              {t('courts.confirmDeactivate')}
                            </button>
                            <button
                              type="button"
                              className="arenaButton arenaButtonGhost"
                              style={{ fontSize: 12, padding: '4px 12px' }}
                              onClick={() => setConfirmDeactivate(null)}
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="arenaButton arenaButtonGhost"
                            style={{ fontSize: 12, padding: '4px 12px', color: '#f44336', borderColor: '#f44336' }}
                            onClick={() => setConfirmDeactivate(court.id)}
                          >
                            {t('courts.deactivate')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quadras inativas (colapsadas) */}
          {inactiveCourts.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, opacity: 0.4, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '8px 0 10px' }}>
                {t('courts.inactiveCourts')} ({inactiveCourts.length})
              </h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {inactiveCourts.map((court) => (
                  <div key={court.id} style={{ ...styles.courtCard, opacity: 0.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ ...styles.courtName, textDecoration: 'line-through' }}>{court.name}</p>
                      <span style={{ ...styles.badge, color: '#888', borderColor: '#888' }}>
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
    </div>
  )
}
