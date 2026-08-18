import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { useLeaveLeague, useUpdateMyMembership, useLeagueMembers } from '@/hooks/useLeague'
import {
  Settings, User, Bell, Palette, LogOut, AlertCircle,
  Save, Copy, Trophy, Shield, Check,
} from 'lucide-react'
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
  // Per-league notification prefs, stored locally
  const { activeLeagueId } = useAppStore()
  const prefKey = `gu_league_prefs_${activeLeagueId}`

  const [prefs, setPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(prefKey) ?? '{}')
    } catch { return {} }
  })

  const toggle = (key: string) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem(prefKey, JSON.stringify(next))
  }

  const NOTIF_OPTS = [
    { key: 'mute_chat',    label: 'Mute chat notifications',   desc: "Don't notify me about new league chat messages" },
    { key: 'mute_trades',  label: 'Mute trade notifications',  desc: "Don't notify me about trade offers and activity" },
    { key: 'mute_waivers', label: 'Mute waiver notifications', desc: "Don't notify me about waiver claim results" },
    { key: 'mute_scoring', label: 'Mute scoring updates',      desc: "Don't notify me about live scoring changes" },
  ]

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
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={clsx(
                'flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all capitalize font-bold text-sm',
                theme === t
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-field-700 bg-field-800 text-field-400 hover:border-field-500 hover:text-white',
              )}
            >
              {theme === t && <Check className="w-3.5 h-3.5" />}
              {t} mode
            </button>
          ))}
        </div>
        <p className="text-field-500 text-xs">Applies across every league.</p>
      </div>

      {/* Notifications */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gold" />
          <h3 className="font-bold text-white text-sm">Notifications</h3>
        </div>
        <p className="text-field-400 text-xs">
          Mute specific notification types for this league only.
        </p>

        <div className="space-y-1">
          {NOTIF_OPTS.map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-start gap-3 p-3 rounded-lg bg-field-800/60 cursor-pointer hover:bg-field-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={!!prefs[key]}
                onChange={() => toggle(key)}
                className="w-4 h-4 accent-gold mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm text-white font-bold">{label}</div>
                <div className="text-xs text-field-400">{desc}</div>
              </div>
            </label>
          ))}
        </div>
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
