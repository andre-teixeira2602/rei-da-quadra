import { supabase } from '../supabase/client.js'
import { rpc, selectMany } from './supabaseFetch.js'

export async function listMatchesByCategory({ categoryId, limit = 50 }) {
  return await selectMany(
    supabase
      .from('matches')
      .select('id,category_id,challenge_id,winner_id,loser_id,score,played_at,created_at,court_id,court:courts(id,name)')
      .eq('category_id', categoryId)
      .order('played_at', { ascending: false })
      .limit(limit),
  )
}

export async function reportMatch({ challengeId, winnerId, score, playedAt, courtId }) {
  await rpc('report_match', {
    p_challenge_id: challengeId,
    p_winner_id: winnerId,
    p_score: score ?? '',
    p_played_at: playedAt ?? null,
    p_court_id: courtId ?? null,
  })
}

