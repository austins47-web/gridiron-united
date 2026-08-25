import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { useHomeData, useTickerGames, type ActionItem, type TeamRow } from '@/hooks/useHome'
import { useMyLeagues } from '@/hooks/useLeague'
import {
  Trophy, ChevronRight, Clock, ArrowLeftRight, Target,
  UserPlus, Users, Plus, LogIn, Flame, Zap,
  Radio, Newspaper, FlaskConical, Settings2,
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

  const name = profile?.display_name || profile?.username || ''
  const firstName = name.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  // Aggregate scoreboard figures
  const totalW = teams.reduce((s, t) => s + t.wins, 0)
  const totalL = teams.reduce((s, t) => s + t.losses, 0)
  const commishCount = teams.filter(t => t.isCommissioner).length

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="h-36 rounded-2xl bg-field-800 animate-pulse" />
        <div className="h-11 rounded-xl bg-field-800 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-field-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!hasLeagues) return <EmptyHome />

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

      {/* ══ JUMBOTRON ══ */}
      <div className="jumbotron rise-in">
        <div className="relative p-5 sm:p-6">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="font-cond font-bold text-[12px] uppercase tracking-[0.2em] text-gold">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Greeting */}
          <h1 className="font-cond font-black uppercase text-white leading-[0.95] tracking-tight"
              style={{ fontSize: 'clamp(1.9rem, 6vw, 3rem)' }}>
            {greeting}
            {firstName && <>,<span className="text-gold"> {firstName}</span></>}
          </h1>

          <p className="text-field-300 text-sm mt-1.5">
            {actions.length > 0
              ? <>You have <span className="text-white font-bold">{actions.length}</span> {actions.length === 1 ? 'thing' : 'things'} to handle.</>
              : <>Everything's handled. Nothing needs you right now.</>}
          </p>

          {/* Scoreboard readouts */}
          <div className="grid grid-cols-3 gap-px mt-5 bg-field-700/70 rounded-xl overflow-hidden">
            {[
              { label: 'Leagues',   value: String(teams.length) },
              { label: 'Record',    value: `${totalW}-${totalL}` },
              { label: commishCount === 1 ? 'Commish Of' : 'Commish Of', value: String(commishCount) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-field-900/80 px-3 py-3 text-center">
                <div className="readout-value">{value}</div>
                <div className="readout-label mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ TICKER ══ */}
      <ScoreTicker />

      {/* ══ QUICK ACTIONS ══ */}
      <QuickActions />

      {/* ══ NEEDS ATTENTION ══ */}
      <section>
        <SectionHead
          label="Needs Attention"
          count={actions.length}
          accent={actions.length > 0}
        />

        {actions.length === 0 ? (
          <div className="rounded-xl border border-field-700 bg-field-800/60 px-4 py-5 text-center">
            <p className="font-cond font-bold text-sm uppercase tracking-wider text-field-300">
              All clear
            </p>
            <p className="text-field-500 text-xs mt-1">
              Drafts, trades, and pick deadlines land here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.slice(0, 6).map((a, i) => (
              <ActionCard
                key={a.id}
                action={a}
                index={i}
                onGo={() => navigate(a.to)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ══ MY TEAMS ══ */}
      <section>
        <SectionHead
          label="My Teams"
          count={teams.length}
          action={{ label: 'All leagues', onClick: () => navigate('/app/leagues') }}
        />
        <div className="space-y-2">
          {teams.map((t, i) => <TeamCard key={t.leagueId} team={t} index={i} />)}
        </div>
      </section>

      {/* ══ RECENT ACTIVITY ══ */}
      <RecentActivity />
    </div>
  )
}

// ─── Quick actions — four doors out of the dashboard ─────────
function QuickActions() {
  const navigate = useNavigate()
  const items = [
    { label: 'Scores',  icon: <Radio className="w-4 h-4" />,        to: '/app/scores' },
    { label: 'News',    icon: <Newspaper className="w-4 h-4" />,    to: '/app/news' },
    { label: 'Mock',    icon: <FlaskConical className="w-4 h-4" />, to: '/app/mock' },
    { label: 'Leagues', icon: <Settings2 className="w-4 h-4" />,    to: '/app/leagues' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2 rise-in" style={{ animationDelay: '80ms' }}>
      {items.map(({ label, icon, to }) => (
        <button
          key={label}
          onClick={() => navigate(to)}
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-field-700 bg-field-800/60 text-field-300 hover:border-gold/50 hover:text-gold transition-colors"
        >
          {icon}
          <span className="font-cond font-bold text-[12px] uppercase tracking-[0.14em]">
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Recent activity — from the notification stream ──────────
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function RecentActivity() {
  const { notifications } = useAppStore()
  const recent = (notifications ?? []).slice(0, 5)
  if (recent.length === 0) return null

  return (
    <section>
      <SectionHead label="Recent Activity" />
      <div className="rounded-xl border border-field-700 bg-field-800/60 divide-y divide-field-700/60 overflow-hidden">
        {recent.map(n => (
          <div key={n.id} className="flex items-start gap-3 px-4 py-2.5">
            <div className={clsx(
              'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
              n.is_read ? 'bg-field-600' : 'bg-gold',
            )} />
            <div className="min-w-0 flex-1">
              <div className={clsx(
                'text-sm truncate',
                n.is_read ? 'text-field-300' : 'text-white font-bold',
              )}>
                {n.title}
              </div>
              {n.body && (
                <div className="text-xs text-field-500 truncate">{n.body}</div>
              )}
            </div>
            <span className="text-[12px] text-field-600 shrink-0 mt-0.5 tabular-nums">
              {timeAgo(n.created_at)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section header — hairline rule carries the eye across ────
function SectionHead({
  label, count, accent, action,
}: {
  label: string
  count?: number
  accent?: boolean
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className={clsx(
        'font-cond font-black text-xs uppercase tracking-[0.18em] shrink-0',
        accent ? 'text-gold' : 'text-field-300',
      )}>
        {label}
      </h2>
      {count !== undefined && (
        <span className="font-cond font-bold text-xs text-field-500 tabular-nums shrink-0">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-field-700" />
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 font-cond font-bold text-[13px] uppercase tracking-wider text-field-400 hover:text-gold transition-colors flex items-center gap-0.5"
        >
          {action.label} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Live ticker ─────────────────────────────────────────────
function ScoreTicker() {
  const { data: games = [] } = useTickerGames()
  if (games.length === 0) return null

  const liveCount = games.filter(g => g.status === 'in').length

  return (
    <div className="rounded-xl border border-field-700 bg-field-800/60 overflow-hidden rise-in"
         style={{ animationDelay: '60ms' }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-field-700 bg-field-900/60">
        {liveCount > 0 ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="font-cond font-bold text-[12px] uppercase tracking-[0.18em] text-red-400">
              {liveCount} Live
            </span>
          </>
        ) : (
          <span className="font-cond font-bold text-[12px] uppercase tracking-[0.18em] text-field-400">
            Around the League
          </span>
        )}
      </div>

      <div className="flex overflow-x-auto">
        {games.map(g => {
          const aw = parseInt(g.awayScore) || 0
          const hm = parseInt(g.homeScore) || 0
          return (
            <div key={g.id} className="ticker-cell">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx(
                  'font-cond font-black text-xs',
                  g.status !== 'pre' && aw > hm ? 'text-white' : 'text-field-300',
                )}>{g.away}</span>
                {g.status !== 'pre' && (
                  <span className={clsx(
                    'font-cond font-black text-xs tabular-nums',
                    aw > hm ? 'text-white' : 'text-field-400',
                  )}>{aw}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={clsx(
                  'font-cond font-black text-xs',
                  g.status !== 'pre' && hm > aw ? 'text-white' : 'text-field-300',
                )}>{g.home}</span>
                {g.status !== 'pre' && (
                  <span className={clsx(
                    'font-cond font-black text-xs tabular-nums',
                    hm > aw ? 'text-white' : 'text-field-400',
                  )}>{hm}</span>
                )}
              </div>
              <div className={clsx(
                'text-[11px] mt-0.5 truncate',
                g.status === 'in' ? 'text-red-400 font-bold' : 'text-field-500',
              )}>
                {g.detail}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Action card — broadcast lower-third ─────────────────────
function ActionCard({ action, index, onGo }: { action: ActionItem; index: number; onGo: () => void }) {
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
      style={{ animationDelay: `${100 + index * 45}ms` }}
      className={clsx(
        'lower-third rise-in w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left group',
        urgent && 'is-urgent play-clock',
      )}
    >
      <div className={clsx(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        urgent ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
      )}>
        {KIND_ICON[action.kind] ?? <Zap className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-cond font-bold text-[12px] uppercase tracking-[0.16em] text-field-500 truncate">
          {action.leagueName}
        </div>
        <div className={clsx(
          'font-bold text-sm truncate leading-tight',
          urgent ? 'text-gold' : 'text-white',
        )}>
          {action.title}
        </div>
        <div className="text-xs text-field-400 truncate">{action.detail}</div>
      </div>

      <span className={clsx(
        'shrink-0 font-cond font-bold text-[13px] uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors',
        urgent
          ? 'bg-gold text-field-950'
          : 'bg-field-700 text-field-300 group-hover:bg-gold group-hover:text-field-950',
      )}>
        {action.cta}
      </span>
    </button>
  )
}

// ─── Team card — standings row ───────────────────────────────
function TeamCard({ team, index }: { team: TeamRow; index: number }) {
  const navigate = useNavigate()
  const { setActiveLeague, activeLeagueId } = useAppStore()
  const { data: myLeagues = [] } = useMyLeagues()

  const isPickem = team.leagueType === 'pickem'
  const isActive = activeLeagueId === team.leagueId
  const preDraft = team.draftStatus === 'pre_draft'
  const winning = team.matchup && team.matchup.myScore > team.matchup.oppScore

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
      style={{ animationDelay: `${140 + index * 40}ms` }}
      className={clsx(
        'lower-third rise-in w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left',
        isActive && 'border-gold/40',
      )}
    >
      <div className={clsx(
        'w-10 h-10 rounded-lg flex items-center justify-center font-cond font-black text-lg shrink-0',
        isActive ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
      )}>
        {team.leagueName[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-cond font-bold text-[12px] uppercase tracking-[0.16em] text-field-500 truncate flex items-center gap-1.5">
          {team.leagueName}
          {isPickem && <span className="text-gold">· Pick'Em</span>}
          {team.isCommissioner && <span className="text-field-400">· Commish</span>}
        </div>
        <div className="font-bold text-white text-sm truncate leading-tight">
          {team.teamName}
        </div>

        {team.matchup ? (
          <div className="text-xs mt-0.5 flex items-center gap-1.5">
            <span className={clsx('font-cond font-black tabular-nums', winning ? 'text-gold' : 'text-field-300')}>
              {team.matchup.myScore.toFixed(1)}
            </span>
            <span className="text-field-600 text-[12px]">VS</span>
            <span className="font-cond font-black tabular-nums text-field-300">
              {team.matchup.oppScore.toFixed(1)}
            </span>
            <span className="text-field-500 truncate">{team.matchup.opponentName}</span>
          </div>
        ) : (
          <div className="text-xs text-field-500 mt-0.5">
            {isPickem ? 'Picks open' : preDraft ? 'Waiting to draft' : 'No matchup this week'}
          </div>
        )}
      </div>

      <div className="text-right shrink-0 pr-1">
        {isPickem ? (
          <>
            <div className="font-cond font-black text-lg text-white tabular-nums leading-none">
              {team.wins}
            </div>
            <div className="readout-label mt-1">Correct</div>
          </>
        ) : preDraft ? (
          <>
            <div className="font-cond font-black text-lg text-white tabular-nums leading-none">
              {team.memberCount}<span className="text-field-500">/{team.numTeams}</span>
            </div>
            <div className="readout-label mt-1">Members</div>
          </>
        ) : false ? (
          <>
            <div className="font-cond font-black text-lg text-white tabular-nums leading-none">
              {team.wins}
            </div>
            <div className="readout-label mt-1">Correct</div>
          </>
        ) : (
          <>
            <div className="font-cond font-black text-lg text-white tabular-nums leading-none">
              {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
            </div>
            <div className="readout-label mt-1">{team.pointsFor.toFixed(0)} PF</div>
          </>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-field-600 shrink-0" />
    </button>
  )
}

// ─── Empty state ─────────────────────────────────────────────
function EmptyHome() {
  const navigate = useNavigate()
  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="jumbotron">
        <div className="relative p-8 text-center">
          <div className="font-cond font-bold text-[12px] uppercase tracking-[0.2em] text-gold mb-2">
            Gridiron United
          </div>
          <h1 className="font-cond font-black uppercase text-white leading-[0.95] tracking-tight mb-3"
              style={{ fontSize: 'clamp(1.8rem, 6vw, 2.6rem)' }}>
            No leagues yet
          </h1>
          <p className="text-field-300 text-sm mb-6 max-w-xs mx-auto">
            Start a league of your own, or drop in an invite code to join one.
          </p>
          <div className="flex gap-3 justify-center">
            <button className="btn-outline" onClick={() => navigate('/app/leagues')}>
              <LogIn className="w-4 h-4" /> Join a league
            </button>
            <button className="btn-gold" onClick={() => navigate('/app/leagues')}>
              <Plus className="w-4 h-4" /> Create league
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
