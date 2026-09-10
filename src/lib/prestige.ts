// Status/prestige helpers — small signals that make a ranking or a
// membership feel like it means something, beyond a bare number.

/**
 * A percentile-tier label for a standings position, e.g. "Top 10%".
 * Deliberately coarse (10/25/50%) rather than an exact percentile —
 * a precise "Top 23%" reads as a stat; a round one reads as a tier.
 * Returns null once someone's outside the top half — there's no
 * good way to make "bottom half" sound like a status, so it just
 * doesn't try.
 */
export function tierLabel(rank: number, total: number): string | null {
  if (total <= 1) return null
  const pct = rank / total
  if (pct <= 0.1) return 'Top 10%'
  if (pct <= 0.25) return 'Top 25%'
  if (pct <= 0.5) return 'Top 50%'
  return null
}

/**
 * Was this member there when the league was genuinely new — joined
 * within the same week the league itself was created? Catches the
 * people who actually founded the league, not just "joined early in
 * a season that's already underway" (a league created in July and
 * joined in August wouldn't qualify — that's not founding it).
 */
export function isFoundingMember(leagueCreatedAt: string | null | undefined, joinedAt: string | null | undefined): boolean {
  if (!leagueCreatedAt || !joinedAt) return false
  const created = new Date(leagueCreatedAt).getTime()
  const joined = new Date(joinedAt).getTime()
  if (!Number.isFinite(created) || !Number.isFinite(joined)) return false
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  return joined - created <= WEEK_MS
}
