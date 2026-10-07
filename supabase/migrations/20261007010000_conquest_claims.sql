-- Conquest: choose your flag. The open city you'd claim this week (if you
-- finish in the top half) is kept with your attack order: either can be
-- set on its own, and both stay secret until the week's first kickoff
-- (the conquest_orders_read policy already covers the row).
ALTER TABLE public.conquest_orders ALTER COLUMN target_id DROP NOT NULL;
ALTER TABLE public.conquest_orders ADD COLUMN IF NOT EXISTS claim text;
ALTER TABLE public.conquest_orders DROP CONSTRAINT IF EXISTS conquest_orders_has_order;
ALTER TABLE public.conquest_orders ADD CONSTRAINT conquest_orders_has_order CHECK (target_id IS NOT NULL OR claim IS NOT NULL);
