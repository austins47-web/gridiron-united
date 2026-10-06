import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Mic, ListOrdered, LayoutGrid, X, RotateCw, Send, Loader2, Clapperboard, BarChart3, Plus, MessageSquare, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { TV_MOMENTS, type TvMoment } from '@/lib/holiday'
import { useTvReactions } from '@/hooks/useTvReactions'
import { TvChatBox } from '@/components/tv/TvReactions'

type Action = 'roast' | 'standings' | 'board' | 'replay' | 'announce' | 'moment' | 'clear' | 'reload'

/** What the TV's Spotify speaker is doing (its presence), worst news first. */
const SPEAKER_ORDER = ['blocked', 'unsupported', 'premium', 'auth', 'error', 'connecting', 'ready']
const SPEAKER_NOTES: Record<string, string> = {
  ready: 'The TV is in Spotify’s list of devices. Pick it in Spotify to play the music there.',
  connecting: 'Connecting the TV to Spotify…',
  blocked: 'Spotify is sending music to the TV, but its browser is holding the sound back: click the TV screen (or press OK on its remote) once.',
  unsupported: 'This TV’s browser can’t play Spotify, so it can’t be the speaker (the song still shows). On a Fire TV, try the Spotify app: start the music there, then go back to the TV page in Silk.',
  premium: 'Spotify only plays on the TV with Premium.',
  auth: 'Spotify needs connecting again (Music on the TV, below).',
  error: 'The TV couldn’t reach Spotify. Reload tries again.',
}

/**
 * The commissioner's remote for the Shop TV: put the roast, the season
 * standings, the picks board, the week's replay, a live poll, an
 * announcement or a moment on the TV right now (tv_remote, over the TV's private channel), clear it, or
 * reload it. Shows whether a TV is on (its presence on that channel).
 */
export function TvRemote({ leagueId }: { leagueId: string }) {
  const { data: hasTv = false } = useQuery({
    queryKey: ['league-has-tv', leagueId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('league_has_tv', { p_league: leagueId })
      if (error) throw error
      return !!data
    },
  })

  // How many TVs are on (their presence on the TV's channel), whether any
  // is on lighter effects (a Fire TV, or one that was dropping frames), and
  // the slowest one's last frames a second
  const [tvsOn, setTvsOn] = useState<number | null>(null)
  const [tvLite, setTvLite] = useState(false)
  const [tvFps, setTvFps] = useState<number | null>(null)
  // The TV's Spotify speaker (Music on the TV), the most useful one if there are a few
  const [speaker, setSpeaker] = useState<string | null>(null)
  useEffect(() => {
    if (!hasTv) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let alive = true
    supabase.rpc('league_tv_token', { p_league: leagueId }).then(({ data: token }) => {
      if (!alive || !token) return
      channel = supabase.channel(`tv:${token}`, { config: { private: true } })
      channel
        .on('presence', { event: 'sync' }, () => {
          // Every TV joins under the key 'tv': count them, not the keys
          const tvs = Object.values(channel!.presenceState()).flat() as { fx?: string; speaker?: string; fps?: number | null }[]
          setTvsOn(tvs.length)
          setTvLite(tvs.some(t => t.fx === 'lite'))
          const fps = tvs.map(t => t.fps).filter((n): n is number => typeof n === 'number')
          setTvFps(fps.length ? Math.min(...fps) : null)
          const states = tvs.map(t => t.speaker).filter((s): s is string => !!s && s !== 'off')
          setSpeaker(SPEAKER_ORDER.find(s => states.includes(s)) ?? null)
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') setTvsOn(n => n ?? 0) })
    })
    return () => { alive = false; if (channel) supabase.removeChannel(channel) }
  }, [hasTv, leagueId])

  const [busy, setBusy] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const { say, unsend } = useTvReactions()
  const press = async (action: Action, extra: { p_text?: string; p_moment?: TvMoment } = {}, done = 'On the TV') => {
    setBusy(action + (extra.p_moment ?? ''))
    const { error } = await supabase.rpc('tv_remote', { p_league: leagueId, p_action: action, ...extra })
    setBusy(null)
    if (error) { toast.error(error.message); return false }
    toast.success(tvsOn === 0 ? `${done}. The TV looks off right now, though.` : done)
    return true
  }
  const announce = async (e: FormEvent) => {
    e.preventDefault()
    if (text.trim() && await press('announce', { p_text: text.trim() }, 'Announced on the TV')) setText('')
  }

  if (!hasTv) return null

  const button = (action: Action, label: string, icon: JSX.Element, done?: string) => (
    <button
      onClick={() => press(action, {}, done)}
      disabled={!!busy}
      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-field-700 bg-field-800 px-2 py-3 text-xs font-bold text-field-200 hover:border-gold/50 hover:text-gold transition-colors disabled:opacity-50"
    >
      {busy === action ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {label}
    </button>
  )

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">TV remote</span>
        <span className={clsx('flex items-center gap-1.5 text-xs font-bold', tvsOn ? 'text-nfl' : 'text-field-500')}>
          <span className={clsx('w-2 h-2 rounded-full', tvsOn ? 'bg-nfl animate-pulse' : 'bg-field-600')} />
          {tvsOn == null ? 'Checking the TV…' : tvsOn > 0 ? `TV is on${tvsOn > 1 ? ` (${tvsOn})` : ''}` : 'TV looks off'}
        </span>
      </div>
      {!!tvsOn && speaker && SPEAKER_NOTES[speaker] && (
        <p className={clsx('-mt-2 text-[11px]', speaker === 'ready' ? 'text-[#1DB954]' : speaker === 'connecting' ? 'text-field-400' : 'text-amber-300')}>
          🔊 {SPEAKER_NOTES[speaker]}
        </p>
      )}
      {!!tvsOn && tvLite && (
        <p className="-mt-2 text-[11px] text-field-400">
          Running lighter effects so it stays smooth: the ticker steps through instead of scrolling, panels switch without animating, the background holds still and the holiday fog is off.
          {tvFps != null && <> Last check: {tvFps} frames a second{tvFps >= 50 ? ' (smooth)' : tvFps >= 30 ? ' (a little choppy)' : ' (choppy)'}.</>}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {button('roast', 'Roast', <Mic className="w-5 h-5" />, 'The roast is on the TV')}
        {button('standings', 'Standings', <ListOrdered className="w-5 h-5" />, 'Standings are on the TV')}
        {button('board', 'Picks board', <LayoutGrid className="w-5 h-5" />, 'The picks board is on the TV')}
        {button('replay', 'Replay', <Clapperboard className="w-5 h-5" />, "The week's replay is on the TV")}
      </div>

      {/* The TV chat: say something on the TV, see what's been said, take anything down */}
      <div className="rounded-xl border border-field-700 bg-field-900/60">
        <button
          onClick={() => setChatOpen(o => !o)}
          aria-expanded={chatOpen}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-white"
        >
          <MessageSquare className="w-4 h-4 text-gold" /> TV chat
          <span className="ml-auto text-xs font-normal text-field-400">{chatOpen ? 'Hide' : 'Open'}</span>
          <ChevronDown className={clsx('w-4 h-4 text-field-400 transition-transform', chatOpen && 'rotate-180')} />
        </button>
        {chatOpen && (
          <div className="px-3 pb-3">
            <TvChatBox leagueId={leagueId} open say={say} unsend={unsend} isCommissioner bare />
          </div>
        )}
      </div>

      <TvPollForm leagueId={leagueId} tvOff={tvsOn === 0} />

      <form onSubmit={announce} className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-gold shrink-0" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={140}
          placeholder="Announcement, e.g. Lunch is here"
          aria-label="Announcement for the TV"
          className="input flex-1 min-w-0 !py-2 !text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || !!busy}
          aria-label="Put the announcement on the TV"
          className="shrink-0 w-9 h-9 rounded-lg bg-gold text-field-950 flex items-center justify-center disabled:opacity-40"
        >
          {busy === 'announce' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-field-500 mb-1.5">Play a moment</p>
        <div className="flex flex-wrap gap-1.5">
          {TV_MOMENTS.map(m => (
            <button
              key={m.kind}
              onClick={() => press('moment', { p_moment: m.kind }, `${m.label} on the TV`)}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg border border-field-700 bg-field-800 px-2.5 py-1.5 text-xs font-bold text-field-300 hover:border-gold/50 hover:text-gold transition-colors disabled:opacity-50"
            >
              {busy === 'moment' + m.kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span aria-hidden>{m.emoji}</span>} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => press('clear', {}, 'The TV is back to normal')} disabled={!!busy} className="btn-ghost flex-1 justify-center !py-1.5 !text-xs">
          <X className="w-3.5 h-3.5" /> Back to normal
        </button>
        <button onClick={() => press('reload', {}, 'The TV is reloading')} disabled={!!busy} className="btn-ghost flex-1 justify-center !py-1.5 !text-xs">
          <RotateCw className="w-3.5 h-3.5" /> Reload the TV
        </button>
      </div>
    </div>
  )
}

/**
 * A live poll on the TV (tv_poll): posted in the league chat, where
 * everyone votes, and up on the TV full screen with the votes coming in
 * until it closes.
 */
function TvPollForm({ leagueId, tvOff }: { leagueId: string; tvOff: boolean }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [minutes, setMinutes] = useState(2)
  const [busy, setBusy] = useState(false)
  const filled = options.filter(o => o.trim())
  const ready = question.trim().length > 0 && filled.length >= 2

  const start = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('tv_poll', { p_league: leagueId, p_question: question.trim(), p_options: filled.map(o => o.trim()), p_minutes: minutes })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(tvOff ? 'Poll is live in the chat. The TV looks off right now, though.' : 'Poll is live on the TV and in the chat')
    setQuestion('')
    setOptions(['', ''])
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-xl border border-field-700 bg-field-800 px-3 py-2.5 text-xs font-bold text-field-200 hover:border-gold/50 hover:text-gold transition-colors">
        <BarChart3 className="w-4 h-4" /> Start a live poll on the TV
      </button>
    )
  }
  return (
    <form onSubmit={start} className="rounded-xl border border-field-700 bg-field-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-field-300"><BarChart3 className="w-3.5 h-3.5 text-gold" /> Live poll</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-field-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        maxLength={140}
        placeholder="Question, e.g. Who wins tonight?"
        aria-label="Poll question"
        className="input w-full !py-2 !text-sm"
      />
      {options.map((o, i) => (
        <input
          key={i}
          value={o}
          onChange={e => setOptions(list => list.map((x, j) => (j === i ? e.target.value : x)))}
          maxLength={60}
          placeholder={`Answer ${i + 1}`}
          aria-label={`Answer ${i + 1}`}
          className="input w-full !py-2 !text-sm"
        />
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        {options.length < 4 && (
          <button type="button" onClick={() => setOptions(list => [...list, ''])} className="flex items-center gap-1 text-xs font-bold text-field-400 hover:text-gold">
            <Plus className="w-3.5 h-3.5" /> Add an answer
          </button>
        )}
        <span className="ml-auto text-xs text-field-400">Open for</span>
        {[1, 2, 5].map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMinutes(m)}
            aria-pressed={minutes === m}
            className={clsx('rounded-lg border px-2 py-1 text-xs font-bold', minutes === m ? 'bg-gold text-field-950 border-gold' : 'border-field-700 text-field-300 hover:border-gold/50')}
          >
            {m} min
          </button>
        ))}
      </div>
      <button type="submit" disabled={!ready || busy} className="btn-gold w-full justify-center !py-2 !text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Put it on the TV
      </button>
    </form>
  )
}
