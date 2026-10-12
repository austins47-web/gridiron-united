import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Clapperboard, Eye, Loader2, Megaphone, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { weekStory, type WarStory } from '@/components/conquest/warStory'
import { fetchSoFar, warAsItStands } from '@/components/conquest/warSoFar'
import { WarPoster } from '@/components/conquest/WarPoster'
import { Newsreel } from '@/components/conquest/Newsreel'
import type { ConquestData } from '@/components/conquest/conquestView'

type Pick = { key: 'final' | 'sofar'; label: string; war: ConquestData; story: WarStory }

/**
 * The remote's War Office: war posters and a newsreel of the last settled
 * week, or of the week being played as it stands, put on the Shop TV only
 * when the commissioner says so (nothing goes to the league chat), and
 * previewed here first. Made from the same war the TV has (shop-tv), so
 * the preview is what the TV shows.
 */
export function WarOfficeRemote({ leagueId, busy, onShow }: {
  leagueId: string
  busy: string | null
  onShow: (action: 'poster' | 'newsreel', sofar: boolean) => void
}) {
  const { data: war } = useQuery({
    queryKey: ['tv-war', leagueId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConquestData | null> => {
      const { data: token } = await supabase.rpc('league_tv_token', { p_league: leagueId })
      if (!token) return null
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shop-tv?token=${encodeURIComponent(token as string)}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        cache: 'no-store',
      })
      if (!r.ok) return null
      return ((await r.json()) as { conquest?: ConquestData | null }).conquest ?? null
    },
  })
  // The week being played, once its first game's done
  const playing = !!war?.lockAt && new Date(war.lockAt).getTime() <= Date.now()
  const { data: sofar } = useQuery({
    queryKey: ['war-sofar', leagueId],
    enabled: !!war && playing,
    staleTime: 60_000,
    queryFn: () => fetchSoFar({ leagueId }),
  })

  const picks = useMemo(() => {
    const out: Pick[] = []
    if (!war) return out
    const settled = weekStory(war)
    if (settled) out.push({ key: 'final', label: `Week ${settled.week} final`, war, story: settled })
    if (sofar) {
      const w = warAsItStands(war, sofar)
      const story = weekStory(w, sofar.pending)
      if (story) out.push({ key: 'sofar', label: `Week ${sofar.week} so far`, war: w, story })
    }
    return out
  }, [war, sofar])
  const [chosen, setChosen] = useState<'final' | 'sofar' | null>(null)
  const pick = picks.find(p => p.key === chosen) ?? picks[0] ?? null
  const [preview, setPreview] = useState(false)

  if (!war) return null
  const nextWeek = (war.lastWeek ?? war.startWeek - 1) + 1
  const show = (a: 'poster' | 'newsreel') => pick && onShow(a, pick.key === 'sofar')

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/60 p-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-gold" />
        <span className="text-sm font-bold text-white">War Office</span>
        {picks.length > 1 ? (
          <div className="ml-auto flex rounded-lg border border-field-700 overflow-hidden" role="group" aria-label="Which week">
            {picks.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setChosen(p.key)}
                aria-pressed={pick?.key === p.key}
                className={clsx('px-2 py-1 text-[11px] font-bold', pick?.key === p.key ? 'bg-gold text-field-950' : 'text-field-300 hover:text-white')}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : pick && <span className="ml-auto text-xs text-field-400">{pick.label}</span>}
      </div>
      {!pick ? (
        <p className="mt-1.5 text-xs text-field-400">
          A war poster and a newsreel of each week&apos;s battles, for the TV. They&apos;re ready once Week {nextWeek}&apos;s first game is over.
        </p>
      ) : (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => setPreview(true)}
            aria-label="Preview the war poster and newsreel"
            className="shrink-0 w-[72px] rounded overflow-hidden border border-field-700 hover:border-gold/60"
          >
            <WarPoster spec={pick.story.posters[0]} owners={pick.war.owners} besieged={pick.war.besieged ?? {}} colorOf={colorFrom(pick.war)} className="w-full h-auto block" />
          </button>
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <p className="text-xs text-field-400 leading-snug">
              {pick.story.pending
                ? `Week ${pick.story.week} as it stands, with ${pick.story.pending} ${pick.story.pending === 1 ? 'game' : 'games'} still to play. The final version comes once the week settles.`
                : `${pick.story.posters.length > 1 ? 'Two posters' : 'A poster'} and a one-minute newsreel of Week ${pick.story.week}.`}
              {' '}Only on the TV, and only when you put them there.
            </p>
            <div className="grid grid-cols-3 gap-1.5 mt-auto">
              <button type="button" onClick={() => show('poster')} disabled={!!busy} className="flex items-center justify-center gap-1 rounded-lg border border-field-700 bg-field-800 px-2 py-2 text-xs font-bold text-field-200 hover:border-gold/50 hover:text-gold disabled:opacity-50">
                {busy === 'poster' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />} Poster
              </button>
              <button type="button" onClick={() => show('newsreel')} disabled={!!busy} className="flex items-center justify-center gap-1 rounded-lg border border-field-700 bg-field-800 px-2 py-2 text-xs font-bold text-field-200 hover:border-gold/50 hover:text-gold disabled:opacity-50">
                {busy === 'newsreel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />} Newsreel
              </button>
              <button type="button" onClick={() => setPreview(true)} className="flex items-center justify-center gap-1 rounded-lg border border-field-700 px-2 py-2 text-xs font-bold text-field-300 hover:text-white">
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
            </div>
          </div>
        </div>
      )}
      {preview && pick && <WarOfficePreview pick={pick} leagueId={leagueId} onClose={() => setPreview(false)} onShow={show} busy={busy} />}
    </div>
  )
}

const colorFrom = (war: ConquestData) => (id: string | null) => (id ? war.players.find(p => p.userId === id)?.color ?? null : null)

/** The poster and the newsreel on your phone, before (or instead of) the TV. */
function WarOfficePreview({ pick, leagueId, onClose, onShow, busy }: {
  pick: Pick
  leagueId: string
  onClose: () => void
  onShow: (action: 'poster' | 'newsreel') => void
  busy: string | null
}) {
  const { war, story } = pick
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', key) }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-field-950 flex flex-col" role="dialog" aria-modal="true" aria-label={`War Office, ${pick.label}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-field-800">
        <Megaphone className="w-4 h-4 text-gold" />
        <p className="font-cond font-black uppercase text-white tracking-wide">War Office · {pick.label}</p>
        <button onClick={onClose} aria-label="Close the preview" className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-field-300 hover:text-white hover:bg-field-800">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-cond font-bold uppercase tracking-wider text-sm text-field-200">Newsreel</h3>
              <button onClick={() => onShow('newsreel')} disabled={!!busy} className="ml-auto btn-gold !px-3 !py-1.5 !text-xs">
                {busy === 'newsreel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />} Play on the TV
              </button>
            </div>
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
              <Newsreel war={war} story={story} soundHint="Tap for sound" voiceFrom={{ leagueId }} />
            </div>
            <p className="text-[11px] text-field-500">The narrator&apos;s a 1940s newsreel announcer. On the TV it talks once the TV has had a click (or OK on its remote) since it last loaded; until then it plays with the captions, and the music dips while it runs.</p>
          </section>
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-cond font-bold uppercase tracking-wider text-sm text-field-200">{story.posters.length > 1 ? 'Posters' : 'Poster'}</h3>
              <button onClick={() => onShow('poster')} disabled={!!busy} className="ml-auto btn-gold !px-3 !py-1.5 !text-xs">
                {busy === 'poster' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />} Put on the TV
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {story.posters.map(p => (
                <WarPoster key={p.key} spec={p} owners={war.owners} besieged={war.besieged ?? {}} colorOf={colorFrom(war)} className="w-full h-auto rounded-sm shadow-xl shadow-black/50" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
