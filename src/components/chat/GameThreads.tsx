import { ArrowLeft, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { isFinal, isVoid, isLive, winnerOf, homeWinChance, gameClockLabel, type Game } from '@/components/pickem/standings'

const kickoffLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'TBD'

function statusOf(g: Game): { label: string; live: boolean } {
  if (isVoid(g)) return { label: 'Postponed', live: false }
  if (isFinal(g)) return { label: 'Final', live: false }
  if (isLive(g)) return { label: gameClockLabel(g), live: true }
  return { label: kickoffLabel(g.game_date), live: false }
}

// Live games first, then what's next, then the finished ones
function threadOrder(games: Game[]): Game[] {
  const rank = (g: Game) => (isLive(g) ? 0 : isFinal(g) || isVoid(g) ? 2 : 1)
  return [...games].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 2
      ? new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
      : new Date(a.game_date).getTime() - new Date(b.game_date).getTime()))
}

/**
 * This week's game threads, above the main chat: each game's score and
 * how much talk it has. Tap one to open its thread.
 */
export function GameThreadStrip({ games, counts, onOpen }: {
  games: Game[]
  counts: Map<string, number>
  onOpen: (gameId: string) => void
}) {
  if (games.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-field-700 shrink-0 [scrollbar-width:none]">
      {threadOrder(games).map(g => {
        const s = statusOf(g)
        const n = counts.get(g.id) ?? 0
        const started = s.live || isFinal(g)
        // Only a final greys out the loser — mid-game it's just trailing
        const w = isFinal(g) ? winnerOf(g) : null
        return (
          <button
            key={g.id}
            onClick={() => onOpen(g.id)}
            className={clsx(
              'shrink-0 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors',
              s.live ? 'border-gold/50 bg-gold/[0.08] hover:bg-gold/15' : 'border-field-700 bg-field-800 hover:border-field-500',
            )}
          >
            <div className="flex flex-col leading-tight">
              {[g.away_team, g.home_team].map((t, i) => (
                <span key={t} className={clsx('flex items-center gap-1 font-cond font-black text-[12px]', w && w !== t ? 'text-field-500' : 'text-white')}>
                  {t}
                  {started && <span className="tabular-nums">{(i === 0 ? g.away_score : g.home_score) ?? 0}</span>}
                </span>
              ))}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className={clsx('text-[10px] font-bold whitespace-nowrap', s.live ? 'text-gold' : 'text-field-400')}>
                {s.live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle animate-pulse" />}
                {s.label}
              </span>
              <span className={clsx('flex items-center gap-0.5 text-[10px] font-bold', n > 0 ? 'text-field-200' : 'text-field-600')}>
                <MessageSquare className="w-3 h-3" /> {n}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A game thread's header: back to the main chat, the live score, the
 * win chance, and — once it's kicked off — how the league picked it.
 */
export function GameThreadHeader({ game, picks, myId, onBack }: {
  game: Game | null
  picks: { user_id: string; picked_team: string }[]
  myId?: string
  onBack: () => void
}) {
  const s = game ? statusOf(game) : null
  const started = !!game && (isLive(game) || isFinal(game))
  const kickedOff = !!game && (started || new Date(game.game_date).getTime() <= Date.now())
  const w = game && isFinal(game) ? winnerOf(game) : null
  const home = game ? homeWinChance(game) : 0.5
  const favorite = game && !isFinal(game) && !isVoid(game)
    ? (home >= 0.5 ? { team: game.home_team, pct: home } : { team: game.away_team, pct: 1 - home })
    : null
  const mine = picks.find(p => p.user_id === myId)?.picked_team

  const side = (team: string, score: number | null, align: 'left' | 'right') => {
    const logo = teamLogoUrl({ abbr: team }, 'NFL')
    return (
      <div className={clsx('flex items-center gap-2 min-w-0', align === 'right' && 'flex-row-reverse')}>
        {logo && <img src={logo} alt="" className="w-8 h-8 object-contain shrink-0" />}
        <span className={clsx('font-cond font-black text-lg', w && w !== team ? 'text-field-500' : 'text-white')}>{team}</span>
        {started && (
          <span className={clsx('font-cond font-black text-2xl tabular-nums', w && w !== team ? 'text-field-500' : 'text-white')}>
            {score ?? 0}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="border-b border-field-700 shrink-0 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back to the league chat" className="p-1.5 -ml-1 rounded-lg text-field-300 hover:text-white hover:bg-field-800">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {game ? (
          <div className="flex-1 min-w-0 flex items-center justify-center gap-3">
            {side(game.away_team, game.away_score, 'left')}
            <span className="text-field-600 text-xs">@</span>
            {side(game.home_team, game.home_score, 'right')}
          </div>
        ) : (
          <div className="flex-1 h-8 rounded-lg bg-field-800 animate-pulse" />
        )}
        <span className="w-7" />
      </div>
      {game && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px]">
          <span className={clsx('font-bold', s?.live ? 'text-gold' : 'text-field-400')}>
            {s?.live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle animate-pulse" />}
            {s?.label}
          </span>
          {favorite && (
            <span className="text-field-400">· {favorite.team} <span className="font-bold text-white">{Math.round(favorite.pct * 100)}%</span> to win</span>
          )}
          {kickedOff && picks.length > 0 && (
            <span className="text-field-400">
              · League: {[game.away_team, game.home_team].map(t => `${picks.filter(p => p.picked_team === t).length} ${t}`).join(', ')}
              {mine && <> · You: <span className="font-bold text-gold">{mine}</span></>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
