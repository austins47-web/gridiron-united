// Auto-generated types matching your Supabase schema
// Regenerate with: npx supabase gen types typescript --local > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type PlayerPos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
export type PlayerLeague = 'NFL' | 'CFB'
export type PlayerStatus = 'active' | 'questionable' | 'out' | 'ir'
export type ScoringType = 'standard' | 'half_ppr' | 'ppr'
export type LeagueType = 'redraft' | 'keeper' | 'dynasty' | 'pickem'

export interface CfpTeam {
  id: string
  season: number
  team_name: string
  seed: number | null
  is_eliminated: boolean
  eliminated_round: string | null
  created_at: string
  updated_at: string
}

export interface BowlGame {
  id: string
  season: number
  bowl_name: string
  game_date: string | null
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  status: 'scheduled' | 'in_progress' | 'final'
  is_cfp: boolean
  cfp_round: string | null
  created_at: string
}
export type DraftType = 'snake' | 'auction' | 'linear'
export type DraftStatus = 'pre_draft' | 'in_progress' | 'completed' | 'scheduled' | 'paused'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string; username: string }
        Update: Partial<Profile>
      }
      players: {
        Row: Player
        Insert: Omit<Player, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Player>
      }
      leagues: {
        Row: League
        Insert: Omit<League, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<League>
      }
      league_members: {
        Row: LeagueMember
        Insert: Omit<LeagueMember, 'id' | 'joined_at'>
        Update: Partial<LeagueMember>
      }
      rosters: {
        Row: RosterEntry
        Insert: Omit<RosterEntry, 'id' | 'acquired_at'>
        Update: Partial<RosterEntry>
      }
      draft_state: {
        Row: DraftState
        Insert: Omit<DraftState, 'id' | 'updated_at'>
        Update: Partial<DraftState>
      }
      draft_picks: {
        Row: DraftPick
        Insert: Omit<DraftPick, 'id' | 'picked_at'>
        Update: Partial<DraftPick>
      }
      matchups: {
        Row: Matchup
        Insert: Omit<Matchup, 'id' | 'created_at'>
        Update: Partial<Matchup>
      }
      trades: {
        Row: Trade
        Insert: Omit<Trade, 'id' | 'created_at'>
        Update: Partial<Trade>
      }
      waiver_claims: {
        Row: WaiverClaim
        Insert: Omit<WaiverClaim, 'id'>
        Update: Partial<WaiverClaim>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Notification>
      }
      league_messages: {
        Row: LeagueMessage
        Insert: Omit<LeagueMessage, 'id' | 'created_at'>
        Update: Partial<LeagueMessage>
      }
      weekly_scores: {
        Row: WeeklyScore
        Insert: Omit<WeeklyScore, 'id'>
        Update: Partial<WeeklyScore>
      }
    }
  }
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  favorite_nfl_team: string | null
  favorite_cfb_team: string | null
  created_at: string
  updated_at: string
}

export interface Player {
  id: number
  name: string
  team: string
  pos: PlayerPos
  depth_pos: string | null
  league: PlayerLeague
  conference: string | null
  avg_pts: number
  proj_pts: number
  adp: number
  status: PlayerStatus
  injury_note: string | null
  is_rookie: boolean | null
  created_at: string
  updated_at: string
}

export interface ScoringRules {
  score_pass_td: number
  score_pass_yd: number
  score_pass_bonus_300: number
  score_pass_int: number
  score_rush_td: number
  score_rush_yd: number
  score_rush_bonus_100: number
  score_rec_td: number
  score_rec_yd: number
  score_rec_bonus_100: number
  score_reception: number
  score_fumble_lost: number
  score_2pt_conv: number
  score_fg_0_39: number
  score_fg_40_49: number
  score_fg_50_plus: number
  score_pat: number
  score_fg_miss: number
  score_dst_sack: number
  score_dst_int: number
  score_dst_fumble_rec: number
  score_dst_td: number
  score_dst_safety: number
  score_dst_blocked: number
  score_dst_pts_0: number
  score_dst_pts_1_6: number
  score_dst_pts_7_13: number
  score_dst_pts_14_20: number
  score_dst_pts_21_27: number
  score_dst_pts_28_34: number
  score_dst_pts_35_plus: number
}

export interface RosterSlotConfig {
  slots_qb: number
  slots_rb: number
  slots_wr: number
  slots_te: number
  slots_flex: number
  slots_dst: number
  slots_k: number
  slots_bench: number
  slots_ir: number
}

export type PlayerPool = 'nfl' | 'cfb' | 'both'

export interface League extends ScoringRules, RosterSlotConfig {
  id: string
  name: string
  commissioner_id: string | null
  num_teams: number
  num_rounds: number
  scoring_type: ScoringType
  league_type: LeagueType
  draft_type: DraftType
  draft_status: DraftStatus
  draft_pick_timer: number
  player_pool: PlayerPool
  slots_cfb_os: number
  cfb_postseason_scoring: boolean
  cfb_bowl_scoring: boolean
  cfb_cfp_only: boolean
  current_week: number
  season: number
  is_public: boolean
  invite_code: string
  created_at: string
  updated_at: string
}

export interface LeagueMember {
  id: string
  league_id: string
  user_id: string
  team_name: string
  draft_position: number | null
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
  waiver_priority: number
  faab_budget: number
  faab_spent: number
  is_commissioner: boolean
  joined_at: string
  // Joined
  profiles?: Profile
}

export interface RosterEntry {
  id: string
  league_id: string
  user_id: string
  player_id: number
  slot: string
  week: number
  acquired_type: 'draft' | 'waiver' | 'trade' | 'fa'
  acquired_at: string
  // Joined
  players?: Player
}

export interface DraftState {
  id: string
  league_id: string
  current_pick: number
  current_round: number
  status: 'waiting' | 'active' | 'in_progress' | 'paused' | 'completed' | 'scheduled'
  current_user_id: string | null
  pick_started_at: string | null
  num_rounds: number
  updated_at: string
}

export interface DraftPick {
  id: string
  league_id: string
  user_id: string
  player_id: number
  pick_number: number
  round_number: number
  pick_in_round: number
  auto_picked: boolean
  picked_at: string
  // Joined
  players?: Player
  profiles?: Profile
}

export interface Matchup {
  id: string
  league_id: string
  week: number
  home_user_id: string | null
  away_user_id: string | null
  home_score: number
  away_score: number
  is_complete: boolean
  is_playoff: boolean
  created_at: string
  // Joined
  home_profile?: Profile
  away_profile?: Profile
}

export interface Trade {
  id: string
  league_id: string
  proposer_id: string | null
  receiver_id: string | null
  proposer_player_ids: number[]
  receiver_player_ids: number[]
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired'
  message: string | null
  expires_at: string
  created_at: string
  // Joined
  proposer?: Profile
  receiver?: Profile
  proposer_players?: Player[]
  receiver_players?: Player[]
}

export interface WaiverClaim {
  id: string
  league_id: string
  user_id: string | null
  add_player_id: number | null
  drop_player_id: number | null
  bid_amount: number
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  priority: number
  week: number
  processed_at: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  league_id: string | null
  type: string
  title: string
  body: string | null
  is_read: boolean
  data: Json
  created_at: string
}

export interface LeagueMessage {
  id: string
  league_id: string
  user_id: string | null
  message: string
  is_system: boolean
  created_at: string
  // Joined
  profiles?: Profile
}

export interface WeeklyScore {
  id: string
  league_id: string
  user_id: string | null
  player_id: number | null
  week: number
  points: number
  is_starter: boolean
  stat_json: Json
  updated_at: string
}

// Slot definitions
export interface SlotDef {
  key: string    // e.g. "QB1", "BN3" - used as slot value in DB
  label: string  // e.g. "QB", "BN"
  pos: string[]  // eligible positions
  type: 'starter' | 'flex' | 'bench' | 'ir'
}

export function buildSlotDefs(league: RosterSlotConfig): SlotDef[] {
  const slots: SlotDef[] = []
  for (let i = 0; i < league.slots_qb; i++)
    slots.push({ key: `QB${i+1}`, label: 'QB', pos: ['QB'], type: 'starter' })
  for (let i = 0; i < league.slots_rb; i++)
    slots.push({ key: `RB${i+1}`, label: 'RB', pos: ['RB'], type: 'starter' })
  for (let i = 0; i < league.slots_wr; i++)
    slots.push({ key: `WR${i+1}`, label: 'WR', pos: ['WR'], type: 'starter' })
  for (let i = 0; i < league.slots_te; i++)
    slots.push({ key: `TE${i+1}`, label: 'TE', pos: ['TE'], type: 'starter' })
  for (let i = 0; i < league.slots_flex; i++)
    slots.push({ key: `FLEX${i+1}`, label: 'FLEX', pos: ['RB', 'WR', 'TE'], type: 'flex' })
  for (let i = 0; i < league.slots_dst; i++)
    slots.push({ key: `DST${i+1}`, label: 'D/ST', pos: ['DST'], type: 'starter' })
  for (let i = 0; i < league.slots_k; i++)
    slots.push({ key: `K${i+1}`, label: 'K', pos: ['K'], type: 'starter' })
  for (let i = 0; i < league.slots_bench; i++)
    slots.push({ key: `BN${i+1}`, label: 'BN', pos: ['QB','RB','WR','TE','K','DST'], type: 'bench' })
  for (let i = 0; i < league.slots_ir; i++)
    slots.push({ key: `IR${i+1}`, label: 'IR', pos: ['QB','RB','WR','TE','K','DST'], type: 'ir' })
  for (let i = 0; i < (league.slots_cfb_os ?? 0); i++)
    slots.push({ key: `CFB_OS${i+1}`, label: 'CFB OS', pos: ['QB','RB','WR','TE','K','DST'], type: 'cfb_os' })
  return slots
}

export function canFillSlot(slot: SlotDef, pos: PlayerPos): boolean {
  if (slot.type === 'bench') return true
  if (slot.type === 'ir') return false
  return slot.pos.includes(pos)
}

// Default scoring values (PPR)
export const DEFAULT_SCORING = {
  score_pass_td: 4,
  score_pass_yd: 1,
  score_pass_bonus_300: 3,
  score_pass_int: -2,
  score_rush_td: 6,
  score_rush_yd: 1,
  score_rush_bonus_100: 3,
  score_rec_td: 6,
  score_rec_yd: 1,
  score_rec_bonus_100: 3,
  score_reception: 1,
  score_fumble_lost: -2,
  score_2pt_conv: 2,
  score_fg_0_39: 3,
  score_fg_40_49: 4,
  score_fg_50_plus: 5,
  score_pat: 1,
  score_fg_miss: -1,
  score_dst_sack: 1,
  score_dst_int: 2,
  score_dst_fumble_rec: 2,
  score_dst_safety: 2,
  score_dst_td: 6,
  score_dst_blocked: 2,
  score_dst_pts_0: 10,
  score_dst_pts_1_6: 7,
  score_dst_pts_7_13: 4,
  score_dst_pts_14_20: 1,
  score_dst_pts_21_27: 0,
  score_dst_pts_28_34: -1,
  score_dst_pts_35_plus: -4,
}
