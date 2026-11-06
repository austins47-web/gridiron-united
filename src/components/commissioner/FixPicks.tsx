import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine, Loader2, Lock, Target, Check } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { useAppStore } from '@/store/appStore'
import { useLeagueMembersList } from '@/hooks/usePickemSeasonData'
import { isFinal, isLive, winnerOf, type Game } from '@/components/pickem/standings'
import { PickFixLog } from '@/components/pickem/PickFixLog'

interface SavedPick { game_id: string; picked_team: string; tiebreaker_score: number | null; entered_by: string | null }
/** An unsaved change to one game: the team (null: no pick), and the tiebreaker guess as typed */
interface Draft { team?: string | null; tb?: string }

const nameOf = (m: any): string => m?.profile?.display_name || m?.profile?.username || 'Someone'

/**
 * Commissioner → Picks: enter or correct a member's picks on games that
 * have kicked off (picks written on paper, a pick the app lost), or
 * clear one. Games still open stay theirs to pick, and their picks on
 * them never show here. Saves through commish_set_picks: the Board marks
 * the pick, Changed by the commissioner lists it for everyone, and the
 * member gets a notification.
 */
export function FixPicks({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const me = useAppStore(s => s.user)
  const members = useLeagueMembersList(leagueId)
  const sortedMembers = useMemo(() => [...members].sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [members])

  const { data: games = [] } = useQuery({
    queryKey: ['fix-picks-games', CURRENT_SEASON],
    queryFn: async (): Promise<Game[]> => {
      const { data, error } = await supabase.from('nfl_games')
        .select('id, week, season, home_team, away_team, home_score, away_score, status, game_date, is_tiebreaker')
        .eq('season', CURRENT_SEASON)
        .order('game_date')
      if (error) throw error
      return (data ?? []) as unknown as Game[]
    },
  })
  const now = Date.now()
  const started = (g: Game) => !!g.game_date && new Date(g.game_date).getTime() <= now
  // Weeks with a game kicked off, newest first
  const weeks = [...new Set(games.filter(started).map(g => g.week))].sort((a, b) => b - a)

  const [week, setWeek] = useState<number | null>(null)
  const shownWeek = week ?? weeks[0] ?? null
  const [userId, setUserId] = useState('')
  const weekGames = games.filter(g => g.week === shownWeek)

  const { data: picks = [], isFetching } = useQuery({
    queryKey: ['fix-picks-member', leagueId, userId, shownWeek],
    enabled: !!userId && shownWeek != null,
    queryFn: async (): Promise<SavedPick[]> => {
      const { data, error } = await supabase.from('pickem_picks')
        .select('game_id, picked_team, tiebreaker_score, entered_by')
        .eq('league_id', leagueId).eq('user_id', userId)
        .eq('season', CURRENT_SEASON).eq('week', shownWeek!)
      if (error) throw error
      return (data ?? []) as SavedPick[]
    },
  })
  const savedOf = new Map(picks.map(p => [p.game_id, p]))

  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft({}) }, [userId, shownWeek])

  const teamOf = (g: Game) => {
    const d = draft[g.id]
    return d && 'team' in d ? d.team ?? null : savedOf.get(g.id)?.picked_team ?? null
  }
  const guessOf = (g: Game) => draft[g.id]?.tb ?? (savedOf.get(g.id)?.tiebreaker_score?.toString() ?? '')
  const setTeam = (g: Game, team: string | null) => setDraft(d => ({ ...d, [g.id]: { ...d[g.id], team } }))
  const setGuess = (g: Game, tb: string) => setDraft(d => ({ ...d, [g.id]: { ...d[g.id], tb: tb.replace(/[^0-9]/g, '').slice(0, 3) } }))

  // What actually differs from what's saved
  const changes = weekGames.filter(started).flatMap(g => {
    const saved = savedOf.get(g.id)
    const team = teamOf(g)
    const change: { game_id: string; team: string | null; tiebreaker?: number | null } = { game_id: g.id, team }
    let changed = team !== (saved?.picked_team ?? null)
    const typed = draft[g.id]?.tb
    if (g.is_tiebreaker && team && typed !== undefined) {
      const tb = typed.trim() === '' ? null : Number(typed)
      if (tb !== (saved?.tiebreaker_score ?? null)) { change.tiebreaker = tb; changed = true }
    }
    return changed ? [change] : []
  })

  const member = members.find((m: any) => m.user_id === userId)
  const save = async () => {
    if (!changes.length || !userId) return
    if (changes.some(c => c.tiebreaker != null && (c.tiebreaker < 0 || c.tiebreaker > 200))) {
      toast.error('A tiebreaker guess is 0 to 200 points')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('commish_set_picks', {
      p_league: leagueId, p_user: userId, p_changes: changes, p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    const n = Number(data ?? 0)
    toast.success(`Saved ${n} change${n === 1 ? '' : 's'}${userId !== me?.id ? `. ${nameOf(member)} gets a notification.` : ''}`)
    setDraft({})
    for (const key of ['fix-picks-member', 'pick-fixes', 'pickem-season-picks', 'all-pickem-picks', 'my-pickem-picks']) {
      qc.invalidateQueries({ queryKey: [key, leagueId] })
    }
  }

  const teamButton = (g: Game, team: string | null, label: string) => {
    const on = teamOf(g) === team
    const saved = (savedOf.get(g.id)?.picked_team ?? null) === team
    // Only once it's over: a live game's leader can still lose
    const won = team != null && isFinal(g) && winnerOf(g) === team
    return (
      <button
        key={label}
        onClick={() => setTeam(g, team)}
        disabled={saving}
        className={clsx(
          'flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-cond font-bold uppercase tracking-wider transition-colors',
          on && !saved ? 'border-gold bg-gold text-field-950'
            : on ? 'border-field-500 bg-field-700 text-white'
              : 'border-field-700 bg-field-800 text-field-300 hover:border-gold/50 hover:text-gold',
        )}
      >
        {label}
        {won && <Check className={clsx('w-3 h-3', on && !saved ? 'text-field-950' : 'text-nfl')} aria-label="won" />}
      </button>
    )
  }

  return (
    <div className="space-y-4 pt-6 border-t border-field-700">
      <div>
        <h3 className="flex items-center gap-1.5 font-cond font-bold text-white tracking-wide text-base mb-1">
          <PenLine className="w-4 h-4 text-gold" /> Fix someone&rsquo;s picks
        </h3>
        <p className="text-field-400 text-sm">
          Enter or correct picks on games that have kicked off: picks written on paper, or one the app lost. Games still
          open stay theirs to pick. Everything you change is marked on the Board and listed for the whole league under
          Changed by the commissioner, and they get a notification.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select className="input" value={userId} onChange={e => setUserId(e.target.value)} aria-label="Whose picks">
          <option value="">Whose picks…</option>
          {sortedMembers.map((m: any) => <option key={m.user_id} value={m.user_id}>{nameOf(m)}</option>)}
        </select>
        <select className="input" value={shownWeek ?? ''} onChange={e => setWeek(Number(e.target.value))} aria-label="Week" disabled={!weeks.length}>
          {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
        </select>
      </div>

      {userId && shownWeek != null && (
        <div className="space-y-2">
          {isFetching && !picks.length && <Loader2 className="w-4 h-4 animate-spin text-field-400" />}
          {weekGames.map(g => {
            if (!started(g)) {
              return (
                <div key={g.id} className="flex items-center gap-2 rounded-lg border border-field-800 px-3 py-2 text-xs text-field-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-bold text-field-400">{g.away_team} @ {g.home_team}</span>
                  <span className="truncate">· opens at kickoff, {format(new Date(g.game_date), 'EEE h:mm a')}: theirs to pick until then</span>
                </div>
              )
            }
            const saved = savedOf.get(g.id)
            const score = g.home_score != null && g.away_score != null ? `${g.away_score}–${g.home_score}` : null
            const team = teamOf(g)
            return (
              <div key={g.id} className={clsx('rounded-lg border px-3 py-2', changes.some(c => c.game_id === g.id) ? 'border-gold/50 bg-gold/[0.04]' : 'border-field-700 bg-field-800/40')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">{g.away_team} @ {g.home_team}</span>
                  {score && <span className="text-xs text-field-400 tabular-nums">{score}{isFinal(g) ? ' · Final' : isLive(g) ? ' · Live' : ''}</span>}
                  {saved?.entered_by && <span title="Entered by the commissioner" className="text-field-500"><PenLine className="w-3 h-3" /></span>}
                  <div className="ml-auto flex gap-1.5">
                    {teamButton(g, g.away_team, g.away_team)}
                    {teamButton(g, g.home_team, g.home_team)}
                    {teamButton(g, null, 'No pick')}
                  </div>
                </div>
                {g.is_tiebreaker && (
                  <label className={clsx('mt-2 flex items-center gap-2 text-xs', team ? 'text-field-300' : 'text-field-600')}>
                    <Target className="w-3.5 h-3.5 shrink-0" /> Tiebreaker guess (total points)
                    <input
                      className="input !w-20 !py-1 text-center"
                      inputMode="numeric"
                      value={guessOf(g)}
                      onChange={e => setGuess(g, e.target.value)}
                      disabled={!team || saving}
                      placeholder="—"
                      aria-label="Tiebreaker guess"
                    />
                  </label>
                )}
              </div>
            )
          })}

          <input
            className="input"
            value={note}
            maxLength={140}
            onChange={e => setNote(e.target.value)}
            placeholder="Why (shown with the change), e.g. Picks written on paper"
            aria-label="Why"
          />
          <button onClick={save} disabled={!changes.length || saving} className="btn-gold w-full justify-center disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            {changes.length ? `Save ${changes.length} change${changes.length === 1 ? '' : 's'} to ${nameOf(member)}'s picks` : 'No changes yet'}
          </button>
          <p className="text-[11px] text-field-500">
            The standings update right away. A week Conquest has already settled stays as it was settled, and a recap or
            roast already posted isn&rsquo;t rewritten.
          </p>
        </div>
      )}

      <PickFixLog leagueId={leagueId} empty="No picks changed yet." limit={60} />
    </div>
  )
}
