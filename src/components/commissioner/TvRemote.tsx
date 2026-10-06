import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Mic, ListOrdered, LayoutGrid, X, RotateCw, Send, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { TV_MOMENTS, type TvMoment } from '@/lib/holiday'

type Action = 'roast' | 'standings' | 'board' | 'announce' | 'moment' | 'clear' | 'reload'

/**
 * The commissioner's remote for the Shop TV: put the roast, the season
 * standings, the picks board, an announcement or a moment on the TV
 * right now (tv_remote, over the TV's private channel), clear it, or
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

  // How many TVs are on: their presence on the TV's channel
  const [tvsOn, setTvsOn] = useState<number | null>(null)
  useEffect(() => {
    if (!hasTv) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let alive = true
    supabase.rpc('league_tv_token', { p_league: leagueId }).then(({ data: token }) => {
      if (!alive || !token) return
      channel = supabase.channel(`tv:${token}`, { config: { private: true } })
      channel
        .on('presence', { event: 'sync' }, () => setTvsOn(Object.keys(channel!.presenceState()).length))
        .subscribe(status => { if (status === 'SUBSCRIBED') setTvsOn(n => n ?? 0) })
    })
    return () => { alive = false; if (channel) supabase.removeChannel(channel) }
  }, [hasTv, leagueId])

  const [busy, setBusy] = useState<string | null>(null)
  const [text, setText] = useState('')
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

      <div className="grid grid-cols-3 gap-2">
        {button('roast', 'Roast', <Mic className="w-5 h-5" />, 'The roast is on the TV')}
        {button('standings', 'Standings', <ListOrdered className="w-5 h-5" />, 'Standings are on the TV')}
        {button('board', 'Picks board', <LayoutGrid className="w-5 h-5" />, 'The picks board is on the TV')}
      </div>

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
