import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Polled rather than realtime — this only needs to answer "is
// there something new" for a nav badge, not render live content,
// so a lightweight 30s-refetch query is enough. Avoids opening a
// second websocket channel just for a badge when the actual chat
// page already has its own proper realtime subscription.
export function useUnreadChat(leagueId: string | null) {
  const { data: latestAt } = useQuery({
    queryKey: ['chat-latest', leagueId],
    enabled: !!leagueId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('league_messages')
        .select('created_at')
        .eq('league_id', leagueId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data?.created_at ?? null
    },
  })

  const lastViewed = leagueId ? localStorage.getItem(`chat-last-viewed-${leagueId}`) : null
  const hasUnread = !!latestAt && (!lastViewed || new Date(latestAt) > new Date(lastViewed))

  return { hasUnread }
}

// Called on mounting the actual chat page for this league — marks
// everything as read as of right now.
export function markChatRead(leagueId: string) {
  try { localStorage.setItem(`chat-last-viewed-${leagueId}`, new Date().toISOString()) }
  catch { /* localStorage unavailable — badge just won't clear, not worth failing over */ }
}
