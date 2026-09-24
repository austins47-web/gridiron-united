import { nflSeasonFor } from '../../supabase/functions/_shared/pickemCore.ts'

/**
 * The season the app is currently operating on.
 *
 * This existed as a hardcoded 2026 in ~15 places and a stale 2025
 * in a couple of others, which is how league rows drifted onto a
 * different season than their own picks and games. Anything that
 * means "the current season" should import this.
 *
 * NOT everything numbered 2026 is a season — `teamAwards.ts` and
 * `teamIds.ts` use '2026' as Appalachian State's ESPN team id, and
 * the projections sync reads 2025 on purpose for prior-year stats.
 * Those are left alone deliberately.
 *
 * Worked out from the date (a season runs July–June — see
 * nflSeasonFor), so a new season starts on its own: the 2026 season
 * stays current through the Super Bowl and the offseason, and 2027
 * takes over on July 1, 2027.
 */
export const CURRENT_SEASON = nflSeasonFor(new Date())

/** NFL and CFB are on the same season year today; split if that changes. */
export const NFL_SEASON = CURRENT_SEASON
export const CFB_SEASON = CURRENT_SEASON
