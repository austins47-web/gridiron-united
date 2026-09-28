import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { LeaguePoll } from '@/types/database'

export interface PollVote { poll_id: string; user_id: string; option_index: number }
export interface PollWithVotes { poll: LeaguePoll; votes: PollVote[] }

interface PollData { polls: LeaguePoll[]; votes: PollVote[] }

/**
 * A league's chat polls and their votes, for the poll cards. League
 * chat keeps it live (realtime on league_poll_votes invalidates it).
 */
export function useLeaguePolls(leagueId: string | null | undefined, userId: string | undefined) {
  const qc = useQueryClient()
  const key = ['league-polls', leagueId]

  const { data } = useQuery<PollData>({
    queryKey: key,
    enabled: !!leagueId,
    staleTime: 15_000,
    queryFn: async () => {
      const [{ data: polls, error: pErr }, { data: votes, error: vErr }] = await Promise.all([
        supabase.from('league_polls').select('*').eq('league_id', leagueId!).order('created_at', { ascending: false }).limit(200),
        supabase.from('league_poll_votes').select('poll_id, user_id, option_index').eq('league_id', leagueId!).limit(5000),
      ])
      if (pErr) throw pErr
      if (vErr) throw vErr
      return { polls: (polls ?? []) as LeaguePoll[], votes: (votes ?? []) as PollVote[] }
    },
  })

  const byId = useMemo(() => {
    const out = new Map<string, PollWithVotes>()
    for (const poll of data?.polls ?? []) out.set(poll.id, { poll, votes: [] })
    for (const v of data?.votes ?? []) out.get(v.poll_id)?.votes.push(v)
    return out
  }, [data])

  /** Votes for an option, or takes the vote back when it's already yours. */
  const vote = async (poll: LeaguePoll, option: number) => {
    if (!userId || !leagueId) return
    const mine = data?.votes.find(v => v.poll_id === poll.id && v.user_id === userId)
    const removing = mine?.option_index === option
    qc.setQueryData<PollData>(key, prev => prev && ({
      ...prev,
      votes: [
        ...prev.votes.filter(v => !(v.poll_id === poll.id && v.user_id === userId)),
        ...(removing ? [] : [{ poll_id: poll.id, user_id: userId, option_index: option }]),
      ],
    }))
    const { error } = removing
      ? await supabase.from('league_poll_votes').delete().eq('poll_id', poll.id).eq('user_id', userId)
      : await supabase.from('league_poll_votes').upsert(
          { poll_id: poll.id, user_id: userId, league_id: leagueId, option_index: option },
          { onConflict: 'poll_id,user_id' },
        )
    if (error) {
      toast.error(poll.closes_at && new Date(poll.closes_at) <= new Date() ? 'That poll has closed' : "Couldn't save your vote")
      qc.invalidateQueries({ queryKey: key })
    }
  }

  return { byId, vote, loaded: !!data }
}
