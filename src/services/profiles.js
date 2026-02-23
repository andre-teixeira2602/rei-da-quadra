import { supabase } from '../supabase/client.js'
import { selectMany, selectSingle } from './supabaseFetch.js'

export function formatProfileLabel(p) {
  if (!p) return '—'
  if (typeof p.display_name === 'string' && p.display_name.trim()) return p.display_name
  return 'Jogador'
}

export async function getProfilesByIds(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))]
  if (unique.length === 0) return new Map()

  const rows = await selectMany(
    supabase
      .from('profiles')
      .select('id,email,display_name')
      .in('id', unique),
  )

  const map = new Map()
  for (const r of rows) map.set(r.id, r)
  return map
}

export async function getMyProfile(userId) {
  return await selectSingle(
    supabase
      .from('profiles')
      .select('id,email,display_name,created_at')
      .eq('id', userId),
    'Perfil não encontrado.',
  )
}

export async function updateMyDisplayName({ userId, displayName }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('id,email,display_name,created_at')
    .single()

  if (error) throw error
  return data
}

