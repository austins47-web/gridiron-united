-- Where the shop is, for the Shop TV's weather (Commish panel → Shop TV):
-- { name, lat, lon } from Open-Meteo's place search. The TV asks
-- Open-Meteo for the weather itself, so it costs no function calls.
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS tv_location jsonb;
