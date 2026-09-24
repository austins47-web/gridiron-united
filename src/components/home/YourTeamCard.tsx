import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Newspaper, Tv, Star } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import { useFavoriteTeam, type FavoriteTeam, type TeamGame } from '@/hooks/useFavoriteTeam'
import { useNflOdds } from '@/hooks/useNflOdds'

const GameDetailModal = lazy(() => import('@/components/scores/GameDetailModal').then(m => ({ default: m.GameDetailModal })))

// ══════════════════════════════════════════════════════════════
// Home's "Your Team": the favorite NFL and college teams from the
// profile — record and standing, the live or next game (with the
// line), the last result and the latest team news. Tapping a game
// opens its detail sheet; tapping the team opens its team page.
// ══════════════════════════════════════════════════════════════

export function YourTeams({ onOpenTeam }: { onOpenTeam: (id: string, league: 'NFL' | 'CFB') => void }) {
  const { profile } = useAppStore()
  const navigate = useNavigate()
  const nfl = profile?.favorite_nfl_team ?? null
  const cfb = profile?.favorite_cfb_team ?? null

  if (!nfl && !cfb) {
    return (
      <button
        onClick={() => navigate('/app/account')}
        className="w-full flex items-center gap-3 rounded-xl border border-dashed border-field-600 bg-field-800/40 px-4 py-3 text-left hover:border-gold/50 transition-colors"
      >
        <Star className="w-4 h-4 text-gold shrink-0" />
        <span className="flex-1 text-sm text-field-300">
          Pick your favorite teams to follow their games and news here
        </span>
        <ChevronRight className="w-4 h-4 text-field-500" />
      </button>
    )
  }
  return (
    <div className={clsx('grid gap-2', nfl && cfb && 'sm:grid-cols-2')}>
      {nfl && <TeamCard league="NFL" teamKey={nfl} onOpenTeam={onOpenTeam} />}
      {cfb && <TeamCard league="CFB" teamKey={cfb} onOpenTeam={onOpenTeam} />}
    </div>
  )
}

function TeamCard({ league, teamKey, onOpenTeam }: {
  league: 'NFL' | 'CFB'; teamKey: string; onOpenTeam: (id: string, league: 'NFL' | 'CFB') => void
}) {
  const { data: team, isLoading } = useFavoriteTeam(league, teamKey)
  const [gameId, setGameId] = useState<string | null>(null)

  if (isLoading) return <div className="h-[168px] rounded-xl bg-field-800 animate-pulse" />
  if (!team) return null
  const current = team.live ?? team.next

  return (
    <div className="rounded-xl border border-field-700 bg-field-800 overflow-hidden">
      {/* Team banner */}
      <button
        onClick={() => onOpenTeam(team.id, league)}
        className="relative w-full flex items-center gap-3 px-3.5 py-3 text-left group"
      >
        <div
          className="absolute inset-0 opacity-40 group-hover:opacity-55 transition-opacity"
          style={{ background: `linear-gradient(100deg, #${team.color} 0%, transparent 75%)` }}
        />
        <img src={team.logo} alt="" className="relative w-11 h-11 object-contain drop-shadow-lg shrink-0" />
        <div className="relative min-w-0 flex-1">
          <div className="font-cond font-bold text-[10px] uppercase tracking-[0.2em] text-white/70">
            {team.rank ? `#${team.rank} · ` : ''}{team.location}
          </div>
          <div className="font-cond font-black uppercase text-xl text-white leading-none truncate">{team.name}</div>
        </div>
        <div className="relative text-right shrink-0">
          <div className="font-cond font-black text-2xl text-white tabular-nums leading-none">{team.record || '0-0'}</div>
          {team.standing && <div className="text-[11px] text-white/70 mt-0.5">{team.standing}</div>}
        </div>
        <ChevronRight className="relative w-4 h-4 text-white/50 shrink-0 -mr-1" />
      </button>

      {/* Live / next, then last */}
      <div className="divide-y divide-field-700/70 border-t border-field-700">
        {current && <GameRow team={team} game={current} label={current.state === 'in' ? 'Live' : 'Next'} onOpen={() => setGameId(current.id)} />}
        {team.last && <GameRow team={team} game={team.last} label="Last" onOpen={() => setGameId(team.last!.id)} />}
        {!current && !team.last && (
          <div className="px-3.5 py-2.5 text-xs text-field-400">No games on the schedule yet.</div>
        )}
      </div>

      {/* Latest news */}
      {team.headlines.length > 0 && (
        <div className="border-t border-field-700 px-3.5 py-2 space-y-1.5">
          {team.headlines.map(h => (
            <a
              key={h.url}
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 group"
            >
              <Newspaper className="w-3.5 h-3.5 text-gold/80 shrink-0 mt-0.5" />
              <span className="text-[13px] text-field-200 leading-snug group-hover:text-gold transition-colors line-clamp-2 flex-1">
                {h.title}
              </span>
              {h.published && <span className="text-[11px] text-field-500 shrink-0 mt-px">{ago(h.published)}</span>}
            </a>
          ))}
        </div>
      )}

      {gameId && (
        <Suspense fallback={null}>
          <GameDetailModal gameId={gameId} league={league} onClose={() => setGameId(null)} />
        </Suspense>
      )}
    </div>
  )
}

function GameRow({ team, game, label, onOpen }: { team: FavoriteTeam; game: TeamGame; label: string; onOpen: () => void }) {
  const { data: odds } = useNflOdds()
  const live = game.state === 'in'
  const at = game.home ? 'vs' : '@'

  // The line, for an NFL game that hasn't kicked off (odds_cache is NFL)
  let line: string | null = null
  if (game.state === 'pre' && team.league === 'NFL') {
    const key = game.home ? `${game.opp.abbr}@${team.abbr}` : `${team.abbr}@${game.opp.abbr}`
    const o = odds?.get(key)
    if (o?.spread != null) {
      const homeAbbr = game.home ? team.abbr : game.opp.abbr
      const awayAbbr = game.home ? game.opp.abbr : team.abbr
      line = o.spread === 0 ? 'PK' : o.spread < 0 ? `${homeAbbr} ${o.spread}` : `${awayAbbr} -${o.spread}`
    }
  }

  return (
    <button onClick={onOpen} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-field-700/40 transition-colors">
      <span className={clsx(
        'font-cond font-black text-[10px] uppercase tracking-[0.15em] w-9 shrink-0',
        live ? 'text-red-400' : 'text-field-500',
      )}>
        {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1 align-middle" />}
        {label}
      </span>
      <span className="text-xs text-field-400 w-5 shrink-0 text-center">{at}</span>
      {game.opp.logo && <img src={game.opp.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}
      <span className="text-sm text-white font-semibold truncate">
        {game.opp.rank ? <span className="text-field-400 font-normal text-xs mr-1">#{game.opp.rank}</span> : null}
        {team.league === 'NFL' ? game.opp.abbr : game.opp.name}
      </span>

      <span className="ml-auto flex items-center gap-2 shrink-0">
        {game.state === 'pre' ? (
          <>
            {line && <span className="font-cond font-bold text-[11px] text-gold bg-gold/10 rounded px-1.5 py-0.5">{line}</span>}
            <span className="text-xs text-field-300 text-right">
              {when(game.date)}
              {game.broadcast && <span className="text-field-500"> · <Tv className="w-3 h-3 inline -mt-0.5" /> {game.broadcast}</span>}
            </span>
          </>
        ) : (
          <>
            {game.won != null && (
              <span className={clsx('font-cond font-black text-sm w-4 text-center', game.won ? 'text-emerald-400' : 'text-red-400')}>
                {game.won ? 'W' : 'L'}
              </span>
            )}
            <span className="font-cond font-black text-base text-white tabular-nums">{game.us ?? 0}–{game.them ?? 0}</span>
            {live && <span className="text-[11px] text-red-400">{game.detail}</span>}
          </>
        )}
      </span>
    </button>
  )
}

/** "Sun 1:00 PM", "Tonight 8:15 PM", "Mon 9/28". */
function when(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86_400_000)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

function ago(iso: string): string {
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}
