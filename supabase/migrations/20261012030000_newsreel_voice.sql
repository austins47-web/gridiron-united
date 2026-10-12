-- The newsreel's narrator: each line recorded once in the Transatlantic
-- newsreel voice (the newsreel-voice function, OpenAI text-to-speech) and
-- kept, so it's only ever paid for once. Anyone can play them (public
-- bucket); only the function writes them (the service role).
insert into storage.buckets (id, name, public)
values ('newsreel-voice', 'newsreel-voice', true)
on conflict (id) do nothing;

-- Each line recorded, for a daily cap per league (the function counts these;
-- nobody else reads or writes them: RLS on, no policies)
create table if not exists public.newsreel_voice_log (
  id         bigint generated always as identity primary key,
  league_id  uuid not null references public.leagues(id) on delete cascade,
  chars      int not null,
  created_at timestamptz not null default now()
);
create index if not exists newsreel_voice_log_league_time on public.newsreel_voice_log (league_id, created_at);
alter table public.newsreel_voice_log enable row level security;
