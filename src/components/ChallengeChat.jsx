import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../i18n/useI18n.js'
import { useAppState } from '../state/AppState.jsx'
import { listChallengeMessages, sendChallengeMessage, subscribeChallengeMessages } from '../services/challengeChat.js'
import { formatProfileLabel, getProfilesByIds } from '../services/profiles.js'
import { getErrorMessage } from '../services/supabaseFetch.js'

import { ClayButton, SecondaryButton } from '../design-system/components/Button/Button.jsx'

import './ChallengeChat.css'

export default function ChallengeChat({ challengeId, challengerId, defenderId, onClose }) {
  const { t } = useI18n()
  const { auth } = useAppState()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [profilesById, setProfilesById] = useState(new Map())
  const messagesEndRef = useRef(null)
  const userId = auth?.userId ?? null

  useEffect(() => {
    if (!challengeId || !userId) return
    let sub = null
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [list, ids] = await Promise.all([
          listChallengeMessages(challengeId),
          (async () => {
            const ids = [challengerId, defenderId].filter(Boolean)
            return ids.length ? await getProfilesByIds(ids) : new Map()
          })(),
        ])
        setMessages(list)
        setProfilesById(ids)
      } catch (e) {
        setError(getErrorMessage(e, t('chat.loadError')))
      } finally {
        setLoading(false)
      }
    }
    load()

    sub = subscribeChallengeMessages(challengeId, (newRow) => {
      setMessages((prev) => [...prev, newRow])
    })
    return () => {
      if (sub?.unsubscribe) sub.unsubscribe()
    }
  }, [challengeId, challengerId, defenderId, userId, t])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || !userId || !challengeId) return
    setSending(true)
    setError('')
    try {
      const sent = await sendChallengeMessage(challengeId, text, userId)
      setMessages((prev) => [...prev, sent])
      setInput('')
    } catch (e) {
      setError(getErrorMessage(e, t('chat.sendError')))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="rqChatOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.title')}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="rqChatModal">
        <div className="rqChatHeader">
          <h3 className="rqChatTitle">{t('chat.title')}</h3>
          <button type="button" className="rqChatClose" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </div>
        {error ? <div className="rqChatError">{error}</div> : null}
        <div className="rqChatMessages">
          {loading ? (
            <p className="rqChatEmpty">{t('common.loading')}</p>
          ) : messages.length === 0 ? (
            <p className="rqChatEmpty">{t('chat.noMessages')}</p>
          ) : (
            <>
              {messages.map((m) => {
                const isMe = m.sender_id === userId
                const name = formatProfileLabel(profilesById.get(m.sender_id))
                return (
                  <div key={m.id} className={`rqChatBubble ${isMe ? 'rqChatBubbleMe' : 'rqChatBubbleOther'}`}>
                    <span className="rqChatBubbleSender">{name}</span>
                    <span className="rqChatBubbleText">{m.message}</span>
                    <span className="rqChatBubbleTime">
                      {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
              <div ref={messagesEndRef} aria-hidden="true" />
            </>
          )}
        </div>
        <form onSubmit={handleSend} className="rqChatForm">
          <input
            type="text"
            className="rqChatInput"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            maxLength={2000}
            disabled={sending || loading}
            aria-label={t('chat.placeholder')}
          />
          <ClayButton type="submit" disabled={sending || loading || !input.trim()}>
            {t('chat.send')}
          </ClayButton>
        </form>
      </div>
    </div>
  )
}
