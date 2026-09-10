-- Cleanup: a handful of players (6 NFL, 57 CFB) ended up with a real
-- low adp (e.g. 4, 5, 6) left over from their per-chunk ranking, but
-- avg_pts = 0 — their true season fantasy total rounds to exactly
-- 0.0 (token usage, or stats that roughly cancel out), so the global
-- ADP recompute correctly excluded them (it only ranks avg_pts > 0
-- rows) but never reset their now-stale adp back to "unranked".
update players
set adp = 999
where league in ('NFL', 'CFB') and avg_pts = 0 and adp <> 999;
