import { useState } from 'react'
import { Mic } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/**
 * The weekly roast: when on, send-reminders has Claude write a short
 * roast of each finished week from its results and posts it to league
 * chat right after the week-final card.
 */
export function AiRecapSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const [on, setOn] = useState<boolean>(!!(activeLeague as any)?.ai_recap)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !on
    setSaving(true)
    const { error } = await supabase.from('leagues').update({ ai_recap: next }).eq('id', leagueId)
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    setOn(next)
    if (activeLeague && activeLeague.id === leagueId) {
      setActiveLeague({ ...activeLeague, ai_recap: next } as any, myMembership as any)
    }
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    toast.success(next ? 'The Commish will roast every week' : 'Weekly roast turned off')
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-field-700 bg-field-900/50 p-4">
      <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
        <Mic className="w-4 h-4 text-gold" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-cond font-bold text-white tracking-wide text-base">Weekly Roast</h3>
        <p className="text-field-400 text-sm">
          When a week goes final, &ldquo;The Commish&rdquo; posts a short roast to league chat: the winner,
          the bottom of the table, the bad beat. Written by Claude from the week&apos;s results, about picks only.
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Weekly roast"
        onClick={toggle}
        disabled={saving}
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1',
          on ? 'bg-gold' : 'bg-field-600',
          saving && 'opacity-60',
        )}
      >
        <span className={clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  )
}
