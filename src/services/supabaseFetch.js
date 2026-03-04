import { supabase } from '../supabase/client.js'

export function isSupabaseError(err) {
  return Boolean(err && typeof err === 'object' && 'message' in err)
}

// Códigos de erro lançados pelas RPCs do Supabase que possuem tradução amigável
const RPC_ERROR_CODES = new Set([
  'match_already_reported',
  'challenge_not_found',
  'not_authorized',
  'challenge_expired',
  'invalid_status',
  'invalid_winner',
  'played_at_in_future',
  'played_at_too_old',
  'ranking_rows_missing',
  'match_not_found',
  'already_confirmed',
  'already_disputed',
  'not_pending',
])

/**
 * Retorna a mensagem de erro amigável.
 * Se o erro for um código de RPC conhecido, retorna a chave de tradução
 * para ser resolvida pelo chamador via t('rpcError.<code>').
 * Caso contrário, retorna a mensagem do erro ou o fallback.
 */
export function getRpcErrorKey(err) {
  if (!err) return null
  const msg = typeof err === 'string' ? err : err?.message ?? ''
  const code = msg.trim()
  if (RPC_ERROR_CODES.has(code)) return `rpcError.${code}`
  return null
}

export function getErrorMessage(err, fallback = 'Erro inesperado.') {
  if (typeof err === 'string') return err
  if (isSupabaseError(err) && typeof err.message === 'string' && err.message.trim()) return err.message
  return fallback
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export async function selectSingle(query, fallbackMessage = 'Não foi possível carregar.') {
  const { data, error } = await query.single()
  if (error) throw error
  if (!data) throw new Error(fallbackMessage)
  return data
}

export async function selectMany(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
