import { supabase } from '../supabase/client.js'
import { selectMany } from './supabaseFetch.js'

/**
 * Lista mensagens de um desafio (ordenadas por created_at asc para exibição).
 * RLS: apenas challenger ou defender.
 */
export async function listChallengeMessages(challengeId) {
  const { data, error } = await supabase
    .from('challenge_messages')
    .select('id,challenge_id,sender_id,message,created_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Envia uma mensagem no chat do desafio. sender_id deve ser o usuário autenticado (RLS valida).
 */
export async function sendChallengeMessage(challengeId, message, senderId) {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) throw new Error('message_required')
  if (!senderId) throw new Error('not_authenticated')
  const { data, error } = await supabase
    .from('challenge_messages')
    .insert({
      challenge_id: challengeId,
      sender_id: senderId,
      message: text,
    })
    .select('id,challenge_id,sender_id,message,created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Inscreve-se em novas mensagens do desafio (Realtime).
 * Retorna o objeto subscription com .unsubscribe().
 */
export function subscribeChallengeMessages(challengeId, onInsert) {
  return supabase
    .channel(`challenge_messages:${challengeId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'challenge_messages',
        filter: `challenge_id=eq.${challengeId}`,
      },
      (payload) => {
        if (payload?.new && typeof onInsert === 'function') {
          onInsert(payload.new)
        }
      },
    )
    .subscribe()
}
