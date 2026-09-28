import { useState } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/**
 * The weekly roast: when on, send-reminders has Claude write a roast of
 * each finished week from its results and posts it to league chat right
 * after the week-final card. The note tells it about the league (a job
 * everyone shares makes shop talk fair game).
 */
export function AiRecapSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const [on, setOn] = useState<boolean>(!!(activeLeague as any)?.ai_recap)
  const [saving, setSaving] = useState(false)
  const savedNotes = activeLeague?.roast_notes ?? ''
  const [notes, setNotes] = useState(savedNotes)
  const [savingNotes, setSavingNotes] = useState(false)

  const remember = (patch: Record<string, unknown>) => {
    if (activeLeague && activeLeague.id === leagueId) {
      setActiveLeague({ ...activeLeague, ...patch } as any, myMembership as any)
    }
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
  }

  async function toggle() {
    const next = !on
    setSaving(true)
    const { error } = await supabase.from('leagues').update({ ai_recap: next }).eq('id', leagueId)
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    setOn(next)
    remember({ ai_recap: next })
    toast.success(next ? 'The Commish will roast every week' : 'Weekly roast turned off')
  }

  async function saveNotes() {
    const value = notes.trim().slice(0, 500) || null
    setSavingNotes(true)
    const { error } = await supabase.from('leagues').update({ roast_notes: value }).eq('id', leagueId)
    setSavingNotes(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    remember({ roast_notes: value })
    toast.success('The Commish knows now')
  }

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Mic className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-cond font-bold text-white tracking-wide text-base">Weekly Roast</h3>
          <p className="text-field-400 text-sm">
            When a week goes final, &ldquo;The Commish&rdquo; posts a savage, foul-mouthed roast to league chat,
            calling out most of the league by name. Written by Claude from the week&apos;s results.
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

      <div>
        <label className="label" htmlFor="roast-notes">About your league</label>
        <textarea
          id="roast-notes"
          value={notes}
          onChange={e => setNotes(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          placeholder="We all work together as emergency vehicle upfitters."
          className="input w-full resize-none"
        />
        <div className="flex items-center justify-between gap-3 mt-1.5">
          <p className="text-[11px] text-field-500 leading-snug">
            If everyone shares a job, the roast can take shots at it. It still never gets personal.
          </p>
          <button
            onClick={saveNotes}
            disabled={savingNotes || notes.trim() === savedNotes.trim()}
            className="btn-gold !px-3 !py-1.5 !text-xs shrink-0"
          >
            {savingNotes && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}
