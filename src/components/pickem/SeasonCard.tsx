import type { ReactNode } from 'react'
import { X, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { teamLogoUrl } from '@/components/teams/teamIds'
import type { SeasonProfile, TeamRecord } from './season'

/**
 * One player's Pick'Em season, opened from a Standings row (or "Your
 * season"). Record and rank match the Standings table; the pick-level
 * facts (underdog picks, boldest call, teams) count final games only.
 */
export function SeasonCard({ profile, totalPlayers, isYou, onClose }: {
  profile: SeasonProfile
  totalPlayers: number
  isYou: boolean
  onClose: () => void
}) {
  const s = profile.standing
  const losses = Math.max(0, s.played - s.correct)
  const u = profile.underdog
  const call = profile.boldestCall

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-lg !p-0" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-field-700">
          <div className="w-12 h-12 rounded-xl bg-field-700 flex items-center justify-center text-lg font-bold text-gold overflow-hidden shrink-0">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              : profile.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-cond font-bold text-[11px] uppercase tracking-[0.18em] text-gold">
              {isYou ? 'Your season' : 'Season'}
            </p>
            <p className="font-cond font-black text-2xl text-white uppercase leading-tight truncate">{profile.name}</p>
            <p className="text-xs text-field-400">
              #{profile.rank} of {totalPlayers} · <span className="font-bold text-white">{s.correct}–{losses}</span>
              {s.played > 0 && <> · {Math.round(s.pct * 100)}%</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-field-400 hover:text-white p-1 self-start">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Headline numbers */}
          <div className="stat-grid grid-cols-3">
            <Tile value={s.weeksWon} label="Weeks won" />
            <Tile value={profile.bestStreak} label="Best streak" />
            <Tile
              value={profile.bestWeek ? `${profile.bestWeek.correct}/${profile.bestWeek.played}` : '—'}
              label={profile.bestWeek ? `Best · Wk ${profile.bestWeek.week}` : 'Best week'}
            />
            <Tile
              value={u.wins + u.losses > 0 ? `${u.wins}–${u.losses}` : '—'}
              label="Underdog picks"
            />
            <Tile
              value={profile.tiebreaker ? profile.tiebreaker.avg.toFixed(1) : '—'}
              label={profile.tiebreaker?.exact ? `TB avg · ${profile.tiebreaker.exact} exact` : 'TB avg miss'}
            />
            <Tile
              value={profile.toughestWeek ? `${profile.toughestWeek.correct}/${profile.toughestWeek.played}` : '—'}
              label={profile.toughestWeek ? `Toughest · Wk ${profile.toughestWeek.week}` : 'Toughest week'}
            />
          </div>
          <p className="text-[11px] text-field-500 -mt-2">
            Underdog picks: games where most of the league (3+ players) picked the other side.
          </p>

          {/* Boldest call + best/worst team */}
          {(call || profile.bestTeam || profile.worstTeam) && (
            <div className="space-y-1.5">
              {call && (
                <Line label="Boldest call">
                  <TeamChip team={call.team} /> over {call.opponent}
                  <span className="text-field-500"> · {call.backers === 1 ? 'only one' : `one of ${call.backers}`} of {call.pickers} · Wk {call.week}</span>
                </Line>
              )}
              {profile.bestTeam && (
                <Line label="Best team to pick">
                  <TeamChip team={profile.bestTeam.team} /> {record(profile.bestTeam)}
                </Line>
              )}
              {profile.worstTeam && (
                <Line label="Worst team to pick">
                  <TeamChip team={profile.worstTeam.team} /> {record(profile.worstTeam)}
                </Line>
              )}
            </div>
          )}

          {/* Most-picked teams */}
          {profile.teams.length > 0 && (
            <div>
              <p className="font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-500 mb-1.5">Most picked</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.teams.slice(0, 8).map(t => (
                  <span key={t.team} className="inline-flex items-center gap-1 rounded-md bg-field-900/60 border border-field-700 px-1.5 py-0.5 text-xs">
                    <TeamChip team={t.team} bare />
                    <span className="text-field-400 tabular-nums">{record(t)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Week by week */}
          {profile.weeks.length > 0 && (
            <div>
              <p className="font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-500 mb-1.5">Week by week</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.weeks.map(w => (
                  <span
                    key={w.week}
                    title={w.won ? `Won week ${w.week}` : w.complete ? undefined : 'In progress'}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums',
                      w.won ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-field-900/60 border-field-700 text-field-300',
                      !w.complete && 'opacity-60',
                    )}
                  >
                    {w.won && <Trophy className="w-3 h-3" />}
                    <span className="font-bold">W{w.week}</span>
                    <span>{w.correct}/{w.played}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

const record = (t: TeamRecord) => `${t.wins}–${t.losses}`

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-field-400 text-xs shrink-0">{label}</span>
      <span className="flex items-center gap-1 text-white font-bold min-w-0 truncate">{children}</span>
    </div>
  )
}

function TeamChip({ team, bare = false }: { team: string; bare?: boolean }) {
  const logo = teamLogoUrl({ abbr: team }, 'NFL')
  return (
    <span className={clsx('inline-flex items-center gap-1', !bare && 'font-cond font-black')}>
      {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
      <span className="font-cond font-black text-white">{team}</span>
    </span>
  )
}
