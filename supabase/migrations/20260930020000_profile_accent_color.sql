-- The accent color is each person's own choice now (Account → Appearance),
-- not the league's: profiles.accent_color replaces the copper across the
-- app for that person. leagues.brand_color is now only the Shop TV's own
-- accent (Commish panel → Shop TV); the league keeps its logo.
alter table public.profiles
  add column if not exists accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.leagues.brand_color is 'The Shop TV accent color (the app uses each person''s profiles.accent_color).';
comment on column public.profiles.accent_color is 'This person''s accent color in the app; null is the copper.';
