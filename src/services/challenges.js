import { supabase } from '../supabase/client.js'
import { rpc, selectMany, selectSingle } from './supabaseFetch.js'

export async function listMyChallenges({ categoryId, userId }) {
  // RLS garante que o usuário só veja desafios onde é challenger/defender.
  return await selectMany(
    supabase
      .from('challenges')
      .select('id,category_id,challenger_id,defender_id,status,created_at,expires_at,responded_at,completed_at')
      .eq('category_id', categoryId)
      .or(`challenger_id.eq.${userId},defender_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
  )
}

export async function getChallengeById(challengeId) {
  return await selectSingle(
    supabase
      .from('challenges')
      .select('id,category_id,challenger_id,defender_id,status,created_at,expires_at,responded_at,completed_at')
      .eq('id', challengeId),
    'Desafio não encontrado.',
  )
}

export async function respondChallenge(challengeId, action) {
  await rpc('respond_challenge', { p_challenge_id: challengeId, p_action: action })
}

