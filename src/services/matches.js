import { supabase } from '../supabase/client.js'
import { rpc, selectMany } from './supabaseFetch.js'

export async function listMatchesByCategory({ categoryId, limit = 50 }) {
  return await selectMany(
    supabase
      .from('matches')
      .select(
        [
          'id',
          'category_id',
          'challenge_id',
          'winner_id',
          'loser_id',
          'score',
          'played_at',
          'created_at',
          'court_id',
          'court:courts(id,name)',
          // Anti-fraude v1.0
          'status',
          'reported_by',
          'confirmed_by',
          'dispute_reason',
          'reported_at',
          'confirmed_at',
          'disputed_at',
        ].join(','),
      )
      .eq('category_id', categoryId)
      .order('played_at', { ascending: false })
      .limit(limit),
  )
}

// Fluxo legado (sem confirmação dupla) — mantém compatibilidade.
export async function reportMatch({ challengeId, winnerId, score, playedAt, courtId }) {
  await rpc('report_match', {
    p_challenge_id: challengeId,
    p_winner_id: winnerId,
    p_score: score ?? '',
    p_played_at: playedAt ?? null,
    p_court_id: courtId ?? null,
  })
}

// Novo fluxo Anti-Fraude v1.0: reporta partida como pending_confirm (sem atualizar ranking).
export async function reportMatchAntiFraud({ challengeId, winnerId, score, playedAt, courtId }) {
  return await rpc('report_match_v2', {
    p_challenge_id: challengeId,
    p_court_id: courtId ?? null,
    p_played_at: playedAt ?? null,
    p_score: score ?? '',
    p_winner_id: winnerId,
  })
}

export async function confirmMatchResult({ matchId }) {
  await rpc('confirm_match_result', { p_match_id: matchId })
}

export async function disputeMatchResult({ matchId, reason }) {
  await rpc('dispute_match_result', {
    p_match_id: matchId,
    p_reason: reason ?? null,
  })
}

