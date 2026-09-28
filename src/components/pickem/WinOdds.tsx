import { Percent, Siren, Megaphone } from 'lucide-react'
import clsx from 'clsx'
import {
  gameClockLabel, isLive, rootingFor, swingsFor,
  type GameSwing, type UpsetWatch, type WeekRow, type WinOdds,
} from './standings'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { BeltIcon } from './Belt'

const fmt = (p: number) =>
  p > 0 && p < 0.005 ? '<1%' : p < 1 && p >= 0.995 ? '>99%' : `${Math.round(p * 100)}%`

/**
 * Everyone's chance to win the week, live — computeWinOdds plays the
 * rest of the week out 4,000 times. Arrows compare with the same odds
 * before anything kicked off. A single-series bar list: one gold hue,
 * the number always printed beside the bar.
 */
export function WinOddsPanel({ odds, rows, week, currentUserId, beltHolders }: {
  odds: WinOdds
  rows: WeekRow[]
  week: number
  currentUserId?: string
  beltHolders?: Set<string>
}) {
  const list = rows
    .filter(r => r.submitted)
    .map(r => ({ r, now: odds.now.get(r.userId) ?? 0, then: odds.kickoff.get(r.userId) ?? 0 }))
    .sort((a, b) => b.now - a.now || b.then - a.then || a.r.name.localeCompare(b.r.name))
  const alive = list.filter(x => x.now > 0)
  const out = list.filter(x => x.now === 0)

  return (
    <div className="panel !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
          <Percent className="w-4 h-4 text-gold" /> Chance to Win Week {week}
        </span>
        <span className="text-field-500 text-[11px] shrink-0">▲▼ since kickoff</span>
      </div>

      <div className="px-4 py-2 space-y-1.5">
        {alive.map(({ r, now, then }) => {
          const isYou = r.userId === currentUserId
          const delta = Math.round((now - then) * 100)
          return (
            <div
              key={r.userId}
              className={clsx('grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2.5 py-1', isYou && 'rounded-lg bg-gold/[0.06] -mx-2 px-2')}
              title={`${r.name}: ${(now * 100).toFixed(1)}% now, ${(then * 100).toFixed(1)}% at kickoff`}
            >
              <span className="flex items-center gap-1 min-w-0">
                <span className={clsx('text-sm font-bold truncate', isYou ? 'text-gold' : 'text-white')}>{isYou ? 'You' : r.name}</span>
                {beltHolders?.has(r.userId) && <BeltIcon />}
              </span>
              <div className="h-2 rounded-full bg-field-800 overflow-hidden">
                <div className="h-full bg-gold rounded-r-[4px] transition-[width] duration-700" style={{ width: `${Math.max(1.5, now * 100)}%` }} />
              </div>
              <span className="flex items-baseline justify-end gap-1.5 w-[5.5rem]">
                <span className="font-cond font-black text-white tabular-nums">{fmt(now)}</span>
                <span className={clsx(
                  'text-[11px] font-bold tabular-nums w-8 text-right',
                  delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-field-600',
                )}>
                  {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-field-700 text-[11px] text-field-500 space-y-1">
        {out.length > 0 && (
          <p>
            <span className="font-bold uppercase tracking-wider text-field-600">No chance</span>{' '}
            {out.map(x => (x.r.userId === currentUserId ? 'You' : x.r.name)).join(', ')}
          </p>
        )}
        <p>
          The rest of the week played out 4,000 times from live win probabilities and the betting line.
          Picks on games that haven&apos;t kicked off stay hidden, so they&apos;re estimated.
        </p>
      </div>
    </div>
  )
}

/**
 * Late in a game, the team most of the league picked is going down
 * (computeUpsetWatch). Red is the alert color here, always with the
 * siren and words — never color alone.
 */
export function UpsetWatchBanner({ items }: { items: UpsetWatch[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map(u => (
        <div key={u.game.id} className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5">
          <Siren className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white text-sm">Upset watch: {u.dog} over {u.crowd}?</p>
            <p className="text-xs text-field-300 leading-snug">
              {u.crowdPicks} of {u.pickers} picked {u.crowd} ·{' '}
              {u.dogScore > u.crowdScore ? `${u.dog} leads ${u.dogScore}–${u.crowdScore}` : `${u.crowd} ${u.crowdScore}–${u.dogScore}`}
              {' '}· {gameClockLabel(u.game)} · {u.crowd} down to {fmt(u.chance)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

const stakesLabel = (s: number) => (s >= 0.25 ? 'Huge' : s >= 0.12 ? 'Big' : s >= 0.05 ? 'Some' : 'Little')

const kickoffLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The games still to be played, ranked by how much they decide the
 * week (GameSwing.stakes), each with who it matters to and — the
 * Rooting Guide — which side you want and what each result does to
 * your chance. Same simulations as the odds panel, split by result.
 */
export function StakesPanel({ swings, rows, currentUserId }: {
  swings: GameSwing[]
  rows: WeekRow[]
  currentUserId?: string
}) {
  const nameOf = new Map(rows.map(r => [r.userId, r.userId === currentUserId ? 'you' : r.name]))
  const shown = swings.filter(s => !s.settled).slice(0, 8)
  if (shown.length === 0) return null
  const top = Math.max(...shown.map(s => s.stakes), 0.01)

  return (
    <div className="panel !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
          <Megaphone className="w-4 h-4 text-gold" /> Games That Decide It
        </span>
        <span className="text-field-500 text-[11px] shrink-0">& who to root for</span>
      </div>
      <div className="divide-y divide-field-700/40">
        {shown.map(s => {
          const g = s.game
          const mine = currentUserId ? rootingFor(s, currentUserId) : null
          const who = swingsFor(s)
            .sort((a, b) => Math.abs((s.ifHome.get(b) ?? 0) - (s.ifAway.get(b) ?? 0)) - Math.abs((s.ifHome.get(a) ?? 0) - (s.ifAway.get(a) ?? 0)))
          const live = isLive(g)
          return (
            <div key={g.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Team abbr={g.away_team} />
                <span className="text-field-500 text-xs">@</span>
                <Team abbr={g.home_team} />
                <span className={clsx('ml-1 text-[11px] truncate', live ? 'text-emerald-400 font-bold' : 'text-field-500')}>
                  {live ? `${g.away_score ?? 0}–${g.home_score ?? 0} · ${gameClockLabel(g)}` : kickoffLabel(g.game_date)}
                </span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-field-400 shrink-0">{stakesLabel(s.stakes)} stakes</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-field-800" title={`Stakes ${Math.round(s.stakes * 100)}`}>
                <div className="h-full rounded-r-[4px] rounded-l-full bg-gold" style={{ width: `${Math.max(3, (s.stakes / top) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-field-400">
                {who.length === 0 ? "Won't move the week much"
                  : `Matters to ${who.length === rows.filter(r => r.submitted).length ? 'everyone' : `${who.length} of you`}: `
                    + who.slice(0, 4).map(id => nameOf.get(id) ?? 'someone').join(', ') + (who.length > 4 ? ` +${who.length - 4}` : '')}
              </p>
              {mine && (
                <p className="mt-1 text-xs text-white">
                  <span className="font-bold text-gold">Root for {mine.team}</span>
                  <span className="text-field-300"> · your chance {fmt(mine.ifWin)} if they win, {fmt(mine.ifLose)} if not</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Team({ abbr }: { abbr: string }) {
  const logo = teamLogoUrl({ abbr }, 'NFL')
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
      <span className="font-cond font-black text-white text-sm">{abbr}</span>
    </span>
  )
}
