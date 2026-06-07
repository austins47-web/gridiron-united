import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { supabase } from '@/lib/supabase'
import { User, Camera, Shield, LogOut, Save, Trash2, AlertTriangle, X, Sun, Moon, ImageIcon } from 'lucide-react'
import { AVATAR_PRESETS, presetToDataUrl } from './AvatarPresets'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const NFL_TEAMS: { label: string; value: string }[] = [
  { label: 'Arizona Cardinals',     value: 'ARI' },
  { label: 'Atlanta Falcons',       value: 'ATL' },
  { label: 'Baltimore Ravens',      value: 'BAL' },
  { label: 'Buffalo Bills',         value: 'BUF' },
  { label: 'Carolina Panthers',     value: 'CAR' },
  { label: 'Chicago Bears',         value: 'CHI' },
  { label: 'Cincinnati Bengals',    value: 'CIN' },
  { label: 'Cleveland Browns',      value: 'CLE' },
  { label: 'Dallas Cowboys',        value: 'DAL' },
  { label: 'Denver Broncos',        value: 'DEN' },
  { label: 'Detroit Lions',         value: 'DET' },
  { label: 'Green Bay Packers',     value: 'GB'  },
  { label: 'Houston Texans',        value: 'HOU' },
  { label: 'Indianapolis Colts',    value: 'IND' },
  { label: 'Jacksonville Jaguars',  value: 'JAX' },
  { label: 'Kansas City Chiefs',    value: 'KC'  },
  { label: 'Las Vegas Raiders',     value: 'LV'  },
  { label: 'Los Angeles Chargers',  value: 'LAC' },
  { label: 'Los Angeles Rams',      value: 'LAR' },
  { label: 'Miami Dolphins',        value: 'MIA' },
  { label: 'Minnesota Vikings',     value: 'MIN' },
  { label: 'New England Patriots',  value: 'NE'  },
  { label: 'New Orleans Saints',    value: 'NO'  },
  { label: 'New York Giants',       value: 'NYG' },
  { label: 'New York Jets',         value: 'NYJ' },
  { label: 'Philadelphia Eagles',   value: 'PHI' },
  { label: 'Pittsburgh Steelers',   value: 'PIT' },
  { label: 'San Francisco 49ers',   value: 'SF'  },
  { label: 'Seattle Seahawks',      value: 'SEA' },
  { label: 'Tampa Bay Buccaneers',  value: 'TB'  },
  { label: 'Tennessee Titans',      value: 'TEN' },
  { label: 'Washington Commanders', value: 'WSH' },
]

const CFB_TEAMS = [
  'Alabama','Auburn','Georgia','LSU','Tennessee','Texas A&M','Florida','South Carolina',
  'Ohio State','Michigan','Penn State','Michigan State','Iowa','Wisconsin','Notre Dame',
  'Texas','Oklahoma','Kansas State','Baylor','TCU','Oregon','Washington','USC','Utah',
  'Clemson','Florida State','Miami','NC State','Colorado','Boise State',
]

// ── Delete Profile Modal ──────────────────────────────────────
function DeleteProfileModal({ onClose, onConfirm, deleting }: {
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed === 'DELETE'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-cond font-black text-lg uppercase tracking-wider">Delete Account</h2>
          </div>
          <button onClick={onClose} className="text-field-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 space-y-2">
          <p className="text-red-300 text-sm font-bold">This action cannot be undone.</p>
          <p className="text-field-300 text-sm">Deleting your account will permanently remove:</p>
          <ul className="text-field-400 text-xs space-y-1 ml-2">
            <li>• Your profile and all personal data</li>
            <li>• All league memberships</li>
            <li>• All Pick'Em picks and history</li>
            <li>• All messages and social connections</li>
            <li>• Your roster and draft history</li>
          </ul>
        </div>

        <div className="mb-4">
          <label className="label">Type DELETE to confirm</label>
          <input
            className="input font-mono tracking-widest"
            value={typed}
            onChange={e => setTyped(e.target.value.toUpperCase())}
            placeholder="DELETE"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || deleting}
            className={clsx(
              'flex-1 btn-danger',
              (!confirmed || deleting) && 'opacity-40 cursor-not-allowed',
            )}
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting…' : 'Delete My Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export function AccountPage() {
  const { profile, user, setProfile, signOut, theme, setTheme } = useAppStore()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    display_name:      profile?.display_name      ?? '',
    username:          profile?.username           ?? '',
    favorite_nfl_team: profile?.favorite_nfl_team ?? '',
    favorite_cfb_team: profile?.favorite_cfb_team ?? '',
  })
  const [saving, setSaving]           = useState(false)
  const [changingPw, setChangingPw]   = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [uploading, setUploading]     = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Avatar to display: local preview > saved url > initials
  const displayAvatar = avatarPreview ?? profile?.avatar_url ?? null
  const initials = (profile?.display_name || profile?.username || user?.email || '?')
    .slice(0, 2).toUpperCase()

  // ── Save profile ────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return
    if (!form.username.trim()) return toast.error('Username required')
    if (form.username.trim().length > 20) return toast.error('Username must be 20 characters or less')
    if (form.display_name.trim().length > 30) return toast.error('Display name must be 30 characters or less')
    setSaving(true)
    try {
      const clean = form.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name:      form.display_name.trim() || null,
          username:          clean,
          favorite_nfl_team: form.favorite_nfl_team || null,
          favorite_cfb_team: form.favorite_cfb_team || null,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      toast.success('Profile saved!')
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Select a preset avatar ─────────────────────────────────
  const handlePresetSelect = async (svgString: string) => {
    if (!user) return
    setShowPresetPicker(false)
    setUploading(true)
    try {
      // Convert SVG to a Blob, upload as PNG-sized SVG
      const blob = new Blob([svgString], { type: 'image/svg+xml' })
      const file = new File([blob], 'preset.svg', { type: 'image/svg+xml' })
      const path = `avatars/${user.id}.svg`
      await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: 'image/svg+xml' })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', user.id)
      setProfile({ ...profile!, avatar_url: avatarUrl })
      setAvatarPreview(null)
      toast.success('Avatar updated!')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to set avatar')
    } finally {
      setUploading(false)
    }
  }

  // ── Avatar upload ───────────────────────────────────────────
  const handleAvatarChange = async (file: File) => {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB')
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = e => setAvatarPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      // Always use the same path so upsert replaces the old file
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `avatars/${user.id}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        })
      if (upErr) throw upErr

      // Get public URL with a cache-busting query param so it reloads
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error

      setProfile(data)
      setAvatarPreview(null) // clear preview, use saved url now
      toast.success('Avatar updated!')
    } catch (e: any) {
      setAvatarPreview(null)
      toast.error(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // ── Change password ─────────────────────────────────────────
  const handleChangePassword = async () => {
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (newPassword !== confirmPw) return toast.error('Passwords do not match')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return toast.error(error.message)
    toast.success('Password changed!')
    setNewPassword('')
    setConfirmPw('')
    setChangingPw(false)
  }

  // ── Delete account ──────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!user) return
    setDeleting(true)
    try {
      // Delete profile row (cascades to league_members, picks, etc. via FK)
      const { error: profileErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id)
      if (profileErr) throw profileErr

      // Delete avatar from storage if it exists
      if (profile?.avatar_url) {
        const path = profile.avatar_url.split('/avatars/')[1]?.split('?')[0]
        if (path) {
          await supabase.storage.from('avatars').remove([`avatars/${path}`])
        }
      }

      // Sign out and delete the auth user
      await supabase.auth.signOut()
      // Note: full auth user deletion requires admin API or a DB trigger.
      // signOut + profile delete is sufficient to block access.
      setProfile(null)
      navigate('/')
      toast.success('Account deleted.')
    } catch (e: any) {
      toast.error(e.message ?? 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <h1 className="section-title">Account</h1>

      {/* ── Avatar + identity ── */}
      <div className="panel">
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-gold/40">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt="avatar"
                  className="w-full h-full object-cover"
                  // Force re-render when url changes
                  key={displayAvatar}
                />
              ) : (
                <div className="w-full h-full bg-field-700 flex items-center justify-center text-gold font-black text-2xl">
                  {initials}
                </div>
              )}
            </div>

            {/* Avatar action buttons */}
            <div className="flex flex-col gap-1 absolute -bottom-1 -right-1">
              <button
                className={clsx(
                  'bg-gold text-field-950 rounded-full p-1.5',
                  'hover:bg-gold-light transition-all hover:scale-110',
                  uploading && 'opacity-60 pointer-events-none',
                )}
                onClick={() => setShowPresetPicker(true)}
                disabled={uploading}
                title="Choose avatar"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleAvatarChange(f)
                e.target.value = '' // reset so same file can be re-selected
              }}
            />
          </div>

          <div>
            <div className="text-white font-bold text-lg leading-tight">
              {profile?.display_name || profile?.username}
            </div>
            <div className="text-field-400 text-sm">@{profile?.username}</div>
            <div className="text-field-500 text-xs mt-1">{user?.email}</div>
            <button
              onClick={() => setShowPresetPicker(true)}
              disabled={uploading}
              className="text-xs text-gold/70 hover:text-gold transition-colors mt-1.5 font-bold"
            >
              {uploading ? 'Uploading…' : 'Change avatar'}
            </button>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Username</label>
              <input
                className="input font-mono"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="coolteam"
                maxLength={20}
              />
              <div className="flex justify-between mt-1">
                <p className="text-field-500 text-xs">Lowercase, letters/numbers/underscores</p>
                <span className={clsx('text-xs font-mono', form.username.length >= 18 ? 'text-yellow-400' : 'text-field-600')}>
                  {form.username.length}/20
                </span>
              </div>
            </div>
            <div>
              <label className="label">Display Name</label>
              <input
                className="input"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="Your Name"
                maxLength={30}
              />
              <div className="flex justify-end mt-1">
                <span className={clsx('text-xs font-mono', form.display_name.length >= 27 ? 'text-yellow-400' : 'text-field-600')}>
                  {form.display_name.length}/30
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Favorite NFL Team</label>
              <select
                className="input"
                value={form.favorite_nfl_team}
                onChange={e => setForm(f => ({ ...f, favorite_nfl_team: e.target.value }))}
              >
                <option value="">— None —</option>
                {NFL_TEAMS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Favorite CFB Team</label>
              <select
                className="input"
                value={form.favorite_cfb_team}
                onChange={e => setForm(f => ({ ...f, favorite_cfb_team: e.target.value }))}
              >
                <option value="">— None —</option>
                {CFB_TEAMS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          className="btn-gold w-full mt-4"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* ── Security ── */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-gold" />
          <span className="font-bold text-white">Security</span>
        </div>
        <div className="text-sm text-field-400 mb-3">
          Signed in as <span className="text-white font-bold">{user?.email}</span>
        </div>

        {!changingPw ? (
          <button className="btn-outline" onClick={() => setChangingPw(true)}>
            Change Password
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">New Password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              />
            </div>
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1"
                onClick={() => { setChangingPw(false); setNewPassword(''); setConfirmPw('') }}
              >
                Cancel
              </button>
              <button className="btn-gold flex-1" onClick={handleChangePassword}>
                Update Password
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Account info ── */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-gold" />
          <span className="font-bold text-white">Account Info</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['Member Since', profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : '—'],
            ['User ID', (user?.id?.slice(0, 8) ?? '—') + '…'],
          ].map(([label, value]) => (
            <div key={label} className="bg-field-800 rounded-lg p-2.5">
              <div className="text-field-400 text-xs mb-0.5">{label}</div>
              <div className="text-white font-mono text-xs">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-4">
          {theme === 'light' ? <Sun className="w-4 h-4 text-gold" /> : <Moon className="w-4 h-4 text-gold" />}
          <span className="font-cond font-black text-sm uppercase tracking-wider text-white">Appearance</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Dark mode */}
          <button
            onClick={() => setTheme('dark')}
            className={clsx(
              'relative flex flex-col items-center gap-3 rounded-xl border-2 p-4 transition-all',
              theme === 'dark'
                ? 'border-gold bg-gold/10'
                : 'border-field-600 bg-field-700/50 hover:border-field-500'
            )}
          >
            {/* Dark preview */}
            <div className="w-full rounded-lg overflow-hidden border border-field-600 shadow-sm">
              <div className="h-4 bg-field-950 flex items-center px-2 gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-field-600" />
                <div className="w-8 h-1.5 rounded bg-field-700" />
              </div>
              <div className="h-10 bg-field-900 p-1.5 flex gap-1">
                <div className="w-1/3 h-full rounded bg-field-800 border border-field-700" />
                <div className="flex-1 h-full rounded bg-field-800 border border-field-700" />
              </div>
              <div className="h-3 bg-field-900 flex items-center px-1.5 gap-1">
                <div className="w-4 h-1 rounded bg-gold/60" />
                <div className="w-3 h-1 rounded bg-field-700" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-field-300" />
              <span className={clsx('font-cond font-bold text-sm uppercase tracking-wider',
                theme === 'dark' ? 'text-gold' : 'text-field-300')}>
                Dark
              </span>
            </div>
            {theme === 'dark' && (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-field-950" />
              </div>
            )}
          </button>

          {/* Light mode */}
          <button
            onClick={() => setTheme('light')}
            className={clsx(
              'relative flex flex-col items-center gap-3 rounded-xl border-2 p-4 transition-all',
              theme === 'light'
                ? 'border-gold bg-gold/10'
                : 'border-field-600 bg-field-700/50 hover:border-field-500'
            )}
          >
            {/* Light preview */}
            <div className="w-full rounded-lg overflow-hidden border border-gray-300 shadow-sm">
              <div className="h-4 bg-white flex items-center px-2 gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <div className="w-8 h-1.5 rounded bg-gray-200" />
              </div>
              <div className="h-10 bg-gray-100 p-1.5 flex gap-1">
                <div className="w-1/3 h-full rounded bg-white border border-gray-200" />
                <div className="flex-1 h-full rounded bg-white border border-gray-200" />
              </div>
              <div className="h-3 bg-gray-100 flex items-center px-1.5 gap-1">
                <div className="w-4 h-1 rounded" style={{ background: '#e8950e', opacity: 0.8 }} />
                <div className="w-3 h-1 rounded bg-gray-300" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-field-300" />
              <span className={clsx('font-cond font-bold text-sm uppercase tracking-wider',
                theme === 'light' ? 'text-gold' : 'text-field-300')}>
                Light
              </span>
            </div>
            {theme === 'light' && (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-field-950" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ── Sign out ── */}
      <button className="btn-danger w-full" onClick={signOut}>
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>

      {/* ── Danger Zone ── */}
      <div className="panel border-red-500/20 bg-red-500/[0.03]">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="font-bold text-red-400">Danger Zone</span>
        </div>
        <p className="text-field-400 text-sm mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          className="btn-danger"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <DeleteProfileModal
          onClose={() => setShowDelete(false)}
          onConfirm={handleDeleteAccount}
          deleting={deleting}
        />
      )}

      {/* Avatar preset picker modal */}
      {showPresetPicker && (
        <div className="modal-overlay" onClick={() => setShowPresetPicker(false)}>
          <div className="modal-box w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-cond font-black text-lg uppercase tracking-wider text-white">
                Choose Avatar
              </h3>
              <button onClick={() => setShowPresetPicker(false)} className="text-field-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preset grid */}
            <div className="mb-5">
              <p className="text-xs text-field-400 uppercase tracking-wider font-bold mb-3">Preset Avatars</p>
              <div className="grid grid-cols-6 gap-3">
                {AVATAR_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset.svg)}
                    className="flex flex-col items-center gap-1.5 group"
                    title={preset.label}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-transparent group-hover:ring-gold/60 transition-all group-hover:scale-110">
                      <img
                        src={presetToDataUrl(preset.svg)}
                        alt={preset.label}
                        className="w-full h-full"
                      />
                    </div>
                    <span className="text-[10px] text-field-500 group-hover:text-field-300 transition-colors leading-none text-center">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-field-700" />
              <span className="text-xs text-field-500 font-bold uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-field-700" />
            </div>

            {/* Upload custom */}
            <button
              onClick={() => { setShowPresetPicker(false); fileRef.current?.click() }}
              className="w-full flex items-center justify-center gap-2 btn-ghost py-3"
            >
              <Camera className="w-4 h-4" />
              Upload your own photo
            </button>
            <p className="text-xs text-field-500 text-center mt-2">JPEG, PNG, GIF or WebP · Max 5MB</p>
          </div>
        </div>
      )}
    </div>
  )
}
