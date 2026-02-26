import { rpc } from './supabaseFetch.js'

export async function listMyChallenges({ categoryId }) {
  // #region agent log
  console.warn('[listMyChallenges] called with categoryId:', categoryId, 'type:', typeof categoryId)
  // #endregion
  let data
  try {
    data = await rpc('list_my_challenges', { p_category_id: categoryId })
  } catch (err) {
    // #region agent log
    console.warn('[listMyChallenges] RPC threw error:', err)
    // #endregion
    throw err
  }
  // #region agent log
  console.warn('[listMyChallenges] raw response type:', typeof data, 'isArray:', Array.isArray(data), 'length:', data?.length, 'data:', JSON.stringify(data))
  // #endregion
  return Array.isArray(data) ? data : []
}

export async function getChallengeById(challengeId) {
  const rows = await rpc('get_challenge_by_id', { p_challenge_id: challengeId })
  if (!rows || rows.length === 0) throw new Error('Desafio não encontrado.')
  return rows[0]
}

export async function respondChallenge(challengeId, action) {
  await rpc('respond_challenge', { p_challenge_id: challengeId, p_action: action })
}

