import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { usePlayerCard, closePlayerCard } from '@/hooks/usePlayerCard'
import { usePickemSeasonData, useLeagueMembersList } from '@/hooks/usePickemSeasonData'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { computeSeasonProfiles, computePickDNA, computePickMatches, computeSeasonAwards } from './season'
import { computeBelt, computeAchievements, computeBadBeats, winnerOf, isLive, isFinal } from './standings'
import { SeasonCard, type Receipt } from './SeasonCard'
import { PickemWrapped } from './PickemWrapped'

/**
 * The Pick'Em player card: any name in a Pick'Em league (chat, the
 * Board, Standings) opens it through openPlayerCard. Their season
 * card — record, badges, Pick DNA, Twin and Nemesis, Belt history and
 * receipts — and from there, their Wrapped. Mounted once in AppShell.
 */
export function PlayerCardHost() {
  const userId = usePlayerCard(s => s.userId)
  const { activeLeague, user } = useAppStore()
  const leagueId = activeLeague?.league_type === 'pickem' ? activeLeague.id : null
  const [wrappedFor, setWrappedFor] = useState<string | null>(null)
  const open = !!leagueId && (!!userId || !!wrappedFor)

  const members = useLeagueMembersList(leagueId, open)
  const { games, picks, loaded } = usePickemSeasonData(leagueId, open)

  // A card from one league never follows you into another
  const shownFor = useRef(leagueId)
  useEffect(() => {
    if (shownFor.current === leagueId) return
    shownFor.current = leagueId
    closePlayerCard()
    setWrappedFor(null)
  }, [leagueId])

  const season = useMemo(() => {
    if (!open || !loaded || members.length === 0) return null
    return {
      profiles: computeSeasonProfiles(games, picks, members),
      dna: computePickDNA(games, picks, members),
      achievements: computeAchievements(games, picks, members),
      belt: computeBelt(games, picks, members),
    }
  }, [open, loaded, games, picks, members])

  const profile = userId ? season?.profiles.find(p => p.userId === userId) ?? null : null

  const matches = useMemo(
    () => (userId && season ? computePickMatches(games, picks, members, userId) : null),
    [userId, season, games, picks, members],
  )

  // Their pick receipts, newest first — only on games that have kicked
  // off, the moment everyone else's picks go public too
  const receipts = useMemo<Receipt[]>(() => {
    if (!userId || !loaded) return []
    const byId = new Map(games.map((g: any) => [g.id, g]))
    const now = Date.now()
    return picks
      .filter((p: any) => p.user_id === userId && p.reason)
      .map((p: any) => ({ p, g: byId.get(p.game_id) as any }))
      .filter(({ g }) => g && (isLive(g) || isFinal(g) || (g.game_date && new Date(g.game_date).getTime() <= now)))
      .sort((a, b) => new Date(b.g.game_date).getTime() - new Date(a.g.game_date).getTime())
      .map(({ p, g }) => {
        const w = winnerOf(g)
        return {
          gameId: g.id,
          week: g.week,
          team: p.picked_team,
          opponent: p.picked_team === g.home_team ? g.away_team : g.home_team,
          reason: p.reason,
          result: w == null ? null : w === p.picked_team ? 'hit' as const : 'missed' as const,
        }
      })
  }, [userId, loaded, games, picks])

  const beltWeeksOf = (id: string) =>
    season?.belt?.lineage.filter(l => l.winners.some(w => w.userId === id)).map(l => l.week) ?? []

  const wrappedProfile = wrappedFor ? season?.profiles.find(p => p.userId === wrappedFor) ?? null : null
  const wrappedExtras = useMemo(() => {
    if (!wrappedFor || !loaded || members.length === 0) return null
    return {
      beats: computeBadBeats(games, picks),
      seasonOver: computeSeasonAwards(games, picks, members).final,
    }
  }, [wrappedFor, loaded, games, picks, members])

  // Someone who isn't a player here (the Commish, say) has no card
  const notAPlayer = !!userId && !!season && !profile
  useEffect(() => { if (notAPlayer) closePlayerCard() }, [notAPlayer])

  if (!leagueId || notAPlayer) return null

  if (userId && !profile) {
    // Still loading the season
    return (
      <ModalPortal onClose={closePlayerCard}>
        <div className="modal-box w-full max-w-xs flex items-center justify-center gap-2 py-8 text-field-300" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-5 h-5 animate-spin text-gold" /> Loading their season…
        </div>
      </ModalPortal>
    )
  }

  const holder = season?.belt?.holders.find(h => h.userId === userId)

  return (
    <>
      {profile && (
        <SeasonCard
          profile={profile}
          totalPlayers={season!.profiles.length}
          isYou={profile.userId === user?.id}
          onClose={closePlayerCard}
          dna={season!.dna.players.find(p => p.userId === profile.userId) ?? null}
          leagueDna={season!.dna.league}
          onWrapped={() => { setWrappedFor(profile.userId); closePlayerCard() }}
          achievements={season!.achievements.get(profile.userId) ?? []}
          matches={matches}
          belt={{ weeks: beltWeeksOf(profile.userId), reign: holder?.reign ?? 0 }}
          receipts={receipts}
        />
      )}

      {wrappedProfile && wrappedExtras && (
        <PickemWrapped
          profile={wrappedProfile}
          dna={season!.dna.players.find(p => p.userId === wrappedProfile.userId) ?? null}
          leagueDna={season!.dna.league}
          worstBeat={wrappedExtras.beats.find(b => b.victims.includes(wrappedProfile.userId)) ?? null}
          beltWeeks={beltWeeksOf(wrappedProfile.userId).length}
          leagueName={activeLeague?.name ?? "Pick'Em"}
          totalPlayers={season!.profiles.length}
          throughWeek={season!.belt?.week ?? null}
          seasonOver={wrappedExtras.seasonOver}
          isYou={wrappedProfile.userId === user?.id}
          onClose={() => setWrappedFor(null)}
          badges={season!.achievements.get(wrappedProfile.userId) ?? []}
        />
      )}
    </>
  )
}
