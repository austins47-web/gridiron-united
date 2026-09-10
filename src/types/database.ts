// Schema metadata (which tables exist, their FK relationships) is
// regenerated from the live project with:
//   npx supabase gen types typescript --project-id sxktvztljzxcmhezphsq
// The named Row interfaces below (Profile, League, etc.) are kept
// hand-maintained on purpose — the real Postgres columns are almost
// all nullable (no NOT NULL constraints), but the app already
// relies on them being populated (via defaults/triggers) everywhere
// it reads them. Regenerating those as fully-nullable would trade
// one systemic problem (missing tables) for a much bigger one
// (null-checks required at hundreds of call sites for values that
// are, in practice, never actually null). Only the Database.Tables
// map's Relationships (needed for embedded `!fkey(...)` selects)
// and previously-missing tables are sourced straight from the
// generated schema.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type PlayerPos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
export type PlayerLeague = 'NFL' | 'CFB'
export type PlayerStatus = 'active' | 'questionable' | 'out' | 'ir'
export type ScoringType = 'standard' | 'half_ppr' | 'ppr'
export type LeagueType = 'redraft' | 'keeper' | 'dynasty' | 'pickem'

export type CfpTeam = {
  id: string
  season: number
  team_name: string
  seed: number | null
  is_eliminated: boolean
  eliminated_round: string | null
  created_at: string
  updated_at: string
}

export type BowlGame = {
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
  // supabase-js 2.5x+ uses this marker to pick its Postgrest typing
  // codepath; without it, insert/update overload resolution silently
  // collapses to `never` even for tables that ARE declared below.
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string; username: string }
        Update: Partial<Profile>
        Relationships: []
      }
      players: {
        Row: Player
        // Only these four columns lack a DB default — everything else
        // (avg_pts, adp, status, etc.) does, matching the live schema.
        Insert: Partial<Omit<Player, 'id' | 'created_at' | 'updated_at'>> & Pick<Player, 'league' | 'name' | 'pos' | 'team'>
        Update: Partial<Player>
        Relationships: []
      }
      leagues: {
        Row: League
        // Every scoring/slot/config column has a DB default except name.
        Insert: Partial<Omit<League, 'id' | 'created_at' | 'updated_at'>> & Pick<League, 'name'>
        Update: Partial<League>
        Relationships: [
          {
            foreignKeyName: "leagues_commissioner_id_fkey"
            columns: ["commissioner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: LeagueMember
        // Every column has a DB default per the live schema.
        Insert: Partial<Omit<LeagueMember, 'id' | 'joined_at'>>
        Update: Partial<LeagueMember>
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rosters: {
        Row: RosterEntry
        Insert: Partial<Omit<RosterEntry, 'id' | 'acquired_at'>> & Pick<RosterEntry, 'slot'>
        Update: Partial<RosterEntry>
        Relationships: [
          {
            foreignKeyName: "rosters_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rosters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_state: {
        Row: DraftState
        // Every column has a DB default per the live schema.
        Insert: Partial<Omit<DraftState, 'id' | 'updated_at'>>
        Update: Partial<DraftState>
        Relationships: [
          {
            foreignKeyName: "draft_state_current_user_id_fkey"
            columns: ["current_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_state_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_picks: {
        Row: DraftPick
        Insert: Partial<Omit<DraftPick, 'id' | 'picked_at'>> & Pick<DraftPick, 'pick_in_round' | 'pick_number' | 'round_number'>
        Update: Partial<DraftPick>
        Relationships: [
          {
            foreignKeyName: "draft_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matchups: {
        Row: Matchup
        Insert: Partial<Omit<Matchup, 'id' | 'created_at'>> & Pick<Matchup, 'week'>
        Update: Partial<Matchup>
        Relationships: [
          {
            foreignKeyName: "matchups_away_user_id_fkey"
            columns: ["away_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_home_user_id_fkey"
            columns: ["home_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: Trade
        // Every column has a DB default per the live schema.
        Insert: Partial<Omit<Trade, 'id' | 'created_at'>>
        Update: Partial<Trade>
        Relationships: [
          {
            foreignKeyName: "trades_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_claims: {
        Row: WaiverClaim
        Insert: Partial<Omit<WaiverClaim, 'id'>> & Pick<WaiverClaim, 'week'>
        Update: Partial<WaiverClaim>
        Relationships: [
          {
            foreignKeyName: "waiver_claims_add_player_id_fkey"
            columns: ["add_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_drop_player_id_fkey"
            columns: ["drop_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: Notification
        Insert: Partial<Omit<Notification, 'id' | 'created_at'>> & Pick<Notification, 'title' | 'type'>
        Update: Partial<Notification>
        Relationships: [
          {
            foreignKeyName: "notifications_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_messages: {
        Row: LeagueMessage
        Insert: Partial<Omit<LeagueMessage, 'id' | 'created_at'>> & Pick<LeagueMessage, 'message'>
        Update: Partial<LeagueMessage>
        Relationships: [
          {
            foreignKeyName: "league_messages_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_scores: {
        Row: WeeklyScore
        Insert: Partial<Omit<WeeklyScore, 'id'>> & Pick<WeeklyScore, 'week'>
        Update: Partial<WeeklyScore>
        Relationships: [
          {
            foreignKeyName: "weekly_scores_bowl_game_id_fkey"
            columns: ["bowl_game_id"]
            isOneToOne: false
            referencedRelation: "bowl_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }

      // --- Tables that were missing from this file entirely until now.
      // They were never wired into Database['public']['Tables'], so every
      // .from(...) call against them silently typed as `never`. Shapes
      // below are pulled directly from the live schema (all genuinely
      // nullable — nothing hand-tuned these before, so there's no existing
      // non-null assumption to preserve).
      nfl_games: {
        Row: {
          away_score: number | null
          away_team: string
          created_at: string | null
          espn_event_id: string | null
          game_date: string | null
          home_score: number | null
          home_team: string
          id: string
          is_tiebreaker: boolean | null
          season: number
          status: string | null
          week: number
        }
        Insert: {
          away_score?: number | null
          away_team: string
          created_at?: string | null
          espn_event_id?: string | null
          game_date?: string | null
          home_score?: number | null
          home_team: string
          id?: string
          is_tiebreaker?: boolean | null
          season?: number
          status?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['nfl_games']['Insert']>
        Relationships: []
      }
      cfb_games: {
        Row: {
          away_name: string | null
          away_rank: number | null
          away_score: number | null
          away_team: string
          conference_game: boolean
          created_at: string
          espn_event_id: string
          game_date: string
          home_name: string | null
          home_rank: number | null
          home_score: number | null
          home_team: string
          id: string
          included_reason: string | null
          is_tiebreaker: boolean
          season: number
          status: string
          updated_at: string
          week: number
        }
        Insert: {
          away_name?: string | null
          away_rank?: number | null
          away_score?: number | null
          away_team: string
          conference_game?: boolean
          created_at?: string
          espn_event_id: string
          game_date: string
          home_name?: string | null
          home_rank?: number | null
          home_score?: number | null
          home_team: string
          id?: string
          included_reason?: string | null
          is_tiebreaker?: boolean
          season: number
          status?: string
          updated_at?: string
          week: number
        }
        Update: Partial<Database['public']['Tables']['cfb_games']['Insert']>
        Relationships: []
      }
      cfp_teams: {
        Row: {
          created_at: string | null
          eliminated_round: string | null
          id: string
          is_eliminated: boolean | null
          season: number
          seed: number | null
          team_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          eliminated_round?: string | null
          id?: string
          is_eliminated?: boolean | null
          season: number
          seed?: number | null
          team_name: string
          updated_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['cfp_teams']['Insert']>
        Relationships: []
      }
      bowl_games: {
        Row: {
          away_score: number | null
          away_team: string
          bowl_name: string
          cfp_round: string | null
          created_at: string | null
          game_date: string | null
          home_score: number | null
          home_team: string
          id: string
          is_cfp: boolean | null
          season: number
          status: string | null
        }
        Insert: {
          away_score?: number | null
          away_team: string
          bowl_name: string
          cfp_round?: string | null
          created_at?: string | null
          game_date?: string | null
          home_score?: number | null
          home_team: string
          id?: string
          is_cfp?: boolean | null
          season: number
          status?: string | null
        }
        Update: Partial<Database['public']['Tables']['bowl_games']['Insert']>
        Relationships: []
      }
      pickem_picks: {
        Row: {
          created_at: string | null
          game_id: string | null
          id: string
          is_correct: boolean | null
          league_id: string | null
          picked_team: string
          points_earned: number | null
          season: number
          sport: string
          tiebreaker_score: number | null
          updated_at: string | null
          user_id: string | null
          week: number
        }
        Insert: {
          created_at?: string | null
          game_id?: string | null
          id?: string
          is_correct?: boolean | null
          league_id?: string | null
          picked_team: string
          points_earned?: number | null
          season?: number
          sport?: string
          tiebreaker_score?: number | null
          updated_at?: string | null
          user_id?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['pickem_picks']['Insert']>
        Relationships: [
          {
            foreignKeyName: "pickem_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nfl_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickem_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickem_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // Exists in the live schema but nothing in this codebase (app or
      // migrations) reads or writes it — no trigger/function/edge function
      // populates it either. Left typed for completeness; don't treat it
      // as a source of truth for pick'em standings until something
      // actually maintains it.
      pickem_standings: {
        Row: {
          id: string
          league_id: string | null
          season: number
          total_correct: number | null
          total_picks: number | null
          updated_at: string | null
          user_id: string | null
          weekly_correct: Json | null
        }
        Insert: {
          id?: string
          league_id?: string | null
          season?: number
          total_correct?: number | null
          total_picks?: number | null
          updated_at?: string | null
          user_id?: string | null
          weekly_correct?: Json | null
        }
        Update: Partial<Database['public']['Tables']['pickem_standings']['Insert']>
        Relationships: [
          {
            foreignKeyName: "pickem_standings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickem_standings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickem_week_settings: {
        Row: {
          created_at: string | null
          id: string
          league_id: string | null
          pick_deadline: string | null
          season: number
          updated_at: string | null
          week: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id?: string | null
          pick_deadline?: string | null
          season?: number
          updated_at?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['pickem_week_settings']['Insert']>
        Relationships: [
          {
            foreignKeyName: "pickem_week_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_votes: {
        Row: {
          created_at: string | null
          id: string
          trade_id: string | null
          user_id: string | null
          vote: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          trade_id?: string | null
          user_id?: string | null
          vote: string
        }
        Update: Partial<Database['public']['Tables']['trade_votes']['Insert']>
        Relationships: [
          {
            foreignKeyName: "trade_votes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_proj_stats: {
        Row: {
          espn_athlete_id: number
          games_played: number | null
          id: string
          player_id: number | null
          proj_2pt_convs: number | null
          proj_dst_blocked: number | null
          proj_dst_fumble_rec: number | null
          proj_dst_ints: number | null
          proj_dst_pts_allowed: number | null
          proj_dst_sacks: number | null
          proj_dst_safeties: number | null
          proj_dst_tds: number | null
          proj_fg_0_39: number | null
          proj_fg_40_49: number | null
          proj_fg_50_plus: number | null
          proj_fg_miss: number | null
          proj_fumbles_lost: number | null
          proj_pass_attempts: number | null
          proj_pass_comps: number | null
          proj_pass_ints: number | null
          proj_pass_tds: number | null
          proj_pass_yards: number | null
          proj_pat: number | null
          proj_rec_tds: number | null
          proj_rec_yards: number | null
          proj_receptions: number | null
          proj_rush_attempts: number | null
          proj_rush_tds: number | null
          proj_rush_yards: number | null
          proj_targets: number | null
          season: number
          source: string | null
          updated_at: string | null
        }
        Insert: {
          espn_athlete_id: number
          games_played?: number | null
          id?: string
          player_id?: number | null
          proj_2pt_convs?: number | null
          proj_dst_blocked?: number | null
          proj_dst_fumble_rec?: number | null
          proj_dst_ints?: number | null
          proj_dst_pts_allowed?: number | null
          proj_dst_sacks?: number | null
          proj_dst_safeties?: number | null
          proj_dst_tds?: number | null
          proj_fg_0_39?: number | null
          proj_fg_40_49?: number | null
          proj_fg_50_plus?: number | null
          proj_fg_miss?: number | null
          proj_fumbles_lost?: number | null
          proj_pass_attempts?: number | null
          proj_pass_comps?: number | null
          proj_pass_ints?: number | null
          proj_pass_tds?: number | null
          proj_pass_yards?: number | null
          proj_pat?: number | null
          proj_rec_tds?: number | null
          proj_rec_yards?: number | null
          proj_receptions?: number | null
          proj_rush_attempts?: number | null
          proj_rush_tds?: number | null
          proj_rush_yards?: number | null
          proj_targets?: number | null
          season?: number
          source?: string | null
          updated_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['player_proj_stats']['Insert']>
        Relationships: [
          {
            foreignKeyName: "player_proj_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats_raw: {
        Row: {
          dst_blocked: number | null
          dst_fumble_rec: number | null
          dst_ints: number | null
          dst_pts_allowed: number | null
          dst_sacks: number | null
          dst_safeties: number | null
          dst_tds: number | null
          espn_athlete_id: number
          fg_0_39: number | null
          fg_40_49: number | null
          fg_50_plus: number | null
          fg_miss: number | null
          fumbles_lost: number | null
          game_id: string | null
          id: string
          league: string
          pass_attempts: number | null
          pass_completions: number | null
          pass_ints: number | null
          pass_tds: number | null
          pass_yards: number | null
          pat_made: number | null
          player_id: number | null
          rec_tds: number | null
          rec_yards: number | null
          receptions: number | null
          rush_attempts: number | null
          rush_tds: number | null
          rush_yards: number | null
          season: number
          targets: number | null
          two_pt_convs: number | null
          updated_at: string | null
          week: number
        }
        Insert: {
          dst_blocked?: number | null
          dst_fumble_rec?: number | null
          dst_ints?: number | null
          dst_pts_allowed?: number | null
          dst_sacks?: number | null
          dst_safeties?: number | null
          dst_tds?: number | null
          espn_athlete_id: number
          fg_0_39?: number | null
          fg_40_49?: number | null
          fg_50_plus?: number | null
          fg_miss?: number | null
          fumbles_lost?: number | null
          game_id?: string | null
          id?: string
          league: string
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_ints?: number | null
          pass_tds?: number | null
          pass_yards?: number | null
          pat_made?: number | null
          player_id?: number | null
          rec_tds?: number | null
          rec_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rush_tds?: number | null
          rush_yards?: number | null
          season: number
          targets?: number | null
          two_pt_convs?: number | null
          updated_at?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['player_stats_raw']['Insert']>
        Relationships: [
          {
            foreignKeyName: "player_stats_raw_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      live_games: {
        Row: {
          away_score: number | null
          away_team: string
          game_id: string
          home_score: number | null
          home_team: string
          id: string
          last_play_index: number | null
          last_polled_at: string | null
          league: string
          season: number
          start_time: string | null
          status: string | null
          updated_at: string | null
          week: number
        }
        Insert: {
          away_score?: number | null
          away_team: string
          game_id: string
          home_score?: number | null
          home_team: string
          id?: string
          last_play_index?: number | null
          last_polled_at?: string | null
          league: string
          season: number
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['live_games']['Insert']>
        Relationships: []
      }
      live_player_stats: {
        Row: {
          dst_blocked: number | null
          dst_fumble_rec: number | null
          dst_ints: number | null
          dst_pts_allowed: number | null
          dst_sacks: number | null
          dst_safeties: number | null
          dst_tds: number | null
          espn_athlete_id: number
          fg_0_39: number | null
          fg_40_49: number | null
          fg_50_plus: number | null
          fg_miss: number | null
          fumbles_lost: number | null
          game_id: string
          id: string
          league: string
          pass_attempts: number | null
          pass_completions: number | null
          pass_ints: number | null
          pass_tds: number | null
          pass_yards: number | null
          pat_made: number | null
          player_id: number | null
          rec_tds: number | null
          rec_yards: number | null
          receptions: number | null
          rush_attempts: number | null
          rush_tds: number | null
          rush_yards: number | null
          season: number
          targets: number | null
          two_pt_convs: number | null
          updated_at: string | null
          week: number
        }
        Insert: {
          dst_blocked?: number | null
          dst_fumble_rec?: number | null
          dst_ints?: number | null
          dst_pts_allowed?: number | null
          dst_sacks?: number | null
          dst_safeties?: number | null
          dst_tds?: number | null
          espn_athlete_id: number
          fg_0_39?: number | null
          fg_40_49?: number | null
          fg_50_plus?: number | null
          fg_miss?: number | null
          fumbles_lost?: number | null
          game_id: string
          id?: string
          league: string
          pass_attempts?: number | null
          pass_completions?: number | null
          pass_ints?: number | null
          pass_tds?: number | null
          pass_yards?: number | null
          pat_made?: number | null
          player_id?: number | null
          rec_tds?: number | null
          rec_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rush_tds?: number | null
          rush_yards?: number | null
          season: number
          targets?: number | null
          two_pt_convs?: number | null
          updated_at?: string | null
          week: number
        }
        Update: Partial<Database['public']['Tables']['live_player_stats']['Insert']>
        Relationships: [
          {
            foreignKeyName: "live_player_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "live_games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "live_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_cache: {
        Row: {
          away_moneyline: number | null
          away_team: string
          away_win_pct: number | null
          game_key: string
          home_moneyline: number | null
          home_team: string
          home_win_pct: number | null
          league: string
          spread: number | null
          total_points: number | null
          updated_at: string
        }
        Insert: {
          away_moneyline?: number | null
          away_team: string
          away_win_pct?: number | null
          game_key: string
          home_moneyline?: number | null
          home_team: string
          home_win_pct?: number | null
          league: string
          spread?: number | null
          total_points?: number | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['odds_cache']['Insert']>
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          lead_hours_primary: number
          lead_hours_secondary: number
          league_id: string | null
          notify_draft: boolean
          notify_lineup: boolean
          notify_on_the_clock: boolean
          notify_pickem_deadline: boolean
          notify_trades: boolean
          notify_weekly_recap: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          lead_hours_primary?: number
          lead_hours_secondary?: number
          league_id?: string | null
          notify_draft?: boolean
          notify_lineup?: boolean
          notify_on_the_clock?: boolean
          notify_pickem_deadline?: boolean
          notify_trades?: boolean
          notify_weekly_recap?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>
        Relationships: [
          {
            foreignKeyName: "notification_preferences_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_drafts: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_pick: number | null
          current_round: number | null
          current_user_id: string | null
          draft_type: string
          id: string
          invite_code: string
          name: string
          num_rounds: number
          num_teams: number
          pick_started_at: string | null
          pick_timer: number
          player_pool: string
          scoring_type: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_pick?: number | null
          current_round?: number | null
          current_user_id?: string | null
          draft_type?: string
          id?: string
          invite_code?: string
          name?: string
          num_rounds?: number
          num_teams?: number
          pick_started_at?: string | null
          pick_timer?: number
          player_pool?: string
          scoring_type?: string
          status?: string
          updated_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['mock_drafts']['Insert']>
        Relationships: [
          {
            foreignKeyName: "mock_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_drafts_current_user_id_fkey"
            columns: ["current_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_draft_slots: {
        Row: {
          id: string
          is_host: boolean | null
          joined_at: string | null
          mock_draft_id: string | null
          slot_number: number
          team_name: string
          user_id: string | null
        }
        Insert: {
          id?: string
          is_host?: boolean | null
          joined_at?: string | null
          mock_draft_id?: string | null
          slot_number: number
          team_name?: string
          user_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['mock_draft_slots']['Insert']>
        Relationships: [
          {
            foreignKeyName: "mock_draft_slots_mock_draft_id_fkey"
            columns: ["mock_draft_id"]
            isOneToOne: false
            referencedRelation: "mock_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_draft_picks: {
        Row: {
          id: string
          is_ai_pick: boolean | null
          mock_draft_id: string | null
          pick_in_round: number
          pick_number: number
          picked_at: string | null
          player_id: number | null
          round_number: number
          slot_number: number
          user_id: string | null
        }
        Insert: {
          id?: string
          is_ai_pick?: boolean | null
          mock_draft_id?: string | null
          pick_in_round: number
          pick_number: number
          picked_at?: string | null
          player_id?: number | null
          round_number: number
          slot_number: number
          user_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['mock_draft_picks']['Insert']>
        Relationships: [
          {
            foreignKeyName: "mock_draft_picks_mock_draft_id_fkey"
            columns: ["mock_draft_id"]
            isOneToOne: false
            referencedRelation: "mock_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_draft_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string | null
          id: string
          requester_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          addressee_id: string
          created_at?: string | null
          id?: string
          requester_id: string
          status?: string
          updated_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['friendships']['Insert']>
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: Partial<Database['public']['Tables']['direct_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: "direct_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          channel: string
          dedupe_key: string
          error: string | null
          event_type: string
          id: string
          league_id: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          dedupe_key: string
          error?: string | null
          event_type: string
          id?: string
          league_id?: string | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['reminder_log']['Insert']>
        Relationships: [
          {
            foreignKeyName: "reminder_log_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_draft_pick: { Args: { p_league_id: string }; Returns: undefined }
      effective_notification_prefs: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: {
          email_enabled: boolean
          lead_hours_primary: number
          lead_hours_secondary: number
          notify_draft: boolean
          notify_lineup: boolean
          notify_on_the_clock: boolean
          notify_pickem_deadline: boolean
          notify_trades: boolean
          notify_weekly_recap: boolean
          sms_enabled: boolean
        }[]
      }
      get_my_league_ids: { Args: never; Returns: string[] }
      get_standings: {
        Args: { p_league_id: string }
        Returns: {
          losses: number
          points_against: number
          points_for: number
          team_name: string
          ties: number
          user_id: string
          waiver_priority: number
          wins: number
        }[]
      }
      is_league_commissioner: {
        Args: { check_league_id: string }
        Returns: boolean
      }
      recalc_league_scores: { Args: { p_league_id: string }; Returns: number }
      set_week_tiebreaker: {
        Args: { p_season: number; p_sport: string; p_week: number }
        Returns: undefined
      }
      status_multiplier: { Args: { p_status: string }; Returns: number }
      user_emails: {
        Args: never
        Returns: { email: string; id: string }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// NOTE: these must stay `type` aliases, not `interface` — postgrest-js
// 2.x's .insert()/.update() overload resolution silently collapses to
// `never` when the Row/Insert/Update shape is (even transitively, via
// `extends` or an interface nested in an intersection) built from an
// interface rather than a plain object type. Confirmed by isolated
// repro; this was already broken pre-existing, on every table.
export type Profile = {
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

export type Player = {
  id: number
  name: string
  team: string
  pos: PlayerPos
  depth_pos: string | null
  league: PlayerLeague
  conference: string | null
  college: string | null
  avg_pts: number
  proj_pts: number
  adp: number
  status: PlayerStatus
  injury_note: string | null
  is_rookie: boolean | null
  espn_athlete_id: number | null
  created_at: string
  updated_at: string
}

export type ScoringRules = {
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

export type RosterSlotConfig = {
  slots_qb: number
  slots_rb: number
  slots_wr: number
  slots_te: number
  slots_flex: number
  slots_dst: number
  slots_k: number
  slots_bench: number
  slots_ir: number
  slots_cfb_os: number
}

export type PlayerPool = 'nfl' | 'cfb' | 'both'

export type League = ScoringRules & RosterSlotConfig & {
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
  trade_mode: 'instant' | 'commissioner_review' | 'league_vote'
  trade_review_hours: number
  trade_deadline_week: number
  trade_votes_required: number
  current_week: number
  season: number
  is_public: boolean
  invite_code: string
  created_at: string
  updated_at: string
}

export type LeagueMember = {
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

export type RosterEntry = {
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

export type DraftState = {
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

export type DraftPick = {
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

export type Matchup = {
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

export type Trade = {
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

export type WaiverClaim = {
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

export type Notification = {
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

export type LeagueMessage = {
  id: string
  league_id: string
  user_id: string | null
  message: string
  is_system: boolean
  created_at: string
  // Joined
  profiles?: Profile
}

export type WeeklyScore = {
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
  type: 'starter' | 'flex' | 'bench' | 'ir' | 'cfb_os'
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

export function canFillSlot(slot: SlotDef, pos: PlayerPos, playerLeague?: 'NFL' | 'CFB'): boolean {
  if (slot.type === 'bench') return true
  if (slot.type === 'ir') return false
  // CFB Offseason slots only accept CFB players
  if (slot.type === 'cfb_os') return playerLeague === 'CFB'
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
