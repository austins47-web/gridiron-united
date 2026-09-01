import { useState } from 'react'
import clsx from 'clsx'
import { Trophy, Crown } from 'lucide-react'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useFeedCut, FeedCutOverlay } from '@/components/ui/FeedCut'
import {
  useNflStandings, useCfbStandings, useNflBracket, useCfbBracket,
  type StandingsGroup, type BracketGame,
} from '@/hooks/useTeamStandings'

type League = 'nfl' | 'cfb'
type SubTab = 'standings' | 'playoffs'

export function StandingsView() {
  const [league, setLeague] = useState<League>('nfl')
  const [sub, setSub] = useState<SubTab>('standings')
  const { containerRef: leagueTabRef, indicatorStyle: leagueIndicator } = useSlidingIndicator(league)
  const { containerRef: subTabRef, indicatorStyle: subIndicator } = useSlidingIndicator(sub)
  const { cutting: feedCutting, trigger: triggerFeedCut } = useFeedCut()

  const nflStandings = useNflStandings()
  const cfbStandings = useCfbStandings()
  const nflBracket = useNflBracket()
  const cfbBracket = useCfbBracket()

  const standingsQuery = league === 'nfl' ? nflStandings : cfbStandings
  const bracketQuery = league === 'nfl' ? nflBracket : cfbBracket

  return (
    <div className="relative space-y-4 max-w-3xl mx-auto">
      <FeedCutOverlay active={feedCutting} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* League toggle */}
        <div ref={leagueTabRef} className="relative flex gap-1 p-1 bg-field-900 rounded-xl border border-field-800 w-fit">
          <div className="absolute top-1 bottom-1 bg-gold rounded-lg z-0" style={leagueIndicator} />
          {(['nfl', 'cfb'] as const).map(l => (
            <button
              key={l}
              data-tab-key={l}
              onClick={() => { if (l !== league) triggerFeedCut(); setLeague(l) }}
              className={clsx(
                'relative z-10 px-5 py-1.5 rounded-lg text-sm font-bold transition-colors uppercase tracking-wide',
                league === l ? 'text-field-950' : 'text-field-400 hover:text-white',
              )}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Standings/Playoffs sub-toggle */}
        <div ref={subTabRef} className="relative flex gap-1 p-1 bg-field-900 rounded-xl border border-field-800 w-fit">
          <div className="absolute top-1 bottom-1 bg-field-700 rounded-lg z-0" style={subIndicator} />
          {(['standings', 'playoffs'] as const).map(s => (
            <button
              key={s}
              data-tab-key={s}
              onClick={() => setSub(s)}
              className={clsx(
                'relative z-10 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors uppercase tracking-wide',
                sub === s ? 'text-white' : 'text-field-500 hover:text-field-300',
              )}
            >
              {s === 'standings' ? 'Standings' : 'Playoffs'}
            </button>
          ))}
        </div>
      </div>

      {sub === 'standings' ? (
        <StandingsList query={standingsQuery} />
      ) : (
        <BracketView query={bracketQuery} league={league} />
      )}
    </div>
  )
}

function StandingsList({ query }: { query: ReturnType<typeof useNflStandings> }) {
  const { data, isLoading, error } = query
  const groups = data?.groups
  const isPreseason = data?.isPreseason ?? false

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-40 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error) {
    return <p className="text-red-400 text-sm text-center py-8">Could not load standings. Try refreshing.</p>
  }
  if (!groups || groups.length === 0) {
    return <p className="text-field-400 text-sm text-center py-8">No standings available right now.</p>
  }

  return (
    <div className="space-y-3">
      {/* Only ever shown for NFL before the regular season has
          actually started playing games — automatically stops
          appearing the moment a real regular-season result exists
          anywhere in the league, see useNflStandings. */}
      {isPreseason && (
        <div className="flex items-center gap-2 text-xs bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 w-fit">
          <span className="font-cond font-bold uppercase tracking-wider text-gold">Preseason</span>
          <span className="text-field-400">Regular season standings will appear once games are played.</span>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
      {groups.map((g: StandingsGroup) => (
        <div key={g.name} className="bg-field-800 border border-field-700 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-field-700 bg-field-900/60">
            <span className="font-cond font-bold text-xs uppercase tracking-wider text-gold">{g.name}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-field-500 uppercase tracking-wider">
                <th className="text-left font-bold px-3 py-1.5">Team</th>
                <th className="text-right font-bold px-2 py-1.5">W</th>
                <th className="text-right font-bold px-2 py-1.5">L</th>
                <th className="text-right font-bold px-2 py-1.5">T</th>
                <th className="text-right font-bold px-3 py-1.5">Strk</th>
              </tr>
            </thead>
            <tbody>
              {g.teams.map(t => (
                <tr key={t.abbr} className="border-t border-field-700/50">
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-white font-bold truncate">{t.abbr}</span>
                  </td>
                  <td className="text-right px-2 py-1.5 text-field-300">{t.wins}</td>
                  <td className="text-right px-2 py-1.5 text-field-300">{t.losses}</td>
                  <td className="text-right px-2 py-1.5 text-field-300">{t.ties}</td>
                  <td className="text-right px-3 py-1.5 text-field-400 text-xs">{t.streak || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      </div>
    </div>
  )
}

const ROUND_ORDER: Record<League, string[]> = {
  nfl: ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'],
  cfb: ['First Round', 'Quarterfinal', 'Semifinal', 'National Championship'],
}

function BracketView({ query, league }: {
  query: ReturnType<typeof useNflBracket>
  league: League
}) {
  const { data: rounds, isLoading, error } = query

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-24 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error) {
    return <p className="text-red-400 text-sm text-center py-8">Could not load the bracket. Try refreshing.</p>
  }

  const order = ROUND_ORDER[league]
  const hasAnyGames = order.some(r => (rounds?.[r]?.length ?? 0) > 0)

  if (!rounds || !hasAnyGames) {
    return (
      <div className="bg-field-800 border border-field-700 rounded-xl px-5 py-10 text-center">
        <Trophy className="w-8 h-8 text-field-600 mx-auto mb-3" />
        <p className="text-white font-bold mb-1">Bracket not set yet</p>
        <p className="text-field-400 text-sm">
          {league === 'nfl' ? 'Seeds are determined at the end of the regular season.' : 'The CFP field is announced in early December.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {order.map(roundName => {
        const games = rounds[roundName] ?? []
        if (games.length === 0) return null
        return (
          <div key={roundName}>
            <h3 className="font-cond font-bold text-xs uppercase tracking-wider text-gold mb-2">{roundName}</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {games.map(g => <BracketGameCard key={g.id} game={g} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BracketGameCard({ game }: { game: BracketGame }) {
  return (
    <div className={clsx(
      'flex items-center justify-between gap-3 bg-field-800 border rounded-xl px-3 py-2.5',
      game.isTbd ? 'border-field-700/50 opacity-60' : 'border-field-700',
    )}>
      <div className="flex-1 min-w-0 space-y-1">
        <TeamRow team={game.away} />
        <TeamRow team={game.home} />
      </div>
      {game.status === 'post' && (
        <Crown className="w-4 h-4 text-gold shrink-0" />
      )}
    </div>
  )
}

function TeamRow({ team }: { team: BracketGame['away'] }) {
  return (
    <div className="flex items-center gap-2">
      {team?.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}
      <span className={clsx('text-sm font-bold truncate', team?.abbr === 'TBD' ? 'text-field-500' : 'text-white')}>
        {team?.abbr ?? 'TBD'}
      </span>
      {team?.score && <span className="text-xs text-field-400 ml-auto">{team.score}</span>}
    </div>
  )
}
