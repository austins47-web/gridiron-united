import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { useLeaveLeague, useUpdateMyMembership, useLeagueMembers } from '@/hooks/useLeague'
import {
  Settings, User, Bell, Palette, LogOut, AlertCircle,
  Save, Copy, Trophy, Shield, Check, Mail, RotateCcw, Globe,
} from 'lucide-react'
import {
  useNotificationPrefs, useSaveNotificationPrefs, useClearLeaguePrefs, resolvePrefs,
} from '@/hooks/useNotificationPrefs'
import clsx from 'clsx'
import toast from 'react-hot-toast'

type Tab = 'team' | 'preferences' | 'league' | 'danger'

export function LeagueSettingsView() {
  const { activeLeague, activeLeagueId, myMembership, theme, setTheme } = useAppStore()
  const [tab, setTab] = useState<Tab>('team')

  if (!activeLeagueId || !activeLeague || !myMembership) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Settings className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select a league to manage your settings.</p>
      </div>
    )
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'team',        label: 'My Team',    icon: <User className="w-4 h-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Palette className="w-4 h-4" /> },
    { id: 'league',      label: 'League Info', icon: <Trophy className="w-4 h-4" /> },
    { id: 'danger',      label: 'Leave',      icon: <LogOut className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-gold" />
        <div>
          <h1 className="section-title !mb-0">My Settings</h1>
          <p className="text-field-400 text-sm">{activeLeague.name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-field-700 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === t.id
                ? t.id === 'danger'
                  ? 'border-red-400 text-red-400'
                  : 'border-gold text-gold'
                : 'border-transparent text-field-400 hover:text-white',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team'        && <TeamSettings />}
      {tab === 'preferences' && <PreferencesSettings theme={theme} setTheme={setTheme} />}
      {tab === 'league'      && <LeagueInfo />}
      {tab === 'danger'      && <LeaveLeague />}
    </div>
  )
}

// ─── My Team ─────────────────────────────────────────────────────────
function TeamSettings() {
  const { activeLeagueId, activeLeague, myMembership } = useAppStore()
  const updateMembership = useUpdateMyMembership()

  const [teamName, setTeamName] = useState(myMembership?.team_name ?? '')

  useEffect(() => {
    setTeamName(myMembership?.team_name ?? '')
  }, [myMembership?.team_name])

  const dirty = teamName.trim() !== (myMembership?.team_name ?? '')
  const tooLong = teamName.length > 30
  const empty = teamName.trim().length === 0

  const save = () => {
    if (empty)   return toast.error('Team name cannot be empty')
    if (tooLong) return toast.error('Team name must be 30 characters or less')
    updateMembership.mutate({
      leagueId: activeLeagueId!,
      updates: { team_name: teamName.trim() },
    })
  }

  const isPickem = activeLeague?.league_type === 'pickem'

  return (
    <div className="space-y-4">
      {/* Team name */}
      <div className="panel space-y-3">
        <div>
          <h3 className="font-bold text-white text-sm">Team Name</h3>
          <p className="text-field-400 text-xs mt-0.5">
            How your team appears in standings, chat, and matchups.
          </p>
        </div>

        <div>
          <input
            className="input"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && dirty && save()}
            placeholder="My Team"
            maxLength={40}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-field-500">
              {empty ? 'Name required' : ''}
            </span>
            <span className={clsx(
              'text-xs font-mono',
              teamName.length > 30 ? 'text-red-400' : teamName.length >= 25 ? 'text-gold' : 'text-field-600'
            )}>
              {teamName.length}/30
            </span>
          </div>
        </div>

        <button
          onClick={save}
          disabled={!dirty || empty || tooLong || updateMembership.isPending}
          className={clsx('btn-gold', (!dirty || empty || tooLong) && 'opacity-40 pointer-events-none')}
        >
          <Save className="w-4 h-4" />
          {updateMembership.isPending ? 'Saving…' : 'Save Team Name'}
        </button>
      </div>

      {/* Read-only record */}
      {!isPickem && (
        <div className="panel">
          <h3 className="font-bold text-white text-sm mb-3">Your Record</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Record', `${myMembership?.wins ?? 0}-${myMembership?.losses ?? 0}${(myMembership?.ties ?? 0) > 0 ? `-${myMembership?.ties}` : ''}`],
              ['Points For', (myMembership?.points_for ?? 0).toFixed(1)],
              ['Draft Pick', myMembership?.draft_position ? `#${myMembership.draft_position}` : '—'],
              ['Waiver', myMembership?.waiver_priority ? `#${myMembership.waiver_priority}` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-field-800/60 rounded-lg p-3">
                <div className="text-field-400 text-xs mb-1">{label}</div>
                <div className="text-white font-bold">{value}</div>
              </div>
            ))}
          </div>
          <p className="text-field-500 text-xs mt-3">
            Only your commissioner can change your record, draft position, or waiver priority.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Preferences ─────────────────────────────────────────────────────
function PreferencesSettings({ theme, setTheme }: { theme: 'dark' | 'light'; setTheme: (t: 'dark' | 'light') => void }) {
  const { activeLeagueId, activeLeague } = useAppStore()
  const { data: prefRows = [], isLoading } = useNotificationPrefs()
  const savePrefs  = useSaveNotificationPrefs()
  const clearScope = useClearLeaguePrefs()

  // 'global' edits the account-wide default; 'league' overrides this league
  const [scope, setScope] = useState<'global' | 'league'>('global')
  const leagueId = scope === 'league' ? activeLeagueId : null

  const eff = resolvePrefs(prefRows, leagueId)
  const hasOverride = prefRows.some(r => r.league_id === activeLeagueId)

  const set = (key: string, value: any) =>
    savePrefs.mutate({ leagueId, updates: { [key]: value } })

  const isPickem = activeLeague?.league_type === 'pickem'

  const EVENTS = [
    { key: 'notify_pickem_deadline', label: 'Pick deadlines',   desc: 'When your picks are about to lock', show: isPickem },
    { key: 'notify_draft',           label: 'Draft starting',   desc: 'Before your draft begins',          show: !isPickem },
    { key: 'notify_on_the_clock',    label: "You're on the clock", desc: 'When it becomes your pick',      show: !isPickem },
    { key: 'notify_trades',          label: 'Trade offers',     desc: 'New offers and ones about to expire', show: !isPickem },
    { key: 'notify_lineup',          label: 'Lineup not set',   desc: 'Before kickoff if your lineup is empty', show: !isPickem },
    { key: 'notify_weekly_recap',    label: 'Weekly recap',     desc: 'A summary once the week wraps',     show: true },
  ].filter(e => e.show)

  return (
    <div className="space-y-4">
      {/* Theme */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-white text-sm">Appearance</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['dark', 'light'] as const).map(t => (
            <button key={t} onClick={() => setTheme(t)}
              className={clsx(
                'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all capitalize font-bold text-sm',
                theme === t
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-field-700 bg-field-800 text-field-400 hover:border-field-500 hover:text-white',
              )}>
              {theme === t && <Check className="w-3.5 h-3.5" />}
              {t} mode
            </button>
          ))}
        </div>
        <p className="text-field-500 text-xs">Applies across every league.</p>
      </div>

      {/* Email reminders */}
      <div className="panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-gold" />
            <h3 className="font-bold text-white text-sm">Email Reminders</h3>
          </div>
          {savePrefs.isPending && (
            <span className="text-xs text-field-500">Saving…</span>
          )}
        </div>

        {/* Scope switch */}
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
            ? 'Your default for every league you\'re in.'
            : hasOverride
              ? 'This league overrides your global settings.'
              : 'Currently following your global settings. Changing anything here creates an override for this league only.'}
        </p>

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
                  Turn this off to stop all reminder emails {scope === 'league' ? 'for this league' : 'everywhere'}.
                </div>
              </div>
            </label>

            {/* Per-event toggles */}
            <div className={clsx('space-y-1 transition-opacity', !eff.email_enabled && 'opacity-40 pointer-events-none')}>
              {EVENTS.map(({ key, label, desc }) => (
                <label key={key}
                  className="flex items-start gap-3 p-3 rounded-lg bg-field-800/60 cursor-pointer hover:bg-field-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={(eff as any)[key]}
                    onChange={e => set(key, e.target.checked)}
                    className="w-4 h-4 accent-gold mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-white font-bold">{label}</div>
                    <div className="text-xs text-field-400">{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Lead time */}
            <div className={clsx('space-y-1.5 transition-opacity', !eff.email_enabled && 'opacity-40 pointer-events-none')}>
              <label className="text-sm text-field-300">How early should we warn you?</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[6, 12, 24, 48].map(h => (
                  <button key={h} onClick={() => set('lead_hours_primary', h)}
                    className={clsx(
                      'py-2 rounded-lg text-xs font-bold transition-all',
                      eff.lead_hours_primary === h
                        ? 'bg-gold text-field-950'
                        : 'bg-field-700 text-field-300 hover:bg-field-600',
                    )}>
                    {h}h
                  </button>
                ))}
              </div>
              <p className="text-xs text-field-500">
                You'll also get a final nudge {eff.lead_hours_secondary}h before.
              </p>
            </div>

            {/* Reset override */}
            {scope === 'league' && hasOverride && (
              <button
                onClick={() => { clearScope.mutate(activeLeagueId!); setScope('global') }}
                className="flex items-center gap-1.5 text-xs font-bold text-field-400 hover:text-gold transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to my global settings
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── League Info (read-only) ─────────────────────────────────────────
function LeagueInfo() {
  const { activeLeague, activeLeagueId } = useAppStore()
  const { data: members = [] } = useLeagueMembers(activeLeagueId)
  const league = activeLeague!
  const isPickem = league.league_type === 'pickem'

  const copyInvite = () => {
    navigator.clipboard.writeText(league.invite_code)
    toast.success('Invite code copied!')
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h3 className="font-bold text-white text-sm mb-3">League Details</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            ['Name', league.name],
            ['Format', isPickem ? "Pick'Em" : league.scoring_type?.toUpperCase()],
            ...(!isPickem ? [['Draft', league.draft_type]] as [string, string][] : []),
            ['Members', `${members.length} / ${league.num_teams}`],
            ['Season', String(league.season ?? 2026)],
            ['Status', league.draft_status],
          ].map(([label, value]) => (
            <div key={label} className="bg-field-800/60 rounded-lg p-3">
              <div className="text-field-400 text-xs mb-1">{label}</div>
              <div className="text-white font-bold capitalize truncate">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite code — any member can share */}
      <div className="panel flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-field-400 uppercase tracking-wider mb-1">Invite Code</div>
          <div className="text-gold font-black text-xl tracking-widest font-mono">{league.invite_code}</div>
          <div className="text-field-500 text-xs mt-1">Share this so friends can join</div>
        </div>
        <button className="btn-ghost !py-2 !px-3 text-sm shrink-0" onClick={copyInvite}>
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>

      {/* Member list */}
      <div className="panel">
        <h3 className="font-bold text-white text-sm mb-3">Members ({members.length})</h3>
        <div className="space-y-1">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 py-2 border-b border-field-700/50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-field-700 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                {(m.profile?.display_name || m.profile?.username || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white font-bold truncate flex items-center gap-1.5">
                  {m.team_name || 'Unnamed Team'}
                  {m.is_commissioner && <Shield className="w-3 h-3 text-gold shrink-0" />}
                </div>
                <div className="text-xs text-field-400 truncate">
                  {m.profile?.display_name || m.profile?.username}
                </div>
              </div>
              <div className="text-xs text-field-400 shrink-0">
                {m.wins}-{m.losses}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Leave League ────────────────────────────────────────────────────
function LeaveLeague() {
  const { activeLeague, activeLeagueId, myMembership } = useAppStore()
  const leaveLeague = useLeaveLeague()
  const { data: members = [] } = useLeagueMembers(activeLeagueId)
  const [confirmText, setConfirmText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const league = activeLeague!
  const isCommissioner = myMembership?.is_commissioner
  const commishCount = members.filter((m: any) => m.is_commissioner).length
  const isOnlyCommish = isCommissioner && commishCount <= 1

  const canLeave = confirmText.trim().toUpperCase() === 'LEAVE'

  return (
    <div className="space-y-4">
      {isOnlyCommish && (
        <div className="panel border border-gold/30 bg-gold/5 flex gap-3">
          <AlertCircle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-white">You're the only commissioner</div>
            <p className="text-xs text-field-300 mt-1 leading-relaxed">
              You can't leave while you're the sole commissioner. Promote another member
              to commissioner from the Commissioner panel first, or delete the league entirely.
            </p>
          </div>
        </div>
      )}

      <div className="panel border border-red-500/30 bg-red-500/5 space-y-4">
        <div className="flex items-center gap-2">
          <LogOut className="w-4 h-4 text-red-400" />
          <h3 className="font-bold text-red-400 text-sm uppercase tracking-wider">Leave League</h3>
        </div>

        <div className="space-y-2 text-sm text-field-300">
          <p>
            Leaving <span className="text-white font-bold">"{league.name}"</span> will:
          </p>
          <ul className="space-y-1.5 text-xs">
            {[
              'Remove you from the standings and member list',
              'Drop every player from your roster back into the pool',
              'Delete your draft picks and lineup history',
              'Remove your access to league chat and trades',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-red-300 text-xs font-bold pt-1">
            This cannot be undone. You'd need a new invite to rejoin.
          </p>
        </div>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={isOnlyCommish}
            className={clsx(
              'flex items-center gap-2 text-sm font-bold border px-4 py-2 rounded-lg transition-colors',
              isOnlyCommish
                ? 'text-field-500 border-field-600 cursor-not-allowed opacity-50'
                : 'text-red-400 border-red-400/40 hover:bg-red-400/10',
            )}
          >
            <LogOut className="w-4 h-4" />
            Leave League
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">
                Type <span className="text-red-400 font-mono">LEAVE</span> to confirm
              </label>
              <input
                className="input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="LEAVE"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1"
                onClick={() => { setConfirming(false); setConfirmText('') }}
              >
                Cancel
              </button>
              <button
                disabled={!canLeave || leaveLeague.isPending}
                onClick={() => leaveLeague.mutate(activeLeagueId!)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 font-bold text-white px-4 py-2 rounded-lg transition-colors',
                  canLeave && !leaveLeague.isPending
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-field-700 text-field-500 cursor-not-allowed',
                )}
              >
                <LogOut className="w-4 h-4" />
                {leaveLeague.isPending ? 'Leaving…' : 'Confirm Leave'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
