import { Swords, Crown, Target } from 'lucide-react'
import clsx from 'clsx'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { describeTiebreakerRange, type WhoCanWin, type WhoCanWinRow } from './standings'

/**
 * "Who can still win" — shown on the Standings tab late in a week
 * (6 or fewer games left, at least one final). For each player still
 * alive: the results they need in every outcome where they win, and
 * the tiebreaker total they need when every path runs through one.
 * See computeWhoCanWin for how outcomes are played out.
 */
export function WhoCanWinPanel({ data, currentUserId }: { data: WhoCanWin; currentUserId?: string }) {
  const alive = data.rows.filter(r => r.status !== 'out')
  const out = data.rows.filter(r => r.status === 'out')

  return (
    <div className="panel !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
          <Swords className="w-4 h-4 text-gold" /> Who Can Still Win
        </span>
        <span className="text-field-500 text-xs shrink-0">
          {data.remaining} game{data.remaining === 1 ? '' : 's'} left
        </span>
      </div>

      <div className="divide-y divide-field-700/40">
        {alive.map(r => {
          const isYou = r.userId === currentUserId
          return (
            <div key={r.userId} className={clsx('px-4 py-2.5 flex items-start gap-3', isYou && 'bg-gold/[0.06]')}>
              <span
                className="font-cond font-black text-white tabular-nums w-6 text-right shrink-0 leading-6"
                title="Correct picks on games already final"
              >
                {r.correct}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={clsx('font-bold truncate', isYou ? 'text-gold' : 'text-white')}>{r.name}</span>
                  {isYou && <span className="text-[11px] font-bold uppercase tracking-wider text-gold shrink-0">you</span>}
                  {r.status === 'clinched' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-field-950 bg-gold rounded px-1.5 py-0.5 shrink-0">
                      <Crown className="w-3 h-3" /> Clinched
                    </span>
                  )}
                </div>
                <Needs row={r} />
              </div>
            </div>
          )
        })}
      </div>

      {out.length > 0 && (
        <div className="px-4 py-2.5 border-t border-field-700 text-xs text-field-500">
          <span className="font-bold uppercase tracking-wider text-field-600">Out</span>{' '}
          {out.map(r => r.userId === currentUserId ? 'You' : r.name).join(', ')}
        </div>
      )}
    </div>
  )
}

function Needs({ row }: { row: WhoCanWinRow }) {
  if (row.status === 'clinched') {
    return <p className="text-xs text-gold mt-0.5">Wins the week whatever happens</p>
  }
  if (row.needs.length === 0 && !row.tiebreaker) {
    return <p className="text-xs text-field-400 mt-0.5">Several ways to win</p>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-field-400">
      {row.needs.length > 0 && <span>Needs</span>}
      {row.needs.map(n => {
        const logo = teamLogoUrl({ abbr: n.team }, 'NFL')
        return (
          <span key={n.gameId} className="inline-flex items-center gap-1 rounded-md bg-field-800 border border-field-700 px-1.5 py-0.5">
            {logo && <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />}
            <span className="font-cond font-black text-[11px] text-white">{n.team}</span>
          </span>
        )
      })}
      {row.tiebreaker && (
        <span className="inline-flex items-center gap-1">
          <Target className="w-3 h-3 text-gold" />
          {row.needs.length > 0 ? 'and a' : 'Needs a'} tiebreaker total {describeTiebreakerRange(row.tiebreaker)}
        </span>
      )}
    </div>
  )
}
