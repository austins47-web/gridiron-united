import { useState, type ReactNode } from 'react'
import { Target, Lock, Crosshair, Trophy, Bell, Smartphone, Check } from 'lucide-react'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { InstallGuide } from '@/components/ui/InstallGuide'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { describeDeadline, localZone, nextWeeklyDeadline } from '@/lib/deadline'
import type { League } from '@/types/database'

// ══════════════════════════════════════════════════════════════
// The first thing someone sees after joining a Pick'Em league from an
// invite: how picks, locks and the tiebreaker work in this league, and
// a one-tap way to get reminders before their picks lock.
// ══════════════════════════════════════════════════════════════

export function PickemWelcome({ league, memberCount, onClose }: {
  league: League
  memberCount?: number
  onClose: () => void
}) {
  const push = usePushNotifications()
  const [showInstall, setShowInstall] = useState(false)

  const lockRule = (() => {
    const l = league as League & { pick_lock_type?: string | null; pick_deadline_day?: number | null; pick_deadline_time?: string | null; pick_deadline_tz?: string | null }
    if (l.pick_lock_type === 'deadline' && l.pick_deadline_day != null && l.pick_deadline_time && l.pick_deadline_tz) {
      const when = describeDeadline(nextWeeklyDeadline(l.pick_deadline_day, l.pick_deadline_time, l.pick_deadline_tz), localZone())
      return <>All of a week&apos;s picks lock <b>{when}</b>. Change them as often as you like until then.</>
    }
    return <>Each game locks at <b>its own kickoff</b> — you can pick Sunday&apos;s games right up until they start.</>
  })()

  return (
    <>
    <ModalPortal onClose={onClose}>
      <div className="modal-box modal-sm !p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative px-6 pt-6 pb-5 text-center bg-gradient-to-b from-gold/[0.14] to-transparent border-b border-field-700">
          <div className="text-4xl mb-2" aria-hidden>🏈</div>
          <div className="font-cond font-bold text-[11px] uppercase tracking-[0.22em] text-gold">Welcome to</div>
          <h2 className="font-cond font-black uppercase text-white text-3xl leading-none mt-1">{league.name}</h2>
          {memberCount != null && memberCount > 1 && (
            <p className="text-xs text-field-400 mt-2">You and {memberCount - 1} other{memberCount === 2 ? '' : 's'} are picking this season</p>
          )}
        </div>

        <div className="px-6 py-5 space-y-3.5">
          <div className="font-cond font-bold text-[11px] uppercase tracking-[0.2em] text-field-400">How it works</div>
          <Rule icon={<Target className="w-4 h-4" />}>
            Pick the <b>winner of every NFL game</b>, every week.
          </Rule>
          <Rule icon={<Lock className="w-4 h-4" />}>{lockRule}</Rule>
          <Rule icon={<Crosshair className="w-4 h-4" />}>
            <b>Tiebreaker:</b> guess the total points in the week&apos;s last game. If you tie on correct picks, the closest guess wins — and no guess loses every tie.
          </Rule>
          <Rule icon={<Trophy className="w-4 h-4" />}>
            Most correct picks <b>wins the week</b>. Every week adds up in the season standings.
          </Rule>
        </div>

        <div className="px-6 pb-6 space-y-2">
          {push.status === 'off' && (
            <button onClick={push.enable} disabled={push.busy} className="btn-outline w-full justify-center !py-2.5">
              <Bell className="w-4 h-4" /> Remind me before picks lock
            </button>
          )}
          {push.status === 'on' && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 py-1">
              <Check className="w-3.5 h-3.5" /> Reminders are on for this device
            </div>
          )}
          {push.status === 'ios-install' && (
            <button onClick={() => setShowInstall(true)} className="btn-outline w-full justify-center !py-2.5">
              <Smartphone className="w-4 h-4" /> Get reminders on your iPhone
            </button>
          )}
          <button onClick={onClose} className="btn-gold w-full justify-center !py-3 !text-base">
            Make my picks
          </button>
        </div>
      </div>
    </ModalPortal>
    {/* Outside the welcome's overlay, so closing the guide doesn't close this too */}
    {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
    </>
  )
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">{icon}</span>
      <p className="text-sm text-field-200 leading-snug pt-1 [&_b]:text-white">{children}</p>
    </div>
  )
}
