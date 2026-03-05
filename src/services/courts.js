import { supabase } from '../supabase/client.js'
import { selectMany, selectSingle, getErrorMessage } from './supabaseFetch.js'

/**
 * Lista apenas quadras ativas (usado no formulário de registro de partidas).
 */
export async function listActiveCourts() {
  return await selectMany(
    supabase
      .from('courts')
      .select('id,name,city,address,is_active,created_at')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  )
}

/**
 * Lista todas as quadras (ativas e inativas), para a página de gerenciamento.
 */
export async function listAllCourts() {
  return await selectMany(
    supabase
      .from('courts')
      .select('id,name,city,address,is_public,description,is_active,created_at,owner_id')
      .order('name', { ascending: true }),
  )
}

/**
 * Lista quadras públicas (diretório público).
 * Usado na tela de seleção de quadras.
 */
export async function listPublicCourts() {
  return await selectMany(
    supabase
      .from('courts')
      .select('id,name,city,address,is_public,description,created_at')
      .eq('is_public', true)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  )
}

/**
 * Obtém detalhes de uma quadra específica.
 */
export async function getCourtById(courtId) {
  return await selectSingle(
    supabase
      .from('courts')
      .select('id,name,city,address,is_public,description,owner_id,created_at')
      .eq('id', courtId),
    'Quadra não encontrada.',
  )
}

/**
 * Cria uma nova quadra.
 */
export async function createCourt({ name, city, address, description, is_public }) {
  const { data, error } = await supabase
    .from('courts')
    .insert([{ name: name.trim(), city: city?.trim() || null, address: address?.trim() || null, description: description?.trim() || null, is_public: is_public !== false, is_active: true }])
    .select('id,name,city,address,description,is_public,is_active,created_at')
    .single()

  if (error) throw new Error(getErrorMessage(error, 'Não foi possível criar a quadra.'))
  return data
}

/**
 * Atualiza os dados de uma quadra existente.
 */
export async function updateCourt({ id, name, city, address, description, is_public, is_active }) {
  const { data, error } = await supabase
    .from('courts')
    .update({ name: name.trim(), city: city?.trim() || null, address: address?.trim() || null, description: description?.trim() || null, is_public, is_active })
    .eq('id', id)
    .select('id,name,city,address,description,is_public,is_active,created_at')
    .single()

  if (error) throw new Error(getErrorMessage(error, 'Não foi possível atualizar a quadra.'))
  return data
}

/**
 * Desativa (soft delete) uma quadra.
 */
export async function deactivateCourt({ id }) {
  const { error } = await supabase
    .from('courts')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw new Error(getErrorMessage(error, 'Não foi possível desativar a quadra.'))
}

/**
 * Usuário entra em uma quadra (join court).
 * Insere registro em court_members e category_members para todas as categorias.
 */
export async function joinCourt(courtId) {
  const { data, error } = await supabase.rpc('join_court', {
    p_court_id: courtId,
  })

  if (error) throw new Error(getErrorMessage(error, 'Não foi possível entrar na quadra.'))
  
  if (data?.success === false) {
    const errorMessages = {
      'not_authenticated': 'Você precisa estar autenticado.',
      'court_not_found': 'Quadra não encontrada.',
      'already_member': 'Você já é membro desta quadra.',
    }
    throw new Error(errorMessages[data.error] || 'Erro ao entrar na quadra.')
  }

  return data
}
