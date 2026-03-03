import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { createCourt } from '../services/courts.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import Card from '../design-system/components/Card/Card.jsx'
import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './quadras.css'

export default function QuadrasNova() {
  const { t } = useI18n()
  const { auth } = useAppState()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    city: '',
    address: '',
    phone: '',
    whatsapp: '',
    hours: '',
    price_info: '',
    is_public: true,
  })

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!auth?.isAuthenticated) {
      setError(t('courts.loginRequired'))
      return
    }
    const name = form.name?.trim()
    if (!name) {
      setError(t('courts.nameRequired'))
      return
    }
    setLoading(true)
    setError('')
    try {
      await createCourt({
        name,
        city: form.city?.trim() || null,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        hours: form.hours?.trim() || null,
        price_info: form.price_info?.trim() || null,
        is_public: form.is_public,
      })
      navigate('/quadras', { replace: true, state: { message: t('courts.created') } })
    } catch (e) {
      setError(getErrorMessage(e, t('courts.createError')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rq-container rqQuadras rq-grid-gap">
      <header className="rqQuadrasHeader">
        <h1 className="rqQuadrasTitle">{t('courts.newTitle')}</h1>
        <p className="rqQuadrasSubtitle rq-muted">{t('courts.newSubtitle')}</p>
      </header>

      {error ? <Card>{error}</Card> : null}

      <Card>
        <form onSubmit={handleSubmit} className="rqCourtForm">
          <div className="rqCourtFormField">
            <label htmlFor="court-name" className="rqCourtFormLabel">
              {t('courts.fieldName')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="court-name"
              type="text"
              className="rqCourtFormInput"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={t('courts.fieldNamePlaceholder')}
              required
              autoComplete="off"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-city" className="rqCourtFormLabel">{t('courts.fieldCity')}</label>
            <input
              id="court-city"
              type="text"
              className="rqCourtFormInput"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder={t('courts.fieldCityPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-address" className="rqCourtFormLabel">{t('courts.fieldAddress')}</label>
            <input
              id="court-address"
              type="text"
              className="rqCourtFormInput"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder={t('courts.fieldAddressPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-phone" className="rqCourtFormLabel">{t('courts.fieldPhone')}</label>
            <input
              id="court-phone"
              type="tel"
              className="rqCourtFormInput"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder={t('courts.fieldPhonePlaceholder')}
              autoComplete="tel"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-whatsapp" className="rqCourtFormLabel">{t('courts.fieldWhatsapp')}</label>
            <input
              id="court-whatsapp"
              type="tel"
              className="rqCourtFormInput"
              value={form.whatsapp}
              onChange={(e) => update('whatsapp', e.target.value)}
              placeholder={t('courts.fieldWhatsappPlaceholder')}
              autoComplete="tel"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-hours" className="rqCourtFormLabel">{t('courts.fieldHours')}</label>
            <input
              id="court-hours"
              type="text"
              className="rqCourtFormInput"
              value={form.hours}
              onChange={(e) => update('hours', e.target.value)}
              placeholder={t('courts.fieldHoursPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="rqCourtFormField">
            <label htmlFor="court-price" className="rqCourtFormLabel">{t('courts.fieldPrice')}</label>
            <input
              id="court-price"
              type="text"
              className="rqCourtFormInput"
              value={form.price_info}
              onChange={(e) => update('price_info', e.target.value)}
              placeholder={t('courts.fieldPricePlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="rqCourtFormField rqCourtFormFieldRow">
            <input
              id="court-public"
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => update('is_public', e.target.checked)}
              className="rqCourtFormCheckbox"
            />
            <label htmlFor="court-public" className="rqCourtFormLabel">{t('courts.fieldPublic')}</label>
          </div>
          <div className="rqCourtFormActions">
            <ClayButton type="submit" disabled={loading}>
              {loading ? t('common.saving') : t('courts.save')}
            </ClayButton>
            <SecondaryButton type="button" onClick={() => navigate('/quadras')} disabled={loading}>
              {t('common.cancel')}
            </SecondaryButton>
          </div>
        </form>
      </Card>
    </div>
  )
}
