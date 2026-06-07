import { useState, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { supabase } from '@/lib/supabase'
import { User, Camera, Shield, LogOut, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// label → stored abbreviation
const NFL_TEAMS: { label: string; value: string }[] = [
  { label: 'Arizona Cardinals',    value: 'ARI' },
  { label: 'Atlanta Falcons',      value: 'ATL' },
  { label: 'Baltimore Ravens',     value: 'BAL' },
  { label: 'Buffalo Bills',        value: 'BUF' },
  { label: 'Carolina Panthers',    value: 'CAR' },
  { label: 'Chicago Bears',        value: 'CHI' },
  { label: 'Cincinnati Bengals',   value: 'CIN' },
  { label: 'Cleveland Browns',     value: 'CLE' },
  { label: 'Dallas Cowboys',       value: 'DAL' },
  { label: 'Denver Broncos',       value: 'DEN' },
  { label: 'Detroit Lions',        value: 'DET' },
  { label: 'Green Bay Packers',    value: 'GB'  },
  { label: 'Houston Texans',       value: 'HOU' },
  { label: 'Indianapolis Colts',   value: 'IND' },
  { label: 'Jacksonville Jaguars', value: 'JAX' },
  { label: 'Kansas City Chiefs',   value: 'KC'  },
  { label: 'Las Vegas Raiders',    value: 'LV'  },
  { label: 'Los Angeles Chargers', value: 'LAC' },
  { label: 'Los Angeles Rams',     value: 'LAR' },
  { label: 'Miami Dolphins',       value: 'MIA' },
  { label: 'Minnesota Vikings',    value: 'MIN' },
  { label: 'New England Patriots', value: 'NE'  },
  { label: 'New Orleans Saints',   value: 'NO'  },
  { label: 'New York Giants',      value: 'NYG' },
  { label: 'New York Jets',        value: 'NYJ' },
  { label: 'Philadelphia Eagles',  value: 'PHI' },
  { label: 'Pittsburgh Steelers',  value: 'PIT' },
  { label: 'San Francisco 49ers',  value: 'SF'  },
  { label: 'Seattle Seahawks',     value: 'SEA' },
  { label: 'Tampa Bay Buccaneers', value: 'TB'  },
  { label: 'Tennessee Titans',     value: 'TEN' },
  { label: 'Washington Commanders',value: 'WSH' },
]

const CFB_TEAMS = [
  'Alabama','Auburn','Georgia','LSU','Tennessee','Texas A&M','Florida','South Carolina',
  'Ohio State','Michigan','Penn State','Michigan State','Iowa','Wisconsin','Notre Dame',
  'Texas','Oklahoma','Kansas State','Baylor','TCU','Oregon','Washington','USC','Utah',
  'Clemson','Florida State','Miami','NC State','Colorado','Boise State',
]

export function AccountPage() {
  const { profile, user, setProfile, signOut } = useAppStore()
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? '',
    username: profile?.username ?? '',
    favorite_nfl_team: profile?.favorite_nfl_team ?? '',
    favorite_cfb_team: profile?.favorite_cfb_team ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSaveProfile = async () => {
    if (!user) return
    if (!form.username.trim()) return toast.error('Username required')
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: form.display_name.trim() || null,
          username: form.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
          favorite_nfl_team: form.favorite_nfl_team || null,
          favorite_cfb_team: form.favorite_cfb_team || null,
          updated_at: new Date().toISOString(),
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

  const handleAvatarUpload = async (file: File) => {
    if (!user) return
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB')
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = urlData.publicUrl

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      toast.success('Avatar updated!')
    } catch (e: any) {
      toast.error(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return toast.error(error.message)
    toast.success('Password changed!')
    setNewPassword('')
    setConfirmPassword('')
    setChangingPw(false)
  }

  const initials = (profile?.display_name || profile?.username || user?.email || '?')
    .slice(0, 2).toUpperCase()

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <h1 className="section-title">Account</h1>

      {/* Avatar + identity */}
      <div className="panel">
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover ring-2 ring-gold/30"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-field-700 ring-2 ring-gold/30 flex items-center justify-center text-gold font-black text-xl">
                {initials}
              </div>
            )}
            <button
              className="absolute -bottom-1 -right-1 bg-gold text-field-950 rounded-full p-1 hover:bg-gold/80 transition-colors"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Change avatar"
            >
              <Camera className="w-3 h-3" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleAvatarUpload(f)
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <div className="text-white font-bold text-lg">{profile?.display_name || profile?.username}</div>
            <div className="text-field-400 text-sm">@{profile?.username}</div>
            <div className="text-field-500 text-xs mt-1">{user?.email}</div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Username</label>
              <input
                className="input font-mono"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="coolteam"
              />
              <p className="text-field-500 text-xs mt-1">Lowercase, letters/numbers/underscores</p>
            </div>
            <div>
              <label className="label">Display Name</label>
              <input
                className="input"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="Your Name"
              />
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
                {NFL_TEAMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
                {CFB_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button
          className="btn-gold w-full mt-4"
          onClick={handleSaveProfile}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* Security */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-gold" />
          <span className="font-bold text-white">Security</span>
        </div>

        <div className="text-sm text-field-400 mb-3">
          Signed in as <span className="text-white">{user?.email}</span>
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
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => { setChangingPw(false); setNewPassword(''); setConfirmPassword('') }}>
                Cancel
              </button>
              <button className="btn-gold flex-1" onClick={handleChangePassword}>
                Update Password
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="panel">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-gold" />
          <span className="font-bold text-white">Account Info</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['Member Since', profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'],
            ['User ID', user?.id?.slice(0, 8) + '…'],
          ].map(([label, value]) => (
            <div key={label} className="bg-field-800 rounded p-2">
              <div className="text-field-400 text-xs">{label}</div>
              <div className="text-white font-mono text-xs mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <button
        className="btn-danger w-full"
        onClick={signOut}
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  )
}
