import { supabase } from '../supabase/client.js'
import { selectMany } from './supabaseFetch.js'

/** Lista quadras públicas e ativas (para dropdown de partida, etc.). RLS: is_public e is_active. */
export async function listActiveCourts() {
  return await selectMany(
    supabase
      .from('courts')
      .select('id,name,city,address,is_active,created_at,phone,whatsapp,hours,price_info,is_public')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('name', { ascending: true }),
  )
}

/**
 * Lista quadras visíveis ao usuário (públicas+ativas + as do dono) para a página /quadras.
 * search opcional: filtra por nome ou cidade (case-insensitive).
 */
export async function listCourts({ search = '' } = {}) {
  let q = supabase
    .from('courts')
    .select('id,name,city,address,phone,whatsapp,hours,price_info,is_public,is_active,owner_id,created_at,updated_at')
    .order('name', { ascending: true })

  const term = typeof search === 'string' ? search.trim() : ''
  if (term.length > 0) {
    q = q.or(`name.ilike.%${term}%,city.ilike.%${term}%`)
  }
  return await selectMany(q)
}

/**
 * Cadastra uma nova quadra. owner_id é definido no backend (trigger).
 */
export async function createCourt(payload) {
  const { data, error } = await supabase
    .from('courts')
    .insert({
      name: payload.name?.trim() || '',
      city: payload.city?.trim() || null,
      address: payload.address?.trim() || null,
      phone: payload.phone?.trim() || null,
      whatsapp: payload.whatsapp?.trim() || null,
      hours: payload.hours?.trim() || null,
      price_info: payload.price_info?.trim() || null,
      is_public: payload.is_public !== false,
      is_active: true,
    })
    .select('id,name,city,created_at')
    .single()
  if (error) throw error
  return data
}
