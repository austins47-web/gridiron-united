-- Conquest: a rout (a win by 5 more than the battle needed) takes a second city,
-- logged with the tactic 'rout'
ALTER TABLE public.conquest_moves DROP CONSTRAINT IF EXISTS conquest_moves_tactic_check;
ALTER TABLE public.conquest_moves ADD CONSTRAINT conquest_moves_tactic_check CHECK (tactic IS NULL OR tactic IN ('ambush', 'second', 'cut', 'rout'));
