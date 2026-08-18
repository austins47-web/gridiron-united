import { useState } from 'react'
import { Clock, AlarmClock, Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'

interface Props {
  leagueId: string
  initialLockType: 'deadline' | 'kickoff'
  initialDeadlineDay: number   // 0=Sun … 6=Sat
  initialDeadlineTime: string  // 'HH:MM' 24h
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export function PickDeadlineSettings({ leagueId, initialLockType, initialDeadlineDay, initialDeadlineTime }: Props) {
  const [lockType,     setLockType]     = useState<'deadline'|'kickoff'>(initialLockType)
  const [deadlineDay,  setDeadlineDay]  = useState(initialDeadlineDay)
  const [deadlineTime, setDeadlineTime] = useState(initialDeadlineTime)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<'idle'|'saved'|'error'>('idle')

  const dirty = lockType !== initialLockType || deadlineDay !== initialDeadlineDay || deadlineTime !== initialDeadlineTime

  async function save() {
    setSaving(true); setStatus('idle')
    const { error } = await supabase.from('leagues').update({
      pick_lock_type:    lockType,
      pick_deadline_day:  lockType === 'deadline' ? deadlineDay  : null,
      pick_deadline_time: lockType === 'deadline' ? deadlineTime : null,
    }).eq('id', leagueId)
    setSaving(false)
    setStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setStatus('idle'), 3000)
  }

  function fmt(t: string) {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-cond font-bold text-white tracking-wide text-base mb-1">Pick Deadline</h3>
        <p className="text-field-400 text-sm">Control when picks lock each week.</p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { val: 'deadline' as const, icon: Clock,       title: 'Weekly Deadline',  desc: 'All picks lock at the same time every week' },
          { val: 'kickoff'  as const, icon: AlarmClock,  title: 'Lock at Kickoff',  desc: 'Each game locks individually at its kickoff' },
        ].map(({ val, icon: Icon, title, desc }) => (
          <button key={val} onClick={() => setLockType(val)}
            className={clsx(
              'flex items-start gap-3 p-4 rounded-xl border text-left transition-all',
              lockType === val ? 'border-gold bg-gold/10' : 'border-field-600 bg-field-800 hover:border-field-400',
            )}>
            <Icon size={20} className={lockType === val ? 'text-gold shrink-0 mt-0.5' : 'text-field-400 shrink-0 mt-0.5'} />
            <div>
              <p className={clsx('text-sm font-bold', lockType === val ? 'text-gold' : 'text-white')}>{title}</p>
              <p className="text-xs text-field-400 mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Deadline config */}
      {lockType === 'deadline' && (
        <div className="bg-field-800 border border-field-600 rounded-xl p-4 space-y-4">
          <p className="text-xs text-field-400 uppercase tracking-wider font-bold">Deadline Settings</p>

          {/* Day picker */}
          <div className="space-y-1.5">
            <label className="text-sm text-field-300">Day of week</label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => (
                <button key={i} onClick={() => setDeadlineDay(i)}
                  className={clsx('py-2 rounded-lg text-xs font-bold transition-all',
                    deadlineDay === i ? 'bg-gold text-field-950' : 'bg-field-700 text-field-300 hover:bg-field-600'
                  )}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
          </div>

          {/* Time picker */}
          <div className="space-y-1.5">
            <label className="text-sm text-field-300">Time</label>
            <div className="flex items-center gap-3">
              <input type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)}
                className="bg-field-700 border border-field-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors" />
              <span className="text-sm text-field-400">{DAYS[deadlineDay]}s at {fmt(deadlineTime)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-field-700 rounded-lg px-3 py-2">
            <Lock size={14} className="text-gold shrink-0" />
            <p className="text-xs text-field-300">
              Picks lock every <span className="text-white font-bold">{DAYS[deadlineDay]}</span> at <span className="text-white font-bold">{fmt(deadlineTime)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Kickoff info */}
      {lockType === 'kickoff' && (
        <div className="bg-field-800 border border-field-600 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlarmClock size={15} className="text-gold" />
            <p className="text-sm font-bold text-white">How kickoff locking works</p>
          </div>
          <ul className="space-y-1.5 text-sm text-field-400">
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Each game locks <span className="text-white mx-1">5 minutes before kickoff</span></li>
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Members can still pick unlocked games after early games start</li>
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Kickoff times sync automatically from the ESPN schedule</li>
          </ul>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || saving}
          className={clsx('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all',
            dirty && !saving ? 'bg-gold text-field-950 hover:bg-gold/90' : 'bg-field-700 text-field-500 cursor-not-allowed'
          )}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {status === 'saved' && (
          <div className="flex items-center gap-1.5 text-sm text-nfl"><CheckCircle2 size={15} />Saved</div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-1.5 text-sm text-red-400"><AlertCircle size={15} />Failed — try again</div>
        )}
      </div>
    </div>
  )
}
