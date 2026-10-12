import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/**
 * The Commish's weekly poll: when on, send-reminders posts an upset poll
 * to league chat once each week's lines are in (the week's biggest
 * underdogs, voting until the first of them kicks off). On by default;
 * turning it off stops the next ones, and a poll already up stays.
 */
export function WeeklyPollSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const [on, setOn] = useState<boolean>((activeLeague as any)?.weekly_poll ?? true)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !on
    setSaving(true)
    const { error } = await supabase.from('leagues').update({ weekly_poll: next }).eq('id', leagueId)
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    setOn(next)
    if (activeLeague && activeLeague.id === leagueId) {
      setActiveLeague({ ...activeLeague, weekly_poll: next } as any, myMembership as any)
    }
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    toast.success(next ? 'The Commish will post a poll every week' : 'Weekly poll turned off')
  }

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-cond font-bold text-white tracking-wide text-base">Weekly Poll</h3>
          <p className="text-field-400 text-sm">
            Once each week&apos;s lines are out, &ldquo;The Commish&rdquo; posts an upset poll to league chat:
            which of the week&apos;s biggest underdogs wins outright. Voting closes when the first of them kicks off.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Weekly poll"
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
    </div>
  )
}
