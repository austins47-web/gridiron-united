-- Conquest sieges: a capital doesn't fall at the first defeat, it goes
-- under siege (besieged_by: who has it surrounded). The next win against
-- its owner takes it; a week nobody beats them and the siege lifts (a
-- 'relief' in the war log).
ALTER TABLE public.conquest_territories ADD COLUMN IF NOT EXISTS besieged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.conquest_moves DROP CONSTRAINT IF EXISTS conquest_moves_kind_check;
ALTER TABLE public.conquest_moves ADD CONSTRAINT conquest_moves_kind_check
  CHECK (kind IN ('capture', 'siege', 'relief', 'claim', 'rebellion'));
