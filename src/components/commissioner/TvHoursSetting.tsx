import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Moon, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { parseShopHours, isShopOpen, nextShopOpen, backLabel, hhmmLabel, type ShopHours } from '@/lib/shopHours'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS: ShopHours = { open: '07:00', close: '17:00', days: [1, 2, 3, 4, 5] }

/**
 * Closing time for the Shop TV (leagues.tv_hours): outside the shop's
 * hours it sleeps, a dim clock with when it's back and the score of any
 * game on, checking in far less often. By the TV's own clock. Any remote
 * button wakes it for half an hour, and so does OK on the TV's remote.
 */
export function TvHoursSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const saved = activeLeague?.id === leagueId ? parseShopHours(activeLeague.tv_hours) : null
  const [draft, setDraft] = useState<ShopHours | null>(saved)
  const [busy, setBusy] = useState(false)
  const savedKey = JSON.stringify(saved)
  useEffect(() => { setDraft(parseShopHours(JSON.parse(savedKey))) }, [savedKey])

  const save = async (hours: ShopHours | null) => {
    setBusy(true)
    const { error } = await supabase.from('leagues').update({ tv_hours: hours }).eq('id', leagueId)
    setBusy(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, tv_hours: hours }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    toast.success(hours ? 'Shop hours saved. The TV sleeps outside them.' : 'The TV stays on around the clock')
  }

  const valid = draft ? parseShopHours(draft) : null
  const dirty = JSON.stringify(valid) !== savedKey
  const now = new Date()
  const toggleDay = (d: number) => setDraft(h => h && {
    ...h,
    days: h.days.includes(d) ? h.days.filter(x => x !== d) : [...h.days, d].sort(),
  })

  return (
    <div className="pt-3 border-t border-field-700">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 font-cond font-bold text-sm uppercase tracking-wider text-white">
            <Moon className="w-3.5 h-3.5 text-gold" /> Shop hours
          </span>
          <p className="text-field-400 text-xs mt-1">
            Outside them the TV sleeps: a dim clock, when you’re back, and the score of any game on. It checks in far
            less often. Any remote button wakes it for 30 minutes, and so does OK on the TV’s remote.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={!!draft}
          aria-label="Sleep after shop hours"
          onClick={() => {
            if (draft) { setDraft(null); if (saved) void save(null) }
            else setDraft(saved ?? WEEKDAYS)
          }}
          disabled={busy}
          className={clsx('relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5', draft ? 'bg-gold' : 'bg-field-600', busy && 'opacity-60')}
        >
          <span className={clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', draft ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>

      {draft && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-field-400 text-xs font-bold uppercase tracking-wider">Opens</span>
              <input type="time" value={draft.open} onChange={e => setDraft({ ...draft, open: e.target.value })} className="input !py-1.5 !text-sm w-[7.5rem]" />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-field-400 text-xs font-bold uppercase tracking-wider">Closes</span>
              <input type="time" value={draft.close} onChange={e => setDraft({ ...draft, close: e.target.value })} className="input !py-1.5 !text-sm w-[7.5rem]" />
            </label>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Days the shop is open">
            {DAYS.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={draft.days.includes(d)}
                aria-label={DAY_NAMES[d]}
                className={clsx(
                  'w-9 h-9 rounded-lg text-xs font-bold border transition-colors',
                  draft.days.includes(d) ? 'bg-gold/15 border-gold text-gold' : 'bg-field-800 border-field-700 text-field-500 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {valid ? (
            <p className="text-xs text-field-400">
              Awake {hhmmLabel(valid.open)}–{hhmmLabel(valid.close)}
              {valid.close <= valid.open ? ' (past midnight)' : ''}.
              {' '}By the TV’s clock it’s {isShopOpen(valid, now) ? 'open now' : (() => {
                const back = nextShopOpen(valid, now)
                return back ? `closed now, back ${backLabel(back, now)}` : 'closed now'
              })()}.
            </p>
          ) : (
            <p className="text-xs text-amber-300">Pick at least one day, and different open and close times.</p>
          )}
          <button
            onClick={() => valid && save(valid)}
            disabled={!valid || !dirty || busy}
            className="btn-gold w-full justify-center !py-2 !text-sm disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {dirty ? 'Save shop hours' : 'Saved'}
          </button>
        </div>
      )}
    </div>
  )
}
