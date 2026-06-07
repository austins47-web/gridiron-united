import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { X, Trophy, Star, Users } from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────

interface UserProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  favorite_nfl_team: string | null
  favorite_cfb_team: string | null
  created_at: string
}

interface LeagueRecord {
  id: string
  name: string
  team_name: string
  wins: number
  losses: number
  points_for: number
  is_commissioner: boolean
}

// ── Avatar ────────────────────────────────────────────────────

function ProfileAvatar({ profile, size = 'lg' }: { profile: UserProfile; size?: 'md' | 'lg' | 'xl' }) {
  const dims = { md: 'w-12 h-12 text-base', lg: 'w-16 h-16 text-xl', xl: 'w-20 h-20 text-2xl' }
  const initials = (profile.display_name || profile.username || '?').slice(0, 2).toUpperCase()
  return profile.avatar_url ? (
    <img src={profile.avatar_url} alt={initials}
      className={clsx(dims[size], 'rounded-full object-cover ring-2 ring-gold/40 shrink-0')} />
  ) : (
    <div className={clsx(dims[size], 'rounded-full bg-field-700 ring-2 ring-gold/40 flex items-center justify-center font-black text-gold shrink-0')}>
      {initials}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────

export function UserProfileModal({ username, onClose }: {
  username: string
  onClose: () => void
}) {
  const { user: me, activeLeagueId } = useAppStore()

  // Fetch the profile by username
  const { data: profile, isLoading, error } = useQuery<UserProfile | null>({
    queryKey: ['profile-by-username', username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, favorite_nfl_team, favorite_cfb_team, created_at')
        .eq('username', username.toLowerCase())
        .single()
      if (error) return null
      return data as UserProfile
    },
  })

  // Fetch their shared leagues
  const { data: sharedLeagues = [] } = useQuery<LeagueRecord[]>({
    queryKey: ['shared-leagues', profile?.id, me?.id],
    enabled: !!profile?.id && !!me?.id,
    queryFn: async () => {
      // Get leagues they're in
      const { data: theirLeagues } = await supabase
        .from('league_members')
        .select('league_id, team_name, wins, losses, points_for, is_commissioner, league:leagues(id, name)')
        .eq('user_id', profile!.id)

      // Get leagues I'm in
      const { data: myLeagues } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', me!.id)

      const myLeagueIds = new Set((myLeagues ?? []).map((m: any) => m.league_id))

      return (theirLeagues ?? [])
        .filter((m: any) => myLeagueIds.has(m.league_id))
        .map((m: any) => ({
          id: (m.league as any)?.id,
          name: (m.league as any)?.name,
          team_name: m.team_name,
          wins: m.wins,
          losses: m.losses,
          points_for: m.points_for,
          is_commissioner: m.is_commissioner,
        }))
    },
  })

  // Fetch their roster in the current active league
  const { data: roster = [] } = useQuery({
    queryKey: ['chat-user-roster', profile?.id, activeLeagueId],
    enabled: !!profile?.id && !!activeLeagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('rosters')
        .select('slot, player:players(id, name, pos, team, league, avg_pts, proj_pts)')
        .eq('user_id', profile!.id)
        .eq('league_id', activeLeagueId!)
        .eq('week', 0)
        .order('slot')
      return (data ?? []) as { slot: string; player: any }[]
    },
  })

  const starters = roster.filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS'))
  const benchSlots = roster.filter(r => r.slot.startsWith('BN'))

  const POS_COLOR: Record<string, string> = {
    QB: 'bg-red-500/20 text-red-300', RB: 'bg-emerald-500/20 text-emerald-300',
    WR: 'bg-blue-500/20 text-blue-300', TE: 'bg-orange-500/20 text-orange-300',
    K: 'bg-purple-500/20 text-purple-300', DST: 'bg-yellow-500/20 text-yellow-300',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 right-4 text-field-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex gap-1">
              <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
            </div>
          </div>
        )}

        {(error || (!isLoading && !profile)) && (
          <div className="text-center py-10 text-field-400 text-sm">
            Could not load profile for @{username}
          </div>
        )}

        {profile && (
          <div className="space-y-5">

            {/* Profile header */}
            <div className="flex items-center gap-4">
              <ProfileAvatar profile={profile} size="xl" />
              <div className="flex-1 min-w-0">
                <h2 className="font-cond font-black text-xl text-white">
                  {profile.display_name || profile.username}
                </h2>
                <p className="text-field-400 text-sm">@{profile.username}</p>
                {profile.bio && (
                  <p className="text-field-300 text-sm mt-1 leading-snug">{profile.bio}</p>
                )}
              </div>
            </div>

            {/* Favorite teams */}
            {(profile.favorite_nfl_team || profile.favorite_cfb_team) && (
              <div className="flex gap-3 flex-wrap">
                {profile.favorite_nfl_team && (
                  <div className="flex items-center gap-1.5 bg-nfl/10 border border-nfl/20 rounded-lg px-3 py-1.5">
                    <Star className="w-3 h-3 text-nfl" />
                    <span className="text-xs font-bold text-nfl">{profile.favorite_nfl_team}</span>
                    <span className="text-xs text-field-500">NFL</span>
                  </div>
                )}
                {profile.favorite_cfb_team && (
                  <div className="flex items-center gap-1.5 bg-cfb/10 border border-cfb/20 rounded-lg px-3 py-1.5">
                    <Star className="w-3 h-3 text-cfb" />
                    <span className="text-xs font-bold text-cfb">{profile.favorite_cfb_team}</span>
                    <span className="text-xs text-field-500">CFB</span>
                  </div>
                )}
              </div>
            )}

            {/* Shared leagues */}
            {sharedLeagues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-field-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-field-400">
                    Shared Leagues
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sharedLeagues.map(l => (
                    <div key={l.id}
                      className="flex items-center justify-between bg-field-700 border border-field-600 rounded-lg px-3 py-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{l.team_name}</span>
                          {l.is_commissioner && (
                            <span className="text-xs bg-gold/20 text-gold border border-gold/30 px-1.5 py-0.5 rounded font-bold">
                              Commish
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-field-400">{l.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-white">{l.wins}–{l.losses}</div>
                        <div className="text-xs text-field-500">{l.points_for.toFixed(1)} pts</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Their roster in this league */}
            {starters.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-3.5 h-3.5 text-gold" />
                  <span className="text-xs font-bold uppercase tracking-wider text-field-400">
                    Roster — Current League
                  </span>
                </div>

                <div className="space-y-1">
                  {/* Starters */}
                  {starters.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-field-700 border border-field-600 rounded-lg">
                      <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded shrink-0',
                        POS_COLOR[r.player?.pos] ?? 'bg-field-600 text-field-300')}>
                        {r.player?.pos}
                      </span>
                      <span className="text-sm font-bold text-white flex-1 truncate">{r.player?.name}</span>
                      <span className="text-xs text-field-400 shrink-0">{r.player?.team}</span>
                      <span className="text-xs text-gold font-bold shrink-0 w-10 text-right">
                        {r.player?.avg_pts?.toFixed(1) ?? '—'}
                      </span>
                    </div>
                  ))}

                  {/* Bench count */}
                  {benchSlots.length > 0 && (
                    <div className="text-xs text-field-500 text-center py-1">
                      +{benchSlots.length} bench player{benchSlots.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Member since */}
            <p className="text-xs text-field-600 text-center border-t border-field-700 pt-3">
              Member since {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
