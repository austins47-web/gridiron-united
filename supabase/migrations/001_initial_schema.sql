-- ============================================================
-- GRIDIRON UNITED — Complete Database Schema
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  favorite_nfl_team TEXT,
  favorite_cfb_team TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLAYERS (seeded from player data file)
-- ============================================================
CREATE TABLE public.players (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  pos TEXT NOT NULL CHECK (pos IN ('QB','RB','WR','TE','K','DST')),
  depth_pos TEXT, -- QB1, QB2, RB1, etc.
  league TEXT NOT NULL CHECK (league IN ('NFL','CFB')),
  conference TEXT,
  avg_pts DECIMAL(5,2) DEFAULT 0,
  proj_pts DECIMAL(5,2) DEFAULT 0,
  adp DECIMAL(6,2) DEFAULT 999,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','questionable','out','ir')),
  injury_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast player lookups
CREATE INDEX idx_players_pos ON public.players(pos);
CREATE INDEX idx_players_league ON public.players(league);
CREATE INDEX idx_players_team ON public.players(team);
CREATE INDEX idx_players_name ON public.players USING gin(to_tsvector('english', name));

-- ============================================================
-- LEAGUES
-- ============================================================
CREATE TABLE public.leagues (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  commissioner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  num_teams INTEGER DEFAULT 12 CHECK (num_teams IN (8,10,12,14,16)),
  scoring_type TEXT DEFAULT 'ppr' CHECK (scoring_type IN ('standard','half_ppr','ppr')),
  league_type TEXT DEFAULT 'redraft' CHECK (league_type IN ('redraft','keeper','dynasty')),
  draft_type TEXT DEFAULT 'snake' CHECK (draft_type IN ('snake','auction','linear')),
  draft_status TEXT DEFAULT 'pre_draft' CHECK (draft_status IN ('pre_draft','in_progress','completed')),
  draft_pick_timer INTEGER DEFAULT 90, -- seconds per pick
  current_week INTEGER DEFAULT 1,
  season INTEGER DEFAULT 2025,
  is_public BOOLEAN DEFAULT true,
  invite_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  -- Roster slot counts (editable per league)
  slots_qb INTEGER DEFAULT 1,
  slots_rb INTEGER DEFAULT 2,
  slots_wr INTEGER DEFAULT 2,
  slots_te INTEGER DEFAULT 1,
  slots_flex INTEGER DEFAULT 2,
  slots_dst INTEGER DEFAULT 1,
  slots_k INTEGER DEFAULT 1,
  slots_bench INTEGER DEFAULT 6,
  slots_ir INTEGER DEFAULT 1,
  -- Scoring rules (editable per league)
  score_pass_td DECIMAL(4,2) DEFAULT 4,
  score_pass_yd DECIMAL(5,4) DEFAULT 0.04,  -- per yard (0.04 = 1pt/25yds)
  score_pass_bonus_300 DECIMAL(4,2) DEFAULT 3,
  score_pass_int DECIMAL(4,2) DEFAULT -2,
  score_rush_td DECIMAL(4,2) DEFAULT 6,
  score_rush_yd DECIMAL(5,4) DEFAULT 0.1,   -- per yard (0.1 = 1pt/10yds)
  score_rush_bonus_100 DECIMAL(4,2) DEFAULT 3,
  score_rec_td DECIMAL(4,2) DEFAULT 6,
  score_rec_yd DECIMAL(5,4) DEFAULT 0.1,
  score_rec_bonus_100 DECIMAL(4,2) DEFAULT 3,
  score_reception DECIMAL(4,2) DEFAULT 0.5, -- PPR value (0=std, 0.5=half, 1=full)
  score_fumble_lost DECIMAL(4,2) DEFAULT -2,
  score_2pt_conv DECIMAL(4,2) DEFAULT 2,
  score_fg_0_39 DECIMAL(4,2) DEFAULT 3,
  score_fg_40_49 DECIMAL(4,2) DEFAULT 4,
  score_fg_50_plus DECIMAL(4,2) DEFAULT 5,
  score_pat DECIMAL(4,2) DEFAULT 1,
  score_fg_miss DECIMAL(4,2) DEFAULT -1,
  score_dst_sack DECIMAL(4,2) DEFAULT 1,
  score_dst_int DECIMAL(4,2) DEFAULT 2,
  score_dst_fumble_rec DECIMAL(4,2) DEFAULT 2,
  score_dst_td DECIMAL(4,2) DEFAULT 6,
  score_dst_safety DECIMAL(4,2) DEFAULT 2,
  score_dst_blocked DECIMAL(4,2) DEFAULT 2,
  score_dst_pts_0 DECIMAL(4,2) DEFAULT 10,
  score_dst_pts_1_6 DECIMAL(4,2) DEFAULT 7,
  score_dst_pts_7_13 DECIMAL(4,2) DEFAULT 4,
  score_dst_pts_14_20 DECIMAL(4,2) DEFAULT 1,
  score_dst_pts_21_27 DECIMAL(4,2) DEFAULT 0,
  score_dst_pts_28_34 DECIMAL(4,2) DEFAULT -1,
  score_dst_pts_35_plus DECIMAL(4,2) DEFAULT -4,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEAGUE MEMBERS
-- ============================================================
CREATE TABLE public.league_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL DEFAULT 'My Team',
  draft_position INTEGER,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points_for DECIMAL(8,2) DEFAULT 0,
  points_against DECIMAL(8,2) DEFAULT 0,
  waiver_priority INTEGER DEFAULT 1,
  faab_budget INTEGER DEFAULT 100,
  faab_spent INTEGER DEFAULT 0,
  is_commissioner BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

CREATE INDEX idx_league_members_league ON public.league_members(league_id);
CREATE INDEX idx_league_members_user ON public.league_members(user_id);

-- ============================================================
-- ROSTERS
-- ============================================================
CREATE TABLE public.rosters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES public.players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,  -- QB1, RB1, RB2, WR1, FLEX1, DST, K, BN1..BN6, IR1
  week INTEGER DEFAULT 0,  -- 0 = current roster, 1-18 = weekly lineup
  acquired_type TEXT DEFAULT 'draft' CHECK (acquired_type IN ('draft','waiver','trade','fa')),
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id, slot, week)
);

CREATE INDEX idx_rosters_league_user ON public.rosters(league_id, user_id);
CREATE INDEX idx_rosters_player ON public.rosters(player_id);

-- ============================================================
-- DRAFT STATE (real-time)
-- ============================================================
CREATE TABLE public.draft_state (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE UNIQUE,
  current_pick INTEGER DEFAULT 1,
  current_round INTEGER DEFAULT 1,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','paused','completed')),
  current_user_id UUID REFERENCES public.profiles(id),
  pick_started_at TIMESTAMPTZ,
  num_rounds INTEGER DEFAULT 15,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRAFT PICKS
-- ============================================================
CREATE TABLE public.draft_picks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES public.players(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  pick_in_round INTEGER NOT NULL,
  auto_picked BOOLEAN DEFAULT false,
  picked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, pick_number)
);

CREATE INDEX idx_draft_picks_league ON public.draft_picks(league_id);
CREATE INDEX idx_draft_picks_user ON public.draft_picks(league_id, user_id);

-- ============================================================
-- MATCHUPS
-- ============================================================
CREATE TABLE public.matchups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  home_user_id UUID REFERENCES public.profiles(id),
  away_user_id UUID REFERENCES public.profiles(id),
  home_score DECIMAL(8,2) DEFAULT 0,
  away_score DECIMAL(8,2) DEFAULT 0,
  is_complete BOOLEAN DEFAULT false,
  is_playoff BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matchups_league_week ON public.matchups(league_id, week);

-- ============================================================
-- TRADE PROPOSALS
-- ============================================================
CREATE TABLE public.trades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  proposer_id UUID REFERENCES public.profiles(id),
  receiver_id UUID REFERENCES public.profiles(id),
  proposer_player_ids INTEGER[] DEFAULT '{}',
  receiver_player_ids INTEGER[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','countered','expired')),
  message TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WAIVER WIRE CLAIMS
-- ============================================================
CREATE TABLE public.waiver_claims (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  add_player_id INTEGER REFERENCES public.players(id),
  drop_player_id INTEGER REFERENCES public.players(id),
  bid_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  priority INTEGER DEFAULT 1,
  week INTEGER NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WEEKLY SCORES (cached for performance)
-- ============================================================
CREATE TABLE public.weekly_scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  player_id INTEGER REFERENCES public.players(id),
  week INTEGER NOT NULL,
  points DECIMAL(6,2) DEFAULT 0,
  is_starter BOOLEAN DEFAULT false,
  stat_json JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id, player_id, week)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'trade_offer','draft_pick','waiver_result','matchup_result'
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);

-- ============================================================
-- LEAGUE CHAT
-- ============================================================
CREATE TABLE public.league_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_league ON public.league_messages(league_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, only update their own
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Players: everyone can read
CREATE POLICY "players_read_all" ON public.players FOR SELECT USING (true);

-- Leagues: public leagues readable by all; private by members
CREATE POLICY "leagues_read" ON public.leagues FOR SELECT
  USING (is_public = true OR commissioner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.league_members WHERE league_id = leagues.id AND user_id = auth.uid()));
CREATE POLICY "leagues_insert" ON public.leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leagues_update" ON public.leagues FOR UPDATE
  USING (commissioner_id = auth.uid());

-- League members: members can see their league's roster of members
CREATE POLICY "league_members_read" ON public.league_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members lm2 WHERE lm2.league_id = league_members.league_id AND lm2.user_id = auth.uid()));
CREATE POLICY "league_members_insert" ON public.league_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "league_members_update_own" ON public.league_members FOR UPDATE
  USING (auth.uid() = user_id);

-- Rosters: league members can see all rosters in their leagues
CREATE POLICY "rosters_read" ON public.rosters FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = rosters.league_id AND user_id = auth.uid()));
CREATE POLICY "rosters_write_own" ON public.rosters FOR ALL
  USING (auth.uid() = user_id);

-- Draft state: all league members can see it
CREATE POLICY "draft_state_read" ON public.draft_state FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = draft_state.league_id AND user_id = auth.uid()));

-- Draft picks: all league members can see all picks
CREATE POLICY "draft_picks_read" ON public.draft_picks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = draft_picks.league_id AND user_id = auth.uid()));
CREATE POLICY "draft_picks_insert" ON public.draft_picks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Matchups: league members can see their league's matchups
CREATE POLICY "matchups_read" ON public.matchups FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = matchups.league_id AND user_id = auth.uid()));

-- Trades: involved parties can see their trades
CREATE POLICY "trades_read" ON public.trades FOR SELECT
  USING (auth.uid() = proposer_id OR auth.uid() = receiver_id);
CREATE POLICY "trades_insert" ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = proposer_id);
CREATE POLICY "trades_update" ON public.trades FOR UPDATE
  USING (auth.uid() = proposer_id OR auth.uid() = receiver_id);

-- Waiver claims: users see their own
CREATE POLICY "waiver_read_own" ON public.waiver_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "waiver_insert_own" ON public.waiver_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "waiver_update_own" ON public.waiver_claims FOR UPDATE USING (auth.uid() = user_id);

-- Weekly scores: league members see all
CREATE POLICY "weekly_scores_read" ON public.weekly_scores FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = weekly_scores.league_id AND user_id = auth.uid()));

-- Notifications: users see their own
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- League chat: members see their league's chat
CREATE POLICY "messages_read" ON public.league_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.league_members WHERE league_id = league_messages.league_id AND user_id = auth.uid()));
CREATE POLICY "messages_insert" ON public.league_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.league_members WHERE league_id = league_messages.league_id AND user_id = auth.uid()));

-- ============================================================
-- REALTIME — enable for live features
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rosters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiver_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER leagues_updated_at BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER players_updated_at BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER draft_state_updated_at BEFORE UPDATE ON public.draft_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to advance draft pick (called when user makes pick)
CREATE OR REPLACE FUNCTION public.advance_draft_pick(p_league_id UUID)
RETURNS VOID AS $$
DECLARE
  v_state RECORD;
  v_num_teams INTEGER;
  v_total_picks INTEGER;
  v_next_pick INTEGER;
  v_next_round INTEGER;
  v_next_user_id UUID;
  v_pick_in_round INTEGER;
BEGIN
  SELECT ds.*, l.num_teams, l.num_teams * ds.num_rounds AS total
  INTO v_state
  FROM public.draft_state ds
  JOIN public.leagues l ON l.id = ds.league_id
  WHERE ds.league_id = p_league_id;

  v_next_pick := v_state.current_pick + 1;
  v_next_round := CEIL(v_next_pick::DECIMAL / v_state.num_rounds);

  IF v_next_pick > (v_state.num_teams * v_state.num_rounds) THEN
    UPDATE public.draft_state SET status = 'completed', updated_at = NOW()
    WHERE league_id = p_league_id;
    UPDATE public.leagues SET draft_status = 'completed' WHERE id = p_league_id;
    RETURN;
  END IF;

  -- Snake draft: odd rounds go 1→N, even rounds go N→1
  v_pick_in_round := v_next_pick - (v_next_round - 1) * v_state.num_teams;
  IF v_next_round % 2 = 0 THEN
    -- Reverse order
    SELECT user_id INTO v_next_user_id
    FROM public.league_members
    WHERE league_id = p_league_id
    ORDER BY draft_position DESC
    LIMIT 1 OFFSET (v_pick_in_round - 1);
  ELSE
    SELECT user_id INTO v_next_user_id
    FROM public.league_members
    WHERE league_id = p_league_id
    ORDER BY draft_position ASC
    LIMIT 1 OFFSET (v_pick_in_round - 1);
  END IF;

  UPDATE public.draft_state
  SET current_pick = v_next_pick,
      current_round = v_next_round,
      current_user_id = v_next_user_id,
      pick_started_at = NOW(),
      updated_at = NOW()
  WHERE league_id = p_league_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get league standings
CREATE OR REPLACE FUNCTION public.get_standings(p_league_id UUID)
RETURNS TABLE (
  user_id UUID,
  team_name TEXT,
  wins INTEGER,
  losses INTEGER,
  ties INTEGER,
  points_for DECIMAL,
  points_against DECIMAL,
  waiver_priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lm.user_id,
    lm.team_name,
    lm.wins,
    lm.losses,
    lm.ties,
    lm.points_for,
    lm.points_against,
    lm.waiver_priority
  FROM public.league_members lm
  WHERE lm.league_id = p_league_id
  ORDER BY lm.wins DESC, lm.points_for DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
