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
      .select('id,name,city,address,surface,is_active,created_at,owner_id')
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
export async function createCourt({ name, city, address, surface }) {
  const { data, error } = await supabase
    .from('courts')
    .insert([{ name: name.trim(), city: city?.trim() || null, address: address?.trim() || null, surface: surface || null, is_active: true }])
    .select('id,name,city,address,surface,is_active,created_at')
    .single()

  if (error) throw new Error(getErrorMessage(error, 'Não foi possível criar a quadra.'))
  return data
}

/**
 * Atualiza os dados de uma quadra existente.
 */
export async function updateCourt({ id, name, city, address, surface, is_active }) {
  const { data, error } = await supabase
    .from('courts')
    .update({ name: name.trim(), city: city?.trim() || null, address: address?.trim() || null, surface: surface || null, is_active })
    .eq('id', id)
    .select('id,name,city,address,surface,is_active,created_at')
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
