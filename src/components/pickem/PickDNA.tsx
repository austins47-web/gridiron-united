import clsx from 'clsx'
import type { PickDNA, PickTraits } from './season'

const TRAITS: { key: keyof PickTraits; label: (d: PickDNA) => string; hint: string }[] = [
  { key: 'chalk',      label: () => 'Picks the favorite', hint: 'Share of picks on the pregame favorite' },
  { key: 'contrarian', label: () => 'Against the crowd',  hint: "Share of picks against the league's majority (3+ pickers)" },
  { key: 'homer',      label: () => 'Picks home teams',   hint: 'Share of picks on the home team' },
  { key: 'loyalty',    label: d => (d.favoriteTeam ? `Backs ${d.favoriteTeam}` : 'Backs their team'), hint: "Share of their favorite team's games where they picked them" },
  { key: 'hitRate',    label: () => 'Right',              hint: 'Share of picks that were right' },
]

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * A player's Pick DNA: one meter per trait, their value as a gold bar
 * and the league average as a white tick — emphasis on the player,
 * the league as context. Every value is printed, so nothing rides on
 * color alone.
 */
export function PickDNABars({ dna, league, compact = false }: { dna: PickDNA; league: PickTraits; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {TRAITS.map(t => {
        const v = dna[t.key]
        const avg = league[t.key]
        return (
          <div key={t.key} title={`${t.hint}${avg != null ? ` · league average ${pct(avg)}` : ''}`}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={clsx('text-field-300 truncate', compact && 'text-[11px]')}>{t.label(dna)}</span>
              <span className="font-cond font-black text-white tabular-nums">{v == null ? '—' : pct(v)}</span>
            </div>
            <div className="relative h-2 mt-1 rounded-full bg-field-800">
              {v != null && (
                <div className="absolute inset-y-0 left-0 bg-gold rounded-r-[4px] rounded-l-full" style={{ width: `${Math.max(2, v * 100)}%` }} />
              )}
              {avg != null && (
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[#F5F5F5] ring-2 ring-field-900"
                  style={{ left: `calc(${avg * 100}% - 1px)` }}
                />
              )}
            </div>
          </div>
        )
      })}
      <p className="flex items-center gap-1.5 text-[10px] text-field-500 pt-0.5">
        <span className="inline-block w-0.5 h-3 rounded-full bg-[#F5F5F5]" /> League average
      </p>
    </div>
  )
}
