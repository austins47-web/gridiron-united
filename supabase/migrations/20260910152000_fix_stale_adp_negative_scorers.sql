-- Same issue as 20260910140200_fix_stale_adp_for_zero_scorers.sql,
-- widened: that pass only reset adp for avg_pts = 0 exactly, but a
-- player can also net NEGATIVE (a kicker whose missed field goals
-- outweigh makes, e.g.) - found one directly (a CFB kicker at
-- avg_pts = -0.10 still carrying a stale adp of 29, from before the
-- sync functions excluded non-positive values from ranking). Every
-- ranking pass since has correctly excluded avg_pts <= 0 from being
-- ranked at all, so any row still showing a real adp despite
-- avg_pts <= 0 is leftover from before that fix existed.
update players
set adp = 999
where league in ('NFL', 'CFB') and avg_pts <= 0 and adp <> 999;
