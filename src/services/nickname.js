export function getEmailPrefix(email) {
  if (typeof email !== 'string') return ''
  const idx = email.indexOf('@')
  const prefix = idx >= 0 ? email.slice(0, idx) : email
  return prefix.trim()
}

export function isValidNicknameFormat(value) {
  if (typeof value !== 'string') return false
  return /^[A-Za-z0-9_]{3,20}$/.test(value)
}

export function validateNickname({ nickname, email }) {
  const v = (nickname ?? '').trim()
  if (v.length < 3) return { ok: false, reason: 'too_short' }
  if (v.length > 20) return { ok: false, reason: 'too_long' }
  if (!isValidNicknameFormat(v)) return { ok: false, reason: 'invalid_chars' }

  const prefix = getEmailPrefix(email).toLowerCase()
  if (prefix && v.toLowerCase() === prefix) return { ok: false, reason: 'email_prefix' }

  return { ok: true, value: v }
}

