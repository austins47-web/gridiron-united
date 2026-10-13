-- Conquest: each player's city-weeks (the cities they held after each settled
-- week, added up). Breaks a tie for Emperor: holding ground all season beats
-- a lucky last week. The conquest function adds to it as each week settles.
ALTER TABLE public.conquest_players ADD COLUMN IF NOT EXISTS city_weeks int NOT NULL DEFAULT 0;
