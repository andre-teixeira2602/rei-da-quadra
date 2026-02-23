import { supabase } from '../supabase/client.js'
import { selectMany, selectSingle } from './supabaseFetch.js'

export async function listCategories() {
  return await selectMany(
    supabase
      .from('categories')
      .select('id,name,challenge_range,created_at')
      .order('name', { ascending: true }),
  )
}

export async function getCategoryById(categoryId) {
  return await selectSingle(
    supabase
      .from('categories')
      .select('id,name,challenge_range,created_at')
      .eq('id', categoryId),
    'Categoria não encontrada.',
  )
}

