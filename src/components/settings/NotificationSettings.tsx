import { useState } from 'react'
import {
  Bell, Mail, RotateCcw, Globe, Trophy, Smartphone, BellRing, BellOff, Send, Share,
} from 'lucide-react'
import clsx from 'clsx'
import {
  useNotificationPrefs, useSaveNotificationPrefs, useClearLeaguePrefs, resolvePrefs,
} from '@/hooks/useNotificationPrefs'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useMyLeagues } from '@/hooks/useLeague'
import { InstallGuide } from '@/components/ui/InstallGuide'
import { CalendarFeed } from '@/components/pickem/CalendarFeed'

// ══════════════════════════════════════════════════════════════
// Notification settings — shared by the Account page (your defaults
// for every league) and a league's My Settings (the same, plus a
// switch to override them for that league).
//
//   PhoneNotifications  this device's push on/off (per device, not
//                       per league)
//   ReminderSettings    email on/off, what to be told about, and how
//                       early — by email and on phones
//   AccountNotifications  the Account page's section: all of the
//                       above for every league, the Pick'Em deadline
//                       calendar, and which leagues have their own
//                       settings
// ══════════════════════════════════════════════════════════════

type Kind = 'pickem' | 'fantasy'

const EVENTS: { key: string; kinds: Kind[]; label: (k: Set<Kind>) => string; desc: (k: Set<Kind>) => string }[] = [
  {
    key: 'notify_pickem_deadline', kinds: ['pickem'],
    label: () => 'Pick deadlines & pick news',
    desc: () => "When games you haven't picked are about to lock, and on your phone, big line moves or a key injury on a team you picked",
  },
  { key: 'notify_draft', kinds: ['fantasy'], label: () => 'Draft starting', desc: () => 'Before your draft begins' },
  { key: 'notify_on_the_clock', kinds: ['fantasy'], label: () => "You're on the clock", desc: () => 'When it becomes your pick' },
  { key: 'notify_trades', kinds: ['fantasy'], label: () => 'Trade offers', desc: () => 'New offers and ones about to expire' },
  { key: 'notify_lineup', kinds: ['fantasy'], label: () => 'Lineup not set', desc: () => 'Before kickoff if your lineup is empty' },
  {
    key: 'notify_weekly_recap', kinds: ['pickem', 'fantasy'],
    label: k => (k.has('pickem') && !k.has('fantasy') ? 'Week results' : k.has('fantasy') && !k.has('pickem') ? 'Weekly recap' : 'Week results & recaps'),
    desc: k => k.has('pickem')
      ? "Who won each week, and on your phone, whether you can still win before the last game"
      : 'A summary once the week wraps',
  },
  {
    key: 'notify_live_alerts', kinds: ['pickem'],
    label: () => 'Live game alerts',
    desc: () => 'Phone only, while games are on: when you take the lead or clinch, your chance to win swings, an upset is brewing, who to root for before the big game, or the tiebreaker total gets close to your guess',
  },
]

/**
 * Email on/off, which events to hear about, and how early — by email
 * and on phones. With `league`, a switch picks between your defaults
 * for every league and an override for that league; without it, this
 * edits your defaults.
 */
export function ReminderSettings({ league, kinds, push }: {
  league?: { id: string; isPickem: boolean } | null
  /** Which league types' events to offer (defaults to the league's, else both). */
  kinds?: Kind[]
  push: ReturnType<typeof usePushNotifications>
}) {
  const { data: prefRows = [], isLoading } = useNotificationPrefs()
  const savePrefs = useSaveNotificationPrefs()
  const clearScope = useClearLeaguePrefs()

  // 'global' edits the account-wide default; 'league' overrides this league
  const [scope, setScope] = useState<'global' | 'league'>('global')
  const leagueId = league && scope === 'league' ? league.id : null
  const eff = resolvePrefs(prefRows, leagueId)
  const hasOverride = !!league && prefRows.some(r => r.league_id === league.id)
  const set = (key: string, value: unknown) => savePrefs.mutate({ leagueId, updates: { [key]: value } })

  const offered = new Set<Kind>(kinds ?? (league ? [league.isPickem ? 'pickem' : 'fantasy'] : ['pickem', 'fantasy']))
  const events = EVENTS.filter(e => e.kinds.some(k => offered.has(k)))
  // Event toggles and timing apply to email and phone alike — only moot when neither is on
  const anyChannel = eff.email_enabled || push.status === 'on' || push.deviceCount > 0

  return (
    <div className="panel space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-white text-sm">Reminders</h3>
        </div>
        {savePrefs.isPending && <span className="text-xs text-field-500">Saving…</span>}
      </div>

      {league ? (
        <>
          <div className="flex gap-1 p-1 bg-field-900 rounded-lg">
            {([
              ['global', 'All leagues', <Globe className="w-3 h-3" key="g" />],
              ['league', 'This league', <Trophy className="w-3 h-3" key="l" />],
            ] as const).map(([val, label, icon]) => (
              <button key={val} onClick={() => setScope(val)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-colors',
                  scope === val ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white',
                )}>
                {icon}{label}
              </button>
            ))}
          </div>
          <p className="text-xs text-field-500">
            {scope === 'global'
              ? "Your default for every league you're in (also in your Account settings)."
              : hasOverride
                ? 'This league overrides your default settings.'
                : 'Currently following your defaults. Changing anything here creates an override for this league only.'}
          </p>
        </>
      ) : (
        <p className="text-xs text-field-500">Your defaults for every league you&apos;re in. A league can override them in its own My Settings.</p>
      )}

      {isLoading ? (
        <div className="h-24 rounded-lg bg-field-800 animate-pulse" />
      ) : (
        <>
          {/* Master switch */}
          <label className="flex items-start gap-3 p-3 rounded-lg bg-field-800/60 cursor-pointer hover:bg-field-800 transition-colors">
            <input
              type="checkbox"
              checked={eff.email_enabled}
              onChange={e => set('email_enabled', e.target.checked)}
              className="w-4 h-4 accent-gold mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm text-white font-bold flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-field-400" />
                Send me email reminders
              </div>
              <div className="text-xs text-field-400">
                Turn this off to stop all reminder emails {leagueId ? 'for this league' : 'everywhere'}.
              </div>
            </div>
          </label>

          {/* Per-event toggles — email and phone */}
          <p className="text-xs text-field-500 !mt-3">What to tell you about, by email and on your phone:</p>
          <div className={clsx('space-y-1 transition-opacity', !anyChannel && 'opacity-40 pointer-events-none')}>
            {events.map(e => (
              <label key={e.key}
                className="flex items-start gap-3 p-3 rounded-lg bg-field-800/60 cursor-pointer hover:bg-field-800 transition-colors">
                <input
                  type="checkbox"
                  checked={(eff as Record<string, unknown>)[e.key] as boolean}
                  onChange={ev => set(e.key, ev.target.checked)}
                  className="w-4 h-4 accent-gold mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm text-white font-bold">
                    {e.label(offered)}
                    {offered.size > 1 && e.kinds.length === 1 && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-field-500">
                        {e.kinds[0] === 'pickem' ? "Pick'Em" : 'Fantasy'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-field-400">{e.desc(offered)}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Lead time */}
          <div className={clsx('space-y-1.5 transition-opacity', !anyChannel && 'opacity-40 pointer-events-none')}>
            <label className="text-sm text-field-300">How early should we warn you?</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[6, 12, 24, 48].map(h => (
                <button key={h} onClick={() => set('lead_hours_primary', h)}
                  className={clsx(
                    'py-2 rounded-lg text-xs font-bold transition-all',
                    eff.lead_hours_primary === h ? 'bg-gold text-field-950' : 'bg-field-700 text-field-300 hover:bg-field-600',
                  )}>
                  {h}h
                </button>
              ))}
            </div>
            <p className="text-xs text-field-500">You&apos;ll also get a final nudge {eff.lead_hours_secondary}h before.</p>
          </div>

          {/* Reset override */}
          {league && scope === 'league' && hasOverride && (
            <button
              onClick={() => { clearScope.mutate(league.id); setScope('global') }}
              className="flex items-center gap-1.5 text-xs font-bold text-field-400 hover:text-gold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to my default settings
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * This device's push notifications. Per device, not per league — what
 * gets sent follows the Reminders toggles.
 */
export function PhoneNotifications({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  const [showInstall, setShowInstall] = useState(false)
  const { status, deviceCount, busy, enable, disable, test } = push
  const others = status === 'on' ? deviceCount - 1 : deviceCount

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-white text-sm">Phone Notifications</h3>
        </div>
        {status === 'on' && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-field-950 bg-gold rounded px-1.5 py-0.5">On</span>
        )}
      </div>

      {status === 'loading' && <div className="h-12 rounded-lg bg-field-800 animate-pulse" />}

      {status === 'off' && (
        <>
          <p className="text-xs text-field-400">
            Pick reminders, who won the week, and whether you can still win — as notifications on this phone or computer.
          </p>
          <button onClick={enable} disabled={busy} className="btn-gold w-full flex items-center justify-center gap-2">
            <BellRing className="w-4 h-4" />
            {busy ? 'Turning on…' : 'Turn on notifications on this device'}
          </button>
        </>
      )}

      {status === 'on' && (
        <>
          <p className="text-xs text-field-400">
            This device will get notifications.
            {others > 0 && ` So ${others === 1 ? 'does 1 other device' : `do ${others} other devices`}.`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={test} disabled={busy} className="btn-ghost flex items-center justify-center gap-1.5 text-sm">
              <Send className="w-3.5 h-3.5" /> Send a test
            </button>
            <button onClick={disable} disabled={busy} className="btn-ghost flex items-center justify-center gap-1.5 text-sm">
              <BellOff className="w-3.5 h-3.5" /> Turn off here
            </button>
          </div>
        </>
      )}

      {status === 'ios-install' && (
        <div className="space-y-2 text-xs text-field-300">
          <p className="text-field-400">
            On iPhone, notifications work once Gridiron is on your home screen:
          </p>
          <ol className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="font-cond font-black text-gold w-3 shrink-0">1</span>
              <span>Tap the <Share className="w-3.5 h-3.5 inline -mt-0.5" /> <b className="text-white">Share</b> button in Safari</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-cond font-black text-gold w-3 shrink-0">2</span>
              <span>Choose <b className="text-white">Add to Home Screen</b></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-cond font-black text-gold w-3 shrink-0">3</span>
              <span>Open <b className="text-white">Gridiron</b> from your home screen and come back here to turn notifications on</span>
            </li>
          </ol>
          <button onClick={() => setShowInstall(true)} className="btn-ghost w-full justify-center !py-2">
            Show me how
          </button>
          {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
        </div>
      )}

      {status === 'denied' && (
        <p className="text-xs text-field-400">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings
          (the lock icon next to the address), then come back here.
        </p>
      )}

      {status === 'unsupported' && (
        <p className="text-xs text-field-400">
          This browser can&apos;t show notifications. Chrome, Edge, Firefox and Safari can —
          or on iPhone, add Gridiron to your home screen.
        </p>
      )}
    </div>
  )
}

/**
 * The Account page's notifications: this device's push, the Pick'Em
 * deadline calendar (when you're in a Pick'Em league), your reminder
 * defaults for every league — the events offered follow the kinds of
 * league you're in — and which leagues have settings of their own.
 */
export function AccountNotifications() {
  const push = usePushNotifications()
  const { data: myLeagues = [] } = useMyLeagues()
  const { data: prefRows = [] } = useNotificationPrefs()
  const clearScope = useClearLeaguePrefs()

  const kinds = [...new Set(myLeagues.map(m => (m.league?.league_type === 'pickem' ? 'pickem' : 'fantasy') as Kind))]
  const inPickem = kinds.includes('pickem')
  const overridden = myLeagues.filter(m => prefRows.some(r => r.league_id === m.league_id))

  return (
    <div className="space-y-4">
      <PhoneNotifications push={push} />
      {inPickem && <CalendarFeed />}
      <ReminderSettings kinds={kinds.length ? kinds : undefined} push={push} />
      {overridden.length > 0 && (
        <div className="panel space-y-2">
          <p className="text-xs text-field-400">These leagues have their own reminder settings, set in each league&apos;s My Settings:</p>
          {overridden.map(m => (
            <div key={m.league_id} className="flex items-center justify-between gap-3 rounded-lg bg-field-800/60 px-3 py-2">
              <span className="text-sm font-bold text-white truncate">{m.league?.name ?? 'League'}</span>
              <button
                onClick={() => clearScope.mutate(m.league_id)}
                className="flex items-center gap-1.5 text-xs font-bold text-field-400 hover:text-gold transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Use my defaults
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
