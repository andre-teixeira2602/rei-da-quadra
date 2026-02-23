import { rpc } from './supabaseFetch.js'

export async function getRanking(categoryId) {
  return await rpc('get_ranking', { p_category_id: categoryId })
}

export async function createChallenge(categoryId, defenderId) {
  return await rpc('create_challenge', { p_category_id: categoryId, p_defender_id: defenderId })
}

export async function getKing(categoryId) {
  return await rpc('get_king', { p_category_id: categoryId })
}

