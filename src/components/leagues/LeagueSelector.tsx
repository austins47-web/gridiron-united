import { useEffect, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trophy, Shield } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useMyLeagues } from '@/hooks/useLeague'
import type { League, LeagueMember } from '@/types/database'
import clsx from 'clsx'

export function LeagueSelector() {
  const { activeLeague, activeLeagueId, setActiveLeague } = useAppStore()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  // Previously this component fetched its own copy of "my leagues"
  // via a plain useState + manual Supabase call, entirely separate
  // from react-query. That meant leaving a league correctly
  // invalidated the ['my-leagues'] cache everywhere else in the app
  // — but this dropdown never saw it, since a manual fetch stored
  // in local state is invisible to query-cache invalidation. It
  // kept showing leagues you'd already left until a full page
  // reload. Using the same useMyLeagues() hook everything else
  // reads means there's only one source of truth now, so leaving
  // a league here can never drift out of sync with anywhere else.
  const { data: myLeagues = [], isLoading: loading } = useMyLeagues()
  const leagues = useMemo(
    () => myLeagues
      .filter((m: any) => m.league)
      .map((m: any) => {
        const { league, ...membership } = m
        return { league: league as League, membership: membership as LeagueMember }
      }),
    [myLeagues],
  )

  // Restore whichever league was active before a refresh —
  // localStorage persists the id across reloads (see appStore's
  // setActiveLeague). Only fall back to leagues[0] when there's no
  // persisted choice, or the persisted league no longer applies
  // (left the league, id stale from another account).
  useEffect(() => {
    if (leagues.length === 0 || activeLeague) return
    const restored = activeLeagueId
      ? leagues.find(i => i.league.id === activeLeagueId)
      : null
    const pick = restored ?? leagues[0]
    setActiveLeague(pick.league, pick.membership)
  }, [leagues, activeLeague, activeLeagueId, setActiveLeague])

  function switchLeague(league: League, membership: LeagueMember) {
    if (league.id === activeLeague?.id) { setOpen(false); return }

    // Invalidate all league-specific query caches so new league loads fresh
    qc.invalidateQueries({ queryKey: ['my-roster'] })
    qc.invalidateQueries({ queryKey: ['rostered-ids'] })
    qc.invalidateQueries({ queryKey: ['draft-state'] })
    qc.invalidateQueries({ queryKey: ['draft-picks'] })
    qc.invalidateQueries({ queryKey: ['league-members'] })
    qc.invalidateQueries({ queryKey: ['standings'] })
    qc.invalidateQueries({ queryKey: ['matchups'] })
    qc.invalidateQueries({ queryKey: ['comm-members'] })
    qc.invalidateQueries({ queryKey: ['comm-roster'] })

    setActiveLeague(league, membership)
    setOpen(false)
  }

  if (loading) {
    return (
      <div className="league-selector-loading flex items-center gap-2 px-3 py-1.5 rounded bg-field-700 border border-white/[0.06]">
        <div className="w-24 h-3 bg-field-600 rounded animate-pulse" />
      </div>
    )
  }

  if (leagues.length === 0) {
    return (
      <div className="text-xs text-gray-600 font-cond uppercase tracking-wider">
        No leagues — join or create one
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="league-selector-btn flex items-center gap-2 px-3 py-1.5 rounded bg-field-700 border border-white/[0.06] hover:border-gold/30 transition-colors"
      >
        <Trophy size={13} className="text-gold shrink-0" />
        <span className="league-selector-name font-cond font-bold text-sm text-gray-200 max-w-[180px] truncate">
          {activeLeague?.name ?? 'Select League'}
        </span>
        <ChevronDown size={13} className={clsx('text-gray-500 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="league-selector-dropdown absolute left-0 top-full mt-1 w-72 bg-field-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="league-selector-header px-3 py-2 border-b border-white/10">
              <span className="font-cond font-bold text-xs uppercase tracking-wider text-gray-500">
                Your Leagues ({leagues.length})
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {leagues.map(({ league, membership }) => {
                const isActive = activeLeague?.id === league.id
                return (
                  <button
                    key={league.id}
                    onClick={() => switchLeague(league, membership)}
                    className={clsx(
                      'league-selector-row w-full text-left px-3 py-3 transition-colors hover:bg-white/5 flex items-center justify-between gap-3 border-b border-white/5 last:border-0',
                      isActive && 'active bg-gold/[0.06]',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* League initial avatar */}
                      <div className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0',
                        isActive ? 'bg-gold text-field-950' : 'league-selector-avatar-inactive bg-field-700 text-gold',
                      )}>
                        {league.name[0].toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="league-selector-name font-cond font-bold text-sm text-gray-200 truncate">
                            {league.name}
                          </span>
                          {isActive && (
                            <span className="text-[11px] bg-gold/20 text-gold px-1 py-0.5 rounded font-bold shrink-0">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {league.league_type === 'pickem' ? (
                            <span className="font-cond font-bold text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold">
                              Pick'Em
                            </span>
                          ) : (
                            <>
                              <span className={clsx(
                                'font-cond font-bold text-xs uppercase tracking-wider px-1.5 py-0.5 rounded',
                                league.scoring_type === 'ppr'
                                  ? 'bg-nfl/15 text-nfl'
                                  : league.scoring_type === 'half_ppr'
                                  ? 'bg-cfb/15 text-cfb'
                                  : 'bg-gray-600/20 text-gray-500',
                              )}>
                                {league.scoring_type?.toUpperCase().replace('_', '-')}
                              </span>
                              <span className="text-xs text-gray-600">{league.num_teams} teams</span>
                              <span className="text-xs text-gray-600 capitalize">{league.draft_status?.replace('_', '-')}</span>
                              <span className="text-xs text-gray-500">
                                {membership.wins}-{membership.losses}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {membership.is_commissioner && (
                      <Shield size={13} className="text-gold shrink-0" title="Commissioner" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
