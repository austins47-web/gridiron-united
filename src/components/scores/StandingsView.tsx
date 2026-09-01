import { useState } from 'react'
import clsx from 'clsx'
import { Trophy, Crown } from 'lucide-react'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useFeedCut, FeedCutOverlay } from '@/components/ui/FeedCut'
import { TeamPage } from '@/components/teams/TeamPage'
import {
  useNflStandings, useCfbStandings, useNflBracket, useCfbBracket, useCfbRankings,
  type StandingsGroup, type BracketGame, type StandingsTeam, type RankedTeam,
} from '@/hooks/useTeamStandings'

type League = 'nfl' | 'cfb'
type SubTab = 'standings' | 'playoffs' | 'rankings'

export function StandingsView() {
  const [league, setLeague] = useState<League>('nfl')
  const [sub, setSub] = useState<SubTab>('standings')
  const [teamPage, setTeamPage] = useState<{ id: string; league: League } | null>(null)
  const { containerRef: leagueTabRef, indicatorStyle: leagueIndicator } = useSlidingIndicator(league)
  const { containerRef: subTabRef, indicatorStyle: subIndicator } = useSlidingIndicator(sub)
  const { cutting: feedCutting, trigger: triggerFeedCut } = useFeedCut()

  const nflStandings = useNflStandings()
  const cfbStandings = useCfbStandings()
  const nflBracket = useNflBracket()
  const cfbBracket = useCfbBracket()
  const cfbRankings = useCfbRankings()

  const standingsQuery = league === 'nfl' ? nflStandings : cfbStandings
  const bracketQuery = league === 'nfl' ? nflBracket : cfbBracket

  // Rankings only exist for CFB (no NFL "top 25" concept) — bounce
  // back to standings if somehow left on this tab while switching
  // to NFL, rather than show an empty/nonsensical rankings pane.
  const effectiveSub: SubTab = (sub === 'rankings' && league === 'nfl') ? 'standings' : sub

  function handleTeamClick(teamId: string, teamLeague: League) {
    if (!teamId) return
    setTeamPage({ id: teamId, league: teamLeague })
  }

  if (teamPage) {
    return (
      <TeamPage
        teamId={teamPage.id}
        league={teamPage.league === 'nfl' ? 'NFL' : 'CFB'}
        onBack={() => setTeamPage(null)}
      />
    )
  }

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

        {/* Standings/Rankings/Playoffs sub-toggle */}
        <div ref={subTabRef} className="relative flex gap-1 p-1 bg-field-900 rounded-xl border border-field-800 w-fit">
          <div className="absolute top-1 bottom-1 bg-field-700 rounded-lg z-0" style={subIndicator} />
          {(league === 'nfl' ? (['standings', 'playoffs'] as const) : (['standings', 'rankings', 'playoffs'] as const)).map(s => (
            <button
              key={s}
              data-tab-key={s}
              onClick={() => setSub(s)}
              className={clsx(
                'relative z-10 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors uppercase tracking-wide',
                effectiveSub === s ? 'text-white' : 'text-field-500 hover:text-field-300',
              )}
            >
              {s === 'standings' ? 'Standings' : s === 'rankings' ? 'Rankings' : 'Playoffs'}
            </button>
          ))}
        </div>
      </div>

      {effectiveSub === 'standings' ? (
        <StandingsList query={standingsQuery} league={league} onTeamClick={handleTeamClick} />
      ) : effectiveSub === 'rankings' ? (
        <RankingsList query={cfbRankings} onTeamClick={handleTeamClick} />
      ) : (
        <BracketView query={bracketQuery} league={league} onTeamClick={handleTeamClick} />
      )}
    </div>
  )
}

function StandingsList({ query, league, onTeamClick }: {
  query: ReturnType<typeof useNflStandings>
  league: League
  onTeamClick: (teamId: string, league: League) => void
}) {
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
                {g.teams.map((t: StandingsTeam) => (
                  <tr
                    key={t.abbr}
                    onClick={() => onTeamClick(t.teamId, league)}
                    className="border-t border-field-700/50 cursor-pointer hover:bg-field-700/40 transition-colors"
                  >
                    <td className="px-3 py-1.5 flex items-center gap-2">
                      {/* AP Top 25 rank, CFB only, when this team is ranked */}
                      {t.rank && (
                        <span className="font-cond font-black text-[11px] text-gold w-4 text-right shrink-0">{t.rank}</span>
                      )}
                      {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}
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

function RankingsList({ query, onTeamClick }: {
  query: ReturnType<typeof useCfbRankings>
  onTeamClick: (teamId: string, league: League) => void
}) {
  const { data: ranks, isLoading, error } = query

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-field-800 border border-field-700 rounded-lg h-11 animate-pulse" />
        ))}
      </div>
    )
  }
  if (error) {
    return <p className="text-red-400 text-sm text-center py-8">Could not load rankings. Try refreshing.</p>
  }
  if (!ranks || ranks.length === 0) {
    return <p className="text-field-400 text-sm text-center py-8">No AP Top 25 available right now.</p>
  }

  return (
    <div className="bg-field-800 border border-field-700 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-field-700 bg-field-900/60">
        <span className="font-cond font-bold text-xs uppercase tracking-wider text-gold">AP Top 25</span>
      </div>
      <div className="divide-y divide-field-700/50">
        {ranks.map((r: RankedTeam) => (
          <div
            key={r.teamId}
            onClick={() => onTeamClick(r.teamId, 'cfb')}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-field-700/40 transition-colors"
          >
            <span className="font-cond font-black text-base text-gold w-6 text-right shrink-0">{r.rank}</span>
            {r.logo && <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" />}
            <span className="text-white font-bold flex-1 min-w-0 truncate">{r.name}</span>
            {r.record && <span className="text-field-400 text-xs shrink-0">{r.record}</span>}
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

// A genuine columnar bracket — rounds as side-by-side columns,
// horizontally scrollable, games vertically centered within each
// column via flexbox so later (smaller) rounds visually nest
// between their earlier pairs.
//
// Deliberately does NOT draw explicit connector lines between
// specific games. The NFL re-seeds every playoff round (best
// remaining record always plays the worst), so which Wild Card
// winner advances to which Divisional slot genuinely isn't
// determined until that round actually happens — ESPN's own data
// doesn't fix that mapping in advance. Drawing a precise line from
// one box to another would claim a certainty that doesn't exist
// yet. The column layout itself — round-by-round, left to right,
// toward a single champion — is the real, honest bracket shape.
function BracketView({ query, league, onTeamClick }: {
  query: ReturnType<typeof useNflBracket>
  league: League
  onTeamClick: (teamId: string, league: League) => void
}) {
  const { data: rounds, isLoading, error } = query

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-64 w-48 shrink-0 animate-pulse" />
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

  const activeRounds = order.filter(r => (rounds[r]?.length ?? 0) > 0)
  const firstRoundCount = rounds[activeRounds[0]]?.length ?? 1
  // Card height (88px) + gap (10px) per game, so every column spans
  // the same total height as the fullest round — the anchor every
  // other column's justify-around centers against.
  const columnHeight = firstRoundCount * 98

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: activeRounds.length * 200 }}>
        {activeRounds.map(roundName => (
          <div key={roundName} className="flex flex-col shrink-0" style={{ width: 190 }}>
            <h3 className="font-cond font-bold text-xs uppercase tracking-wider text-gold mb-2 text-center">
              {roundName}
            </h3>
            <div className="flex flex-col justify-around flex-1" style={{ height: columnHeight }}>
              {rounds[roundName].map(g => (
                <BracketGameCard key={g.id} game={g} league={league} onTeamClick={onTeamClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketGameCard({ game, league, onTeamClick }: {
  game: BracketGame
  league: League
  onTeamClick: (teamId: string, league: League) => void
}) {
  return (
    <div className={clsx(
      'flex items-center justify-between gap-2 bg-field-800 border rounded-xl px-2.5 py-2',
      game.isTbd ? 'border-field-700/50 opacity-60' : 'border-field-700',
    )}>
      <div className="flex-1 min-w-0 space-y-1">
        <TeamRow team={game.away} league={league} onTeamClick={onTeamClick} />
        <TeamRow team={game.home} league={league} onTeamClick={onTeamClick} />
      </div>
      {game.status === 'post' && (
        <Crown className="w-3.5 h-3.5 text-gold shrink-0" />
      )}
    </div>
  )
}

function TeamRow({ team, league, onTeamClick }: {
  team: BracketGame['away']
  league: League
  onTeamClick: (teamId: string, league: League) => void
}) {
  const clickable = team && team.abbr !== 'TBD' && team.teamId
  return (
    <div
      onClick={clickable ? () => onTeamClick(team!.teamId, league) : undefined}
      className={clsx('flex items-center gap-1.5', clickable && 'cursor-pointer hover:opacity-70 transition-opacity')}
    >
      {team?.logo && <img src={team.logo} alt="" className="w-4 h-4 object-contain shrink-0" />}
      <span className={clsx('text-xs font-bold truncate', team?.abbr === 'TBD' ? 'text-field-500' : 'text-white')}>
        {team?.abbr ?? 'TBD'}
      </span>
      {team?.score && <span className="text-[11px] text-field-400 ml-auto shrink-0">{team.score}</span>}
    </div>
  )
}
