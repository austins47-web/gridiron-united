import { useState, type ReactNode } from 'react'
import { X, Trophy, Dna, Sparkles, Users, Swords, Medal, Quote } from 'lucide-react'
import clsx from 'clsx'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { PickDNABars } from './PickDNA'
import { AchievementGrid } from './Achievements'
import { BeltIcon } from './Belt'
import { ACHIEVEMENTS, type EarnedAchievement } from './standings'
import type { SeasonProfile, TeamRecord, PickDNA, PickTraits, PickMatch } from './season'

/** A pick with its one-line reason, public once the game kicks off. */
export interface Receipt {
  gameId: string
  week: number
  team: string
  opponent: string
  reason: string
  /** Null while the game's undecided. */
  result: 'hit' | 'missed' | null
}

/**
 * One player's Pick'Em season, opened from a Standings row (or "Your
 * season"). Record and rank match the Standings table; the pick-level
 * facts (underdog picks, boldest call, teams) count final games only.
 * With Pick DNA, it also shows how they pick and opens their Wrapped.
 * Opened from any name in the league (PlayerCardHost).
 */
export function SeasonCard({ profile, totalPlayers, isYou, onClose, dna, leagueDna, onWrapped, achievements, matches, belt, receipts }: {
  profile: SeasonProfile
  totalPlayers: number
  isYou: boolean
  onClose: () => void
  dna?: PickDNA | null
  leagueDna?: PickTraits | null
  onWrapped?: () => void
  achievements?: EarnedAchievement[]
  matches?: { twin: PickMatch | null; nemesis: PickMatch | null } | null
  /** Weeks they won the Belt, and their current reign (0 if they don't hold it). */
  belt?: { weeks: number[]; reign: number } | null
  receipts?: Receipt[]
}) {
  const [allReceipts, setAllReceipts] = useState(false)
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

          {/* The Belt: holding it now, or the weeks they had it */}
          {belt && belt.weeks.length > 0 && (
            <div className={clsx(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5',
              belt.reign > 0 ? 'border-gold/40 bg-gold/[0.08]' : 'border-field-700 bg-field-900/50',
            )}>
              <BeltIcon className="w-8 h-5" title="The Belt" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-white">
                  {belt.reign > 0
                    ? `${isYou ? 'You hold' : 'Holds'} the Belt${belt.reign > 1 ? ` · ${belt.reign} weeks straight` : ''}`
                    : `Held the Belt ${belt.weeks.length} week${belt.weeks.length === 1 ? '' : 's'}`}
                </p>
                <p className="text-xs text-field-400 truncate">
                  Won {belt.weeks.map(w => (w >= 19 ? ['Wild Card', 'Divisional', 'Conf.', 'Super Bowl'][w - 19] : `W${w}`)).join(', ')}
                </p>
              </div>
            </div>
          )}

          {onWrapped && profile.standing.played > 0 && (
            <button onClick={onWrapped} className="btn-gold w-full justify-center !py-2.5">
              <Sparkles className="w-4 h-4" /> {isYou ? 'Play your Wrapped' : `Play ${profile.name}'s Wrapped`}
            </button>
          )}

          {/* How they pick */}
          {dna && leagueDna && dna.picks > 0 && (
            <div className="rounded-xl border border-field-700 bg-field-900/50 p-3">
              <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-400">
                <Dna className="w-3.5 h-3.5 text-gold" /> Pick DNA
              </p>
              <p className="font-cond font-black text-xl text-gold uppercase leading-tight mt-1">{dna.archetype.title}</p>
              <p className="text-xs text-field-400 mb-3">{dna.archetype.blurb}</p>
              <PickDNABars dna={dna} league={leagueDna} />
            </div>
          )}

          {/* Who picks like them, and who never does */}
          {(matches?.twin || matches?.nemesis) && (
            <div className="grid grid-cols-2 gap-2">
              {matches.twin && (
                <div className="rounded-xl border border-field-700 bg-field-900/50 p-3 min-w-0">
                  <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-400">
                    <Users className="w-3.5 h-3.5 text-gold" /> Twin
                  </p>
                  <p className="font-bold text-white truncate mt-1">{matches.twin.name}</p>
                  <p className="text-xs text-field-400">Same pick {Math.round(matches.twin.agree * 100)}% of the time</p>
                </div>
              )}
              {matches.nemesis && (
                <div className="rounded-xl border border-field-700 bg-field-900/50 p-3 min-w-0">
                  <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-400">
                    <Swords className="w-3.5 h-3.5 text-gold" /> Nemesis
                  </p>
                  <p className="font-bold text-white truncate mt-1">{matches.nemesis.name}</p>
                  <p className="text-xs text-field-400">
                    Split on {matches.nemesis.split} · {isYou ? "you're" : `${profile.name.split(' ')[0]}'s`}{' '}
                    <span className="font-bold text-white">{matches.nemesis.youRight}–{matches.nemesis.theyRight}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Badges */}
          {achievements && (
            <div>
              <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-500 mb-1.5">
                <Medal className="w-3.5 h-3.5 text-gold" /> Badges · {achievements.length} of {ACHIEVEMENTS.length}
              </p>
              <AchievementGrid earned={achievements} />
            </div>
          )}

          {/* Receipts: why they picked what they picked, and how it aged */}
          {receipts && receipts.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-500 mb-1.5">
                <Quote className="w-3.5 h-3.5 text-gold" /> Receipts · {receipts.length}
                {receipts.some(r => r.result) && (
                  <span className="normal-case tracking-normal font-sans text-field-400">
                    {' '}· {receipts.filter(r => r.result === 'hit').length} of {receipts.filter(r => r.result).length} aged well
                  </span>
                )}
              </p>
              <div className="space-y-1.5">
                {(allReceipts ? receipts : receipts.slice(0, 4)).map(r => (
                  <div key={r.gameId} className="rounded-lg border border-field-700 bg-field-900/50 px-3 py-2">
                    <p className="text-sm text-white italic leading-snug break-words">&ldquo;{r.reason}&rdquo;</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-field-400">
                      <TeamChip team={r.team} bare /> over {r.opponent} · W{r.week}
                      {r.result && (
                        <span className={clsx('font-bold', r.result === 'hit' ? 'text-nfl' : 'text-red-400')}>
                          · {r.result === 'hit' ? 'Aged well' : 'Aged badly'}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
              {receipts.length > 4 && (
                <button onClick={() => setAllReceipts(a => !a)} className="mt-1.5 text-xs font-bold text-gold hover:text-gold-light">
                  {allReceipts ? 'Show fewer' : `Show all ${receipts.length}`}
                </button>
              )}
            </div>
          )}

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
