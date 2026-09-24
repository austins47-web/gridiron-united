import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useJoinLeague } from '@/hooks/useLeague'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Trophy, XCircle, PartyPopper } from 'lucide-react'

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

  // Look up the league by invite code so we can show it before joining —
  // through league_invite_preview, which only returns what an invite
  // may show (and the member count, which a non-member can't read)
  useEffect(() => {
    if (!code) return
    ;(supabase.rpc as any)('league_invite_preview', { p_code: code.toUpperCase() })
      .then(({ data, error }: { data: any[] | null; error: unknown }) => {
        const found = data?.[0]
        if (error || !found) setError('Invalid or expired invite code.')
        else setLeague(found)
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
      // Pick'Em: straight to the picks, with a welcome that explains
      // this league's rules (PickemWelcome)
      setTimeout(() => navigate(
        league?.league_type === 'pickem' ? '/app/pickem' : '/app/leagues',
        { state: league?.league_type === 'pickem' ? { welcome: league.id, memberCount: (league.member_count ?? 0) + 1 } : undefined },
      ), 1500)
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
            <XCircle className="w-10 h-10 text-red-400 mx-auto" strokeWidth={1.5} />
            <p className="text-red-400 font-bold">{error}</p>
            <button onClick={() => navigate('/')} className="btn-outline w-full">Go Home</button>
          </>
        ) : joined ? (
          <>
            <PartyPopper className="w-10 h-10 text-gold mx-auto" strokeWidth={1.5} />
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
              {(league.member_count > 0 || league.commissioner) && (
                <p className="text-field-500 text-xs mt-1">
                  {[
                    league.member_count > 0 ? `${league.member_count} member${league.member_count === 1 ? '' : 's'}` : null,
                    league.commissioner ? `run by ${league.commissioner}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
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
