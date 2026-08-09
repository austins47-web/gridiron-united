// Shared fantasy point calculation — mirrors SQL calc_fantasy_pts() exactly.
// Used by PlayersView (proj display), LiveScoringView, PlayerProfileDrawer, RosterView.

import type { ScoringRules } from '@/types/database'

export interface RawStats {
  pass_yards?: number; pass_tds?: number; pass_ints?: number
  rush_yards?: number; rush_tds?: number
  receptions?: number; rec_yards?: number; rec_tds?: number
  fumbles_lost?: number; two_pt_convs?: number
  fg_0_39?: number; fg_40_49?: number; fg_50_plus?: number
  pat_made?: number; fg_miss?: number
  dst_sacks?: number; dst_ints?: number; dst_fumble_rec?: number
  dst_tds?: number; dst_safeties?: number; dst_blocked?: number
  dst_pts_allowed?: number
}

export interface ProjStats {
  proj_pass_yards?: number; proj_pass_tds?: number; proj_pass_ints?: number
  proj_rush_yards?: number; proj_rush_tds?: number
  proj_receptions?: number; proj_rec_yards?: number; proj_rec_tds?: number
  proj_fumbles_lost?: number; proj_2pt_convs?: number
  proj_fg_0_39?: number; proj_fg_40_49?: number; proj_fg_50_plus?: number
  proj_pat?: number; proj_fg_miss?: number
  proj_dst_sacks?: number; proj_dst_ints?: number; proj_dst_fumble_rec?: number
  proj_dst_tds?: number; proj_dst_safeties?: number; proj_dst_blocked?: number
  proj_dst_pts_allowed?: number
  games_played?: number
}

function g(v?: number) { return v ?? 0 }

function dstPtsScore(pts: number, s: ScoringRules): number {
  if (pts === 0)          return s.score_dst_pts_0
  if (pts <= 6)           return s.score_dst_pts_1_6
  if (pts <= 13)          return s.score_dst_pts_7_13
  if (pts <= 20)          return s.score_dst_pts_14_20
  if (pts <= 27)          return s.score_dst_pts_21_27
  if (pts <= 34)          return s.score_dst_pts_28_34
  return s.score_dst_pts_35_plus
}

export function calcFantasyPts(stats: RawStats, s: ScoringRules): number {
  let pts = 0
  pts += g(stats.pass_yards) * s.score_pass_yd
  pts += g(stats.pass_tds)   * s.score_pass_td
  pts += g(stats.pass_ints)  * s.score_pass_int
  if (g(stats.pass_yards) >= 300) pts += s.score_pass_bonus_300
  pts += g(stats.rush_yards) * s.score_rush_yd
  pts += g(stats.rush_tds)   * s.score_rush_td
  if (g(stats.rush_yards) >= 100) pts += s.score_rush_bonus_100
  pts += g(stats.receptions) * s.score_reception
  pts += g(stats.rec_yards)  * s.score_rec_yd
  pts += g(stats.rec_tds)    * s.score_rec_td
  if (g(stats.rec_yards) >= 100) pts += s.score_rec_bonus_100
  pts += g(stats.fumbles_lost)  * s.score_fumble_lost
  pts += g(stats.two_pt_convs)  * s.score_2pt_conv
  pts += g(stats.fg_0_39)    * s.score_fg_0_39
  pts += g(stats.fg_40_49)   * s.score_fg_40_49
  pts += g(stats.fg_50_plus) * s.score_fg_50_plus
  pts += g(stats.pat_made)   * s.score_pat
  pts += g(stats.fg_miss)    * s.score_fg_miss
  pts += g(stats.dst_sacks)      * s.score_dst_sack
  pts += g(stats.dst_ints)       * s.score_dst_int
  pts += g(stats.dst_fumble_rec) * s.score_dst_fumble_rec
  pts += g(stats.dst_tds)        * s.score_dst_td
  pts += g(stats.dst_safeties)   * s.score_dst_safety
  pts += g(stats.dst_blocked)    * s.score_dst_blocked
  pts += dstPtsScore(g(stats.dst_pts_allowed), s)
  return Math.round(pts * 100) / 100
}

// Per-game projected points from raw season totals
export function calcProjPts(proj: ProjStats, s: ScoringRules): number {
  const games = Math.max(g(proj.games_played), 1)
  const pg = (v?: number) => g(v) / games
  return calcFantasyPts({
    pass_yards: pg(proj.proj_pass_yards), pass_tds: pg(proj.proj_pass_tds),
    pass_ints:  pg(proj.proj_pass_ints),
    rush_yards: pg(proj.proj_rush_yards), rush_tds: pg(proj.proj_rush_tds),
    receptions: pg(proj.proj_receptions), rec_yards: pg(proj.proj_rec_yards),
    rec_tds:    pg(proj.proj_rec_tds),
    fumbles_lost: pg(proj.proj_fumbles_lost), two_pt_convs: pg(proj.proj_2pt_convs),
    fg_0_39: pg(proj.proj_fg_0_39), fg_40_49: pg(proj.proj_fg_40_49),
    fg_50_plus: pg(proj.proj_fg_50_plus), pat_made: pg(proj.proj_pat),
    fg_miss:    pg(proj.proj_fg_miss),
    dst_sacks:      pg(proj.proj_dst_sacks), dst_ints:       pg(proj.proj_dst_ints),
    dst_fumble_rec: pg(proj.proj_dst_fumble_rec), dst_tds:   pg(proj.proj_dst_tds),
    dst_safeties:   pg(proj.proj_dst_safeties), dst_blocked: pg(proj.proj_dst_blocked),
    dst_pts_allowed: pg(proj.proj_dst_pts_allowed),
  }, s)
}

export function statusMultiplier(status: string): number {
  switch (status) {
    case 'out':          return 0.00
    case 'ir':           return 0.00
    case 'doubtful':     return 0.15
    case 'questionable': return 0.65
    case 'probable':     return 0.95
    default:             return 1.00
  }
}

export function displayProjPts(proj: ProjStats | null, s: ScoringRules, status: string): number {
  if (!proj) return 0
  return Math.round(calcProjPts(proj, s) * statusMultiplier(status) * 10) / 10
}
