import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { useHomeData, type ActionItem, type TeamRow } from '@/hooks/useHome'
import { useMyLeagues } from '@/hooks/useLeague'
import {
  Zap, Trophy, ChevronRight, Clock, ArrowLeftRight, Target,
  UserPlus, Users, Plus, LogIn, CheckCircle2, Flame,
} from 'lucide-react'
import clsx from 'clsx'

const KIND_ICON: Record<string, React.ReactNode> = {
  on_the_clock:    <Flame className="w-4 h-4" />,
  draft_live:      <Clock className="w-4 h-4" />,
  draft_soon:      <Clock className="w-4 h-4" />,
  trade_offer:     <ArrowLeftRight className="w-4 h-4" />,
  picks_due:       <Target className="w-4 h-4" />,
  lineup_empty:    <Users className="w-4 h-4" />,
  league_not_full: <UserPlus className="w-4 h-4" />,
  no_team_name:    <Trophy className="w-4 h-4" />,
}

export function HomeView() {
  const navigate = useNavigate()
  const { profile } = useAppStore()
  const { teams, actions, isLoading, hasLeagues } = useHomeData()

  const firstName = (profile?.display_name || profile?.username || '').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="h-8 w-56 rounded bg-field-800 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-field-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!hasLeagues) return <EmptyHome />

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="font-cond font-black text-2xl text-white uppercase tracking-wider">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-field-400 text-sm mt-0.5">
          {actions.length > 0
            ? `${actions.length} thing${actions.length === 1 ? '' : 's'} need your attention`
            : "You're all caught up"}
        </p>
      </div>

      {/* Needs Attention */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-gold" />
          <h2 className="font-cond font-bold text-sm uppercase tracking-wider text-white">
            Needs Attention
          </h2>
        </div>

        {actions.length === 0 ? (
          <div className="panel flex items-center gap-3 py-4">
            <CheckCircle2 className="w-5 h-5 text-gold shrink-0" />
            <div>
              <p className="text-white font-bold text-sm">Nothing to do right now</p>
              <p className="text-field-400 text-xs mt-0.5">
                Drafts, trades, and pick deadlines will show up here as they come up.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.slice(0, 6).map(a => (
              <ActionCard key={a.id} action={a} onGo={() => navigate(a.to)} />
            ))}
          </div>
        )}
      </section>

      {/* My Teams */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <h2 className="font-cond font-bold text-sm uppercase tracking-wider text-white">
              My Teams
            </h2>
            <span className="text-field-500 text-xs">({teams.length})</span>
          </div>
          <button
            onClick={() => navigate('/app/leagues')}
            className="text-xs font-bold text-field-400 hover:text-gold transition-colors flex items-center gap-1"
          >
            All leagues <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {teams.map(t => <TeamCard key={t.leagueId} team={t} />)}
        </div>
      </section>
    </div>
  )
}

function ActionCard({ action, onGo }: { action: ActionItem; onGo: () => void }) {
  const { setActiveLeague } = useAppStore()
  const { data: myLeagues = [] } = useMyLeagues()
  const urgent = action.priority === 0

  const handleClick = () => {
    const entry = myLeagues.find(l => l.league.id === action.leagueId)
    if (entry) {
      const { league, ...membership } = entry
      setActiveLeague(league, membership as any)
    }
    onGo()
  }

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all group',
        urgent
          ? 'border-gold bg-gold/10 hover:bg-gold/15'
          : 'border-field-700 bg-field-800 hover:border-field-500',
      )}
    >
      <div className={clsx(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        urgent ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
      )}>
        {KIND_ICON[action.kind] ?? <Zap className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className={clsx('font-bold text-sm truncate', urgent ? 'text-gold' : 'text-white')}>
          {action.title}
        </div>
        <div className="text-xs text-field-400 truncate">
          {action.leagueName} · {action.detail}
        </div>
      </div>

      <span className={clsx(
        'shrink-0 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors',
        urgent
          ? 'bg-gold text-field-950'
          : 'bg-field-700 text-field-300 group-hover:text-white',
      )}>
        {action.cta}
      </span>
    </button>
  )
}

function TeamCard({ team }: { team: TeamRow }) {
  const navigate = useNavigate()
  const { setActiveLeague, activeLeagueId } = useAppStore()
  const { data: myLeagues = [] } = useMyLeagues()

  const isPickem = team.leagueType === 'pickem'
  const isActive = activeLeagueId === team.leagueId
  const preDraft = team.draftStatus === 'pre_draft'

  const open = () => {
    const entry = myLeagues.find(l => l.league.id === team.leagueId)
    if (entry) {
      const { league, ...membership } = entry
      setActiveLeague(league, membership as any)
    }
    navigate(isPickem ? '/app/pickem' : '/app/roster')
  }

  return (
    <button
      onClick={open}
      className={clsx(
        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
        isActive
          ? 'border-gold/50 bg-field-800'
          : 'border-field-700 bg-field-800/60 hover:border-field-500',
      )}
    >
      <div className={clsx(
        'w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0',
        isActive ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
      )}>
        {team.leagueName[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-sm truncate">{team.teamName}</span>
          {isPickem && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/20 text-gold shrink-0">
              Pick'Em
            </span>
          )}
        </div>
        <div className="text-xs text-field-400 truncate">{team.leagueName}</div>

        {team.matchup && (
          <div className="text-xs mt-1 flex items-center gap-1.5">
            <span className={clsx(
              'font-bold',
              team.matchup.myScore > team.matchup.oppScore ? 'text-gold' : 'text-field-300'
            )}>
              {team.matchup.myScore.toFixed(1)}
            </span>
            <span className="text-field-600">vs</span>
            <span className="text-field-300 font-bold">{team.matchup.oppScore.toFixed(1)}</span>
            <span className="text-field-500 truncate">— {team.matchup.opponentName}</span>
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        {preDraft ? (
          <>
            <div className="text-white font-bold text-sm">
              {team.memberCount}/{team.numTeams}
            </div>
            <div className="text-field-500 text-[10px] uppercase tracking-wider">members</div>
          </>
        ) : isPickem ? (
          <>
            <div className="text-white font-bold text-sm">{team.wins}</div>
            <div className="text-field-500 text-[10px] uppercase tracking-wider">correct</div>
          </>
        ) : (
          <>
            <div className="text-white font-bold text-sm">
              {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
            </div>
            <div className="text-field-500 text-[10px]">{team.pointsFor.toFixed(1)} pts</div>
          </>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-field-600 shrink-0" />
    </button>
  )
}

function EmptyHome() {
  const navigate = useNavigate()
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-5xl mb-4">🏈</div>
      <h1 className="font-cond font-black text-2xl text-white uppercase tracking-wider mb-2">
        Welcome to Gridiron United
      </h1>
      <p className="text-field-400 text-sm mb-6">
        Create a league or join one with an invite code to get started.
      </p>
      <div className="flex gap-3 justify-center">
        <button className="btn-outline" onClick={() => navigate('/app/leagues')}>
          <LogIn className="w-4 h-4" /> Join a League
        </button>
        <button className="btn-gold" onClick={() => navigate('/app/leagues')}>
          <Plus className="w-4 h-4" /> Create League
        </button>
      </div>
    </div>
  )
}
