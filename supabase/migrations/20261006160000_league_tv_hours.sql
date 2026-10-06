-- Closing time for the Shop TV (Commish panel → Shop TV → Shop hours):
-- { open: 'HH:MM', close: 'HH:MM', days: [0-6, Sunday = 0] }, by the TV's
-- own clock. Outside them the TV dims to a clock and checks in far less
-- often; any remote button wakes it for half an hour. Null: always on.
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS tv_hours jsonb;
