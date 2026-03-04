import { supabase } from '../supabase/client.js'
import { rpc, selectMany } from './supabaseFetch.js'

export async function listMatchesByCategory({ categoryId, limit = 50 }) {
  return await selectMany(
    supabase
      .from('matches')
      .select(
        'id,category_id,challenge_id,winner_id,loser_id,score,played_at,created_at,court_id,' +
        'status,reported_by,confirmed_by,disputed_by,dispute_reason,reported_at,confirmed_at,disputed_at,' +
        'court:courts(id,name)',
      )
      .eq('category_id', categoryId)
      .order('played_at', { ascending: false })
      .limit(limit),
  )
}

/**
 * Registra uma partida usando o fluxo v2 (resultado fica "pending_confirmation"
 * até o adversário confirmar ou contestar).
 * Retorna o UUID da partida criada.
 */
export async function reportMatchV2({ challengeId, winnerId, score, playedAt, courtId }) {
  const result = await rpc('report_match_v2', {
    p_challenge_id: challengeId,
    p_winner_id: winnerId,
    p_score: score ?? '',
    p_played_at: playedAt ?? null,
    p_court_id: courtId ?? null,
  })
  return result
}

/**
 * Adversário confirma o resultado de uma partida pendente.
 */
export async function confirmMatchResult({ matchId }) {
  await rpc('confirm_match_result', {
    p_match_id: matchId,
  })
}

/**
 * Adversário contesta o resultado de uma partida pendente.
 */
export async function disputeMatchResult({ matchId, reason }) {
  await rpc('dispute_match_result', {
    p_match_id: matchId,
    p_reason: reason ?? '',
  })
}

/**
 * @deprecated Use reportMatchV2 para novos registros.
 * Mantido apenas para compatibilidade com código legado.
 */
export async function reportMatch({ challengeId, winnerId, score, playedAt, courtId }) {
  await rpc('report_match', {
    p_challenge_id: challengeId,
    p_winner_id: winnerId,
    p_score: score ?? '',
    p_played_at: playedAt ?? null,
    p_court_id: courtId ?? null,
  })
}
