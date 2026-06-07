import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import toast from 'react-hot-toast'

type Mode = 'signin' | 'signup' | 'forgot'

export function AuthPage() {
  const { user, authLoading } = useAppStore()
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' })

  if (!authLoading && user) return <Navigate to="/roster" replace />

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
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          CFB + NFL unified scoring · Real-time draft rooms · Live leaderboards
        </p>
      </div>
    </div>
  )
}
