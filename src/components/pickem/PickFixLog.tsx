import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { useLeagueMembersList } from '@/hooks/usePickemSeasonData'

interface PickEdit {
  id: number
  week: number
  game_id: string
  user_id: string
  by_user: string | null
  old_team: string | null
  new_team: string | null
  old_tiebreaker: number | null
  new_tiebreaker: number | null
  note: string | null
  created_at: string
  game: GameRef | GameRef[] | null
}

interface GameRef { away_team: string; home_team: string; game_date: string }

/** One save in the commissioner's pick fixer: the same member, note and minute. */
interface FixGroup { key: string; week: number; user: string; by: string | null; note: string | null; at: string; edits: PickEdit[] }

const SHOWN = 4

/**
 * Changed by the commissioner: every pick the commissioner entered,
 * changed or cleared (commish_set_picks, logged in pickem_pick_edits),
 * for the whole league to see. Under the Board for one week, and in the
 * commissioner's pick fixer for all of them. Nothing on a week without
 * any, unless `empty` says what to show.
 */
export function PickFixLog({ leagueId, week, empty, limit = 200 }: { leagueId: string | null | undefined; week?: number; empty?: string; limit?: number }) {
  const members = useLeagueMembersList(leagueId)
  const { data: edits = [] } = useQuery({
    queryKey: ['pick-fixes', leagueId, CURRENT_SEASON, week ?? 'all'],
    enabled: !!leagueId,
    queryFn: async (): Promise<PickEdit[]> => {
      let q = supabase.from('pickem_pick_edits')
        .select('id, week, game_id, user_id, by_user, old_team, new_team, old_tiebreaker, new_tiebreaker, note, created_at, game:nfl_games(away_team, home_team, game_date)')
        .eq('league_id', leagueId!)
        .eq('season', CURRENT_SEASON)
        .order('created_at', { ascending: false })
        .order('id')
        .limit(limit)
      if (week != null) q = q.eq('week', week)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as PickEdit[]
    },
  })
  const [open, setOpen] = useState<Set<string>>(new Set())

  const nameOf = (id: string | null) => {
    const m = members.find((x: any) => x.user_id === id) as any
    return m?.profile?.display_name || m?.profile?.username || 'Someone'
  }
  // A save's changes go together: same member, commissioner, note and minute
  const groups: FixGroup[] = []
  for (const e of edits) {
    const key = [e.user_id, e.by_user, e.note ?? '', e.week, e.created_at.slice(0, 16)].join('|')
    const g = groups.find(x => x.key === key)
    if (g) g.edits.push(e)
    else groups.push({ key, week: e.week, user: e.user_id, by: e.by_user, note: e.note, at: e.created_at, edits: [e] })
  }

  // Each save's games in kickoff order
  const kickoff = (e: PickEdit) => (Array.isArray(e.game) ? e.game[0] : e.game)?.game_date ?? ''
  for (const g of groups) g.edits.sort((a, b) => kickoff(a).localeCompare(kickoff(b)))

  if (!groups.length) {
    return empty ? <p className="text-xs text-field-500">{empty}</p> : null
  }

  const gameOf = (e: PickEdit) => {
    const g = Array.isArray(e.game) ? e.game[0] : e.game
    return g ? `${g.away_team} @ ${g.home_team}` : 'a game'
  }
  const change = (e: PickEdit) => {
    const pick = e.old_team === e.new_team ? null
      : !e.old_team ? e.new_team
        : !e.new_team ? `no pick (was ${e.old_team})`
          : `${e.old_team} → ${e.new_team}`
    const guess = e.old_tiebreaker === e.new_tiebreaker ? null
      : e.new_tiebreaker == null ? `no guess (was ${e.old_tiebreaker})`
        : e.old_tiebreaker == null ? `guess ${e.new_tiebreaker}`
          : `guess ${e.old_tiebreaker} → ${e.new_tiebreaker}`
    return [pick, guess].filter(Boolean).join(', ')
  }
  const verb = (edits: PickEdit[]) =>
    edits.every(e => !e.old_team && e.new_team) ? 'entered'
      : edits.every(e => e.old_team && !e.new_team) ? 'cleared'
        : 'changed'

  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 font-cond font-bold text-sm uppercase tracking-wider text-white mb-3">
        <PenLine className="w-4 h-4 text-gold" /> Changed by the commissioner
      </p>
      <ul className="space-y-3">
        {groups.map(g => {
          const all = open.has(g.key)
          const shown = all ? g.edits : g.edits.slice(0, SHOWN)
          const n = g.edits.length
          return (
            <li key={g.key} className="text-sm">
              <p className="text-field-200 leading-snug">
                <span className="font-bold text-white">{nameOf(g.by)}</span> {verb(g.edits)}{' '}
                {n === 1 ? <><span className="font-bold text-white">{nameOf(g.user)}</span>&rsquo;s pick</> : <>{n} of <span className="font-bold text-white">{nameOf(g.user)}</span>&rsquo;s picks</>}
                <span className="text-field-500"> · Week {g.week} · {format(new Date(g.at), 'MMM d')}</span>
              </p>
              {g.note && <p className="text-xs text-field-300 italic mt-0.5">&ldquo;{g.note}&rdquo;</p>}
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-field-400">
                {shown.map(e => (
                  <li key={e.id}>{gameOf(e)}: <span className="font-bold text-field-200">{change(e)}</span></li>
                ))}
              </ul>
              {n > SHOWN && (
                <button
                  onClick={() => setOpen(s => { const next = new Set(s); if (all) next.delete(g.key); else next.add(g.key); return next })}
                  className="mt-1 text-[11px] font-bold text-gold hover:text-gold-light"
                >
                  {all ? 'Show fewer' : `Show all ${n}`}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
