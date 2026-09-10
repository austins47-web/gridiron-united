import type { Player } from '@/types/database'

// NFL: DB id = espnId + 1_000_000. CFB: espn_athlete_id stored
// directly on the row (fallback: DB id - 50_000_000, correct since
// CFB ids are 50_000_000 + athleteId).
export function toEspnId(player: Player): number {
  if (player.league === 'NFL') return player.id - 1_000_000
  return player.espn_athlete_id ?? (player.id - 50_000_000)
}

export function headshotUrl(player: Player): string {
  const espnId = toEspnId(player)
  const sport = player.league === 'NFL' ? 'nfl' : 'college-football'
  return `https://a.espncdn.com/i/headshots/${sport}/players/full/${espnId}.png`
}
