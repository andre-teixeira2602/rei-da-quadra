import { rpc } from './supabaseFetch.js'

/**
 * Obtém o ranking de uma quadra + categoria.
 * @param {string} courtId - UUID da quadra
 * @param {string} categoryId - UUID da categoria
 */
export async function getRanking(courtId, categoryId) {
  return await rpc('get_ranking', { p_court_id: courtId, p_category_id: categoryId })
}

/**
 * Cria um desafio em uma quadra + categoria.
 * @param {string} courtId - UUID da quadra
 * @param {string} categoryId - UUID da categoria
 * @param {string} defenderId - UUID do defensor
 */
export async function createChallenge(courtId, categoryId, defenderId) {
  return await rpc('create_challenge', { p_court_id: courtId, p_category_id: categoryId, p_defender_id: defenderId })
}

/**
 * Obtém o rei (posição #1) de uma quadra + categoria.
 * @param {string} courtId - UUID da quadra
 * @param {string} categoryId - UUID da categoria
 */
export async function getKing(courtId, categoryId) {
  return await rpc('get_king', { p_court_id: courtId, p_category_id: categoryId })
}

