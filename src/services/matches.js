import { supabase } from '../supabase/client.js'
import { rpc, selectMany } from './supabaseFetch.js'

/**
 * Lista partidas de uma quadra + categoria.
 * @param {string} courtId - UUID da quadra
 * @param {string} categoryId - UUID da categoria
 * @param {number} limit - Máximo de registros (padrão: 50)
 */
export async function listMatchesByCategory({ courtId, categoryId, limit = 50 }) {
  return await selectMany(
    supabase
      .from('matches')
      .select(
        'id,category_id,challenge_id,winner_id,loser_id,score,played_at,created_at,court_id,' +
        'status,reported_by,confirmed_by,disputed_by,dispute_reason,reported_at,confirmed_at,disputed_at,' +
        'court:courts(id,name)',
      )
      .eq('court_id', courtId)
      .eq('category_id', categoryId)
      .order('played_at', { ascending: false })
      .limit(limit),
  )
}

/**
 * Registra uma partida usando o fluxo v2 (resultado fica "pending_confirmation"
 * até o adversário confirmar ou contestar).
 * Retorna o UUID da partida criada.
 * @param {string} courtId - UUID da quadra
 * @param {string} categoryId - UUID da categoria
 * @param {string} challengeId - UUID do desafio
 * @param {string} winnerId - UUID do vencedor
 * @param {string} score - Placar (ex: "6-4 7-5")
 * @param {string} playedAt - Data/hora da partida (ISO 8601)
 */
export async function reportMatchV2({ courtId, categoryId, challengeId, winnerId, score, playedAt }) {
  const result = await rpc('report_match_v2', {
    p_court_id: courtId,
    p_category_id: categoryId,
    p_challenge_id: challengeId,
    p_winner_id: winnerId,
    p_score: score ?? '',
    p_played_at: playedAt ?? null,
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
