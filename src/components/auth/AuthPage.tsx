import { useState, useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import toast from 'react-hot-toast'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset'

// Two independent ways to detect a recovery link, because relying
// on only one is genuinely unsafe here. Supabase's client parses
// recovery tokens and fires PASSWORD_RECOVERY as part of its own
// init sequence — which can run before this component ever mounts
// and subscribes a listener, and onAuthStateChange never replays
// events to a subscriber that arrives late. Checking the URL
// directly on first render is synchronous and doesn't have that
// race. Kept both: the URL check catches the common case, the
// event listener catches it if the URL's tokens haven't been
// parsed yet when this mounts.
function isRecoveryUrl(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  const hashParams = new URLSearchParams(hash)
  const search = new URLSearchParams(window.location.search)
  return hashParams.get('type') === 'recovery' || search.get('type') === 'recovery'
}

export function AuthPage() {
  const { user, authLoading } = useAppStore()
  const [searchParams] = useSearchParams()
  const initialMode = isRecoveryUrl()
    ? 'reset'
    : ((searchParams.get('mode') === 'signup' ? 'signup' : 'signin') as Mode)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Backup path: if the URL's recovery tokens hadn't been parsed
  // into the URL yet at mount time (or already got stripped from
  // the address bar — Supabase does this via history.replaceState
  // right after reading them), this catches the event when it
  // actually fires instead.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset')
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // The recovery link DOES establish a real (temporary) session, so
  // `user` is already truthy at this point — this guard used to fire
  // unconditionally and redirect straight to the app before the
  // reset form below ever had a chance to render. Recovery mode has
  // to be excluded from it explicitly.
  if (!authLoading && user && mode !== 'reset') return <Navigate to="/app/leagues" replace />

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    if (error) toast.error(error.message)
    setLoading(false)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!form.username.trim()) { toast.error('Username required'); return }
    if (form.username.length < 3) { toast.error('Username must be 3+ characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          username: form.username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          display_name: form.displayName || form.username,
        },
      },
    })
    if (error) toast.error(error.message)
    else toast.success('Account created! Check your email to confirm.')
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/auth`,
    })
    if (error) toast.error(error.message)
    else toast.success('Password reset link sent!')
    setLoading(false)
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { toast.error('Password must be 8+ characters'); return }
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return }
    setLoading(true)
    // The recovery session from the email link is already active at
    // this point, so this both sets the new password AND leaves the
    // person signed in — no need to make them log in again after.
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) toast.error(error.message)
    else toast.success('Password updated!')
    setLoading(false)
    // Navigate away from /auth regardless of mode state — updateUser
    // succeeding means `user` is now genuinely, permanently set, so
    // this sends them into the app instead of leaving them stuck on
    // a reset form with nothing left to do.
    if (!error) window.location.href = '/app/leagues'
  }

  return (
    <div className="min-h-screen bg-field-900 flex items-center justify-center p-4"
         style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgba(245,197,24,.025) calc(10% - 1px), rgba(245,197,24,.025) 10%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-cond font-black text-4xl uppercase tracking-wider text-gold mb-1">
            Gridiron <span className="text-gray-100 font-normal">United</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="font-cond font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-cfb/15 text-cfb">CFB</span>
            <span className="font-cond font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-nfl/15 text-nfl">NFL</span>
          </div>
          <p className="text-gray-500 text-sm">College + Pro fantasy football unified</p>
        </div>

        <div className="panel">
          {/* Mode tabs */}
          {/* Mode tabs — hidden during password recovery, since
              switching to Sign In / Create Account mid-recovery
              would abandon the reset flow with no way back to it. */}
          {mode !== 'reset' && (
          <div className="flex gap-1 mb-6 bg-field-700 rounded-lg p-1">
            {(['signin', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded font-cond font-bold text-sm uppercase tracking-wider transition-all
                  ${mode === m ? 'bg-gold text-field-900' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
          )}

          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={update('email')}
                  placeholder="your@email.com" required />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={form.password} onChange={update('password')}
                  placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} className="btn-gold w-full py-3">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <button type="button" onClick={() => setMode('forgot')}
                className="w-full text-center text-sm text-gray-500 hover:text-gold transition-colors">
                Forgot password?
              </button>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Username</label>
                  <input className="input" type="text" value={form.username} onChange={update('username')}
                    placeholder="gridironking" required minLength={3} maxLength={20} />
                </div>
                <div>
                  <label className="label">Display Name</label>
                  <input className="input" type="text" value={form.displayName} onChange={update('displayName')}
                    placeholder="John D." maxLength={40} />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={update('email')}
                  placeholder="your@email.com" required />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={form.password} onChange={update('password')}
                  placeholder="8+ characters" required minLength={8} />
              </div>
              <button type="submit" disabled={loading} className="btn-gold w-full py-3">
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-gray-400">Enter your email and we'll send a reset link.</p>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={update('email')}
                  placeholder="your@email.com" required />
              </div>
              <button type="submit" disabled={loading} className="btn-gold w-full py-3">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setMode('signin')}
                className="w-full text-center text-sm text-gray-500 hover:text-gold transition-colors">
                ← Back to sign in
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-sm text-gray-400">Choose a new password for your account.</p>
              <div>
                <label className="label">New Password</label>
                <input className="input" type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="8+ characters" required minLength={8} />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input className="input" type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="8+ characters" required minLength={8} />
              </div>
              <button type="submit" disabled={loading} className="btn-gold w-full py-3">
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          CFB + NFL unified scoring · Real-time draft rooms · Live leaderboards
        </p>
      </div>
    </div>
  )
}
