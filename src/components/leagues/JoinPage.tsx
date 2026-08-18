import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useJoinLeague } from '@/hooks/useLeague'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Trophy } from 'lucide-react'

export function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user, authLoading } = useAppStore()
  const joinLeague = useJoinLeague()
  const [league, setLeague] = useState<any>(null)
  const [checking, setChecking] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  // Look up the league by invite code so we can show its name before joining
  useEffect(() => {
    if (!code) return
    supabase
      .from('leagues')
      .select('id, name, num_teams, league_type, scoring_type, draft_type')
      .eq('invite_code', code.toUpperCase())
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError('Invalid or expired invite code.')
        else setLeague(data)
        setChecking(false)
      })
  }, [code])

  // Once auth resolves and we have league info, auto-join if user is logged in
  useEffect(() => {
    if (authLoading || checking || !league || !user || joining || joined) return
    handleJoin()
  }, [authLoading, checking, league, user])

  async function handleJoin() {
    if (!code) return
    setJoining(true)
    try {
      await joinLeague.mutateAsync(code.toUpperCase())
      setJoined(true)
      setTimeout(() => navigate('/app/leagues'), 1500)
    } catch (e: any) {
      setError(e.message ?? 'Could not join league.')
    } finally {
      setJoining(false)
    }
  }

  if (authLoading || checking) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-field-950 flex items-center justify-center p-4">
      <div className="bg-field-800 border border-field-600 rounded-2xl p-8 w-full max-w-sm text-center space-y-5 shadow-2xl">

        {/* Logo */}
        <div className="font-cond font-black text-2xl uppercase tracking-wider">
          <span className="text-gold">Gridiron</span><span className="text-white"> United</span>
        </div>

        {error ? (
          <>
            <div className="text-4xl">❌</div>
            <p className="text-red-400 font-bold">{error}</p>
            <button onClick={() => navigate('/')} className="btn-outline w-full">Go Home</button>
          </>
        ) : joined ? (
          <>
            <div className="text-4xl">🎉</div>
            <p className="text-white font-bold text-lg">You joined <span className="text-gold">{league?.name}</span>!</p>
            <p className="text-field-400 text-sm">Taking you to your leagues…</p>
          </>
        ) : league ? (
          <>
            <Trophy className="w-10 h-10 text-gold mx-auto" />
            <div>
              <p className="text-field-400 text-sm uppercase tracking-wider font-bold mb-1">You're invited to</p>
              <h1 className="text-white font-black text-2xl">{league.name}</h1>
              <p className="text-field-400 text-sm mt-1 capitalize">
                {league.league_type === 'pickem' ? "Pick'Em League" : `${league.scoring_type?.toUpperCase()} · ${league.draft_type} draft`}
              </p>
            </div>

            {user ? (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="btn-gold w-full py-3 text-base"
              >
                {joining ? 'Joining…' : 'Join League'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-field-400 text-sm">Sign in or create an account to join.</p>
                <button
                  onClick={() => navigate(`/auth?redirect=/join/${code}`)}
                  className="btn-gold w-full py-3 text-base"
                >
                  Sign In to Join
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
