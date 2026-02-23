import { supabase } from '../supabase/client.js'

export function isSupabaseError(err) {
  return Boolean(err && typeof err === 'object' && 'message' in err)
}

export function getErrorMessage(err, fallback = 'Erro inesperado.') {
  if (typeof err === 'string') return err
  if (isSupabaseError(err) && typeof err.message === 'string' && err.message.trim()) return err.message
  return fallback
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export async function selectSingle(query, fallbackMessage = 'Não foi possível carregar.') {
  const { data, error } = await query.single()
  if (error) throw error
  if (!data) throw new Error(fallbackMessage)
  return data
}

export async function selectMany(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

