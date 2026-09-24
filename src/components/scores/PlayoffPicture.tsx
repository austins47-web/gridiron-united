import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Trophy } from 'lucide-react'
import type { useNflPlayoffPicture, PictureTeam } from '@/hooks/useTeamStandings'

// ══════════════════════════════════════════════════════════════
// NFL playoff picture — the seven seeds per conference if the season
// ended today (ESPN's seeds, NFL tiebreakers applied), the teams
// chasing the last spot, clinch/elimination marks as they come, and
// the Wild Card games those seeds would produce.
// ══════════════════════════════════════════════════════════════

const CLINCH: Record<string, { label: string; tone: string }> = {
  '*': { label: 'Home field', tone: 'bg-gold text-field-950' },
  z: { label: 'Bye', tone: 'bg-gold text-field-950' },
  y: { label: 'Division', tone: 'bg-emerald-500/20 text-emerald-300' },
  x: { label: 'Clinched', tone: 'bg-emerald-500/20 text-emerald-300' },
  e: { label: 'Out', tone: 'bg-field-700 text-field-400' },
}

export function PlayoffPicture({ query, onTeamClick }: {
  query: ReturnType<typeof useNflPlayoffPicture>
  onTeamClick: (teamId: string) => void
}) {
  const { data, isLoading, error } = query

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        {[0, 1].map(i => <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-[560px] animate-pulse" />)}
      </div>
    )
  }
  if (error || !data) {
    return <p className="text-red-400 text-sm text-center py-8">Could not load the playoff picture. Try refreshing.</p>
  }
  if (!data.gamesPlayed) {
    return (
      <div className="bg-field-800 border border-field-700 rounded-xl px-5 py-10 text-center">
        <Trophy className="w-8 h-8 text-field-600 mx-auto mb-3" />
        <p className="text-white font-bold mb-1">No games played yet</p>
        <p className="text-field-400 text-sm">The playoff picture takes shape once the regular season kicks off.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-field-400">
        <span className="font-cond font-bold uppercase tracking-[0.18em] text-gold">If the season ended today</span>
        <span>Seeds 1–4 win their division · 5–7 are wild cards · only the 1 seed gets a bye</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.conferences.map(c => (
          <Conference key={c.name} name={c.name} teams={c.teams} onTeamClick={onTeamClick} />
        ))}
      </div>
    </div>
  )
}

function Conference({ name, teams, onTeamClick }: {
  name: 'AFC' | 'NFC'; teams: PictureTeam[]; onTeamClick: (teamId: string) => void
}) {
  const leaders = teams.filter(t => t.seed <= 4)
  const wildCards = teams.filter(t => t.seed >= 5 && t.seed <= 7)
  const chasing = teams.filter(t => t.seed > 7)
  const bySeed = (s: number) => teams.find(t => t.seed === s)
  const matchups = ([[2, 7], [3, 6], [4, 5]] as const)
    .map(([h, a]) => ({ home: bySeed(h), away: bySeed(a) }))
    .filter((m): m is { home: PictureTeam; away: PictureTeam } => !!m.home && !!m.away)

  return (
    <div className="bg-field-800 border border-field-700 rounded-xl overflow-hidden">
      <div className={clsx(
        'px-3 py-2 border-b border-field-700 flex items-center justify-between',
        name === 'AFC' ? 'bg-gradient-to-r from-red-600/25 to-transparent' : 'bg-gradient-to-r from-blue-600/25 to-transparent',
      )}>
        <span className={clsx('font-cond font-black text-lg tracking-wider', name === 'AFC' ? 'text-red-300' : 'text-blue-300')}>{name}</span>
        <span className="font-cond font-bold text-[10px] uppercase tracking-[0.18em] text-field-400">Playoff Picture</span>
      </div>

      <Group label="Division leaders">
        {leaders.map(t => <SeedRow key={t.teamId} t={t} onClick={onTeamClick} />)}
      </Group>
      <Group label="Wild cards">
        {wildCards.map(t => <SeedRow key={t.teamId} t={t} onClick={onTeamClick} />)}
      </Group>

      {/* The cut line */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="flex-1 border-t border-dashed border-gold/40" />
        <span className="font-cond font-bold text-[10px] uppercase tracking-[0.18em] text-gold/80">In the hunt</span>
        <span className="flex-1 border-t border-dashed border-gold/40" />
      </div>
      <div className="pb-1">
        {chasing.map(t => <SeedRow key={t.teamId} t={t} onClick={onTeamClick} outside />)}
      </div>

      {/* Wild Card Weekend, as it stands */}
      {matchups.length > 0 && (
        <div className="border-t border-field-700 bg-field-900/50 px-3 py-2.5">
          <div className="font-cond font-bold text-[10px] uppercase tracking-[0.18em] text-field-400 mb-1.5">Wild Card Weekend, as it stands</div>
          <div className="space-y-1">
            {matchups.map(m => (
              <div key={m.home.teamId} className="flex items-center gap-1.5 text-xs">
                <Mini t={m.away} onClick={onTeamClick} />
                <span className="text-field-500 px-0.5">at</span>
                <Mini t={m.home} onClick={onTeamClick} />
              </div>
            ))}
            {bySeed(1) && (
              <div className="flex items-center gap-1.5 text-xs text-field-400">
                <Mini t={bySeed(1)!} onClick={onTeamClick} /> <span>has the bye</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-1.5">
      <div className="px-3 pb-0.5 font-cond font-bold text-[10px] uppercase tracking-[0.18em] text-field-500">{label}</div>
      {children}
    </div>
  )
}

function SeedRow({ t, onClick, outside = false }: { t: PictureTeam; onClick: (teamId: string) => void; outside?: boolean }) {
  const mark = t.clincher ? CLINCH[t.clincher] : null
  const out = t.clincher === 'e'
  return (
    <button
      onClick={() => onClick(t.teamId)}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-field-700/40 transition-colors',
        out && 'opacity-45',
      )}
    >
      <span className={clsx(
        'w-6 h-6 rounded-md flex items-center justify-center font-cond font-black text-[13px] shrink-0 tabular-nums',
        t.seed === 1 ? 'bg-gold text-field-950'
          : t.seed <= 7 ? 'bg-field-700 text-white'
          : 'text-field-500',
      )}>
        {t.seed}
      </span>
      {t.logo && <img src={t.logo} alt="" className="w-6 h-6 object-contain shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className={clsx('font-bold text-sm leading-tight truncate', outside ? 'text-field-200' : 'text-white')}>
          {t.name.split(' ').slice(-1)[0]}
        </div>
        <div className="text-[10px] text-field-500 leading-tight">{t.division}</div>
      </div>
      {mark && (
        <span className={clsx('font-cond font-bold text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 shrink-0', mark.tone)}>
          {mark.label}
        </span>
      )}
      {!mark && t.seed === 1 && (
        <span className="font-cond font-bold text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-gold/15 text-gold">Bye</span>
      )}
      <span className="font-cond font-black text-sm text-white tabular-nums w-11 text-right shrink-0">{t.record}</span>
      <span className="text-[11px] text-field-500 tabular-nums w-9 text-right shrink-0">
        {outside && t.gamesBack != null ? (t.gamesBack <= 0 ? '—' : `${t.gamesBack} GB`) : t.streak || ''}
      </span>
    </button>
  )
}

function Mini({ t, onClick }: { t: PictureTeam; onClick: (teamId: string) => void }) {
  return (
    <button onClick={() => onClick(t.teamId)} className="inline-flex items-center gap-1 hover:text-gold transition-colors">
      <span className="text-field-500 tabular-nums">({t.seed})</span>
      {t.logo && <img src={t.logo} alt="" className="w-4 h-4 object-contain" />}
      <span className="font-bold text-white">{t.abbr}</span>
    </button>
  )
}
