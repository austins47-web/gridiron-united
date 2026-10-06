import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { problemLoggingFetch, startProblemLog } from './problemLog'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Copy .env.example to .env.local and fill in your Supabase URL and anon key.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  // Requests the server refuses go to the problem log
  global: { fetch: problemLoggingFetch },
})

// The problem log writes as the signed-in person (signed-out problems aren't kept)
startProblemLog(async row => {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  await supabase.rpc('log_client_error', {
    p_kind: row.kind, p_message: row.message, p_detail: (row.detail ?? null) as any,
    p_path: row.path, p_version: row.version, p_agent: row.agent,
  })
})

// Helper: get current user's profile
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// Helper: subscribe to a table with cleanup
export function subscribeToTable(
  table: string,
  filter: string,
  callback: (payload: Record<string, unknown>) => void
) {
  const channel = supabase
    .channel(`${table}:${filter}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table, filter },
      callback
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
