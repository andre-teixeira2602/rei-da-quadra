import { supabase } from '../supabase/client.js'
import { selectMany } from './supabaseFetch.js'

export async function listActiveCourts() {
  return await selectMany(
    supabase
      .from('courts')
      .select('id,name,city,address,is_active,created_at')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  )
}

