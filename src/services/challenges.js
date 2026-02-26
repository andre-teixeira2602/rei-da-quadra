import { rpc } from './supabaseFetch.js'

export async function listMyChallenges({ categoryId }) {
  return await rpc('list_my_challenges', { p_category_id: categoryId })
}

export async function getChallengeById(challengeId) {
  const rows = await rpc('get_challenge_by_id', { p_challenge_id: challengeId })
  if (!rows || rows.length === 0) throw new Error('Desafio não encontrado.')
  return rows[0]
}

export async function respondChallenge(challengeId, action) {
  await rpc('respond_challenge', { p_challenge_id: challengeId, p_action: action })
}

