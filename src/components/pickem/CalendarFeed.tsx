import { useState } from 'react'
import { CalendarPlus, Copy, Check, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Pick deadlines in your own calendar: a private feed (the calendar
 * edge function) with every pick lock in all your Pick'Em leagues and
 * an alert an hour before each — works whatever happens with email or
 * push. Subscribed, so new weeks and deadline changes show up on their
 * own.
 */
export function CalendarFeed() {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const { data: token } = useQuery({
    queryKey: ['calendar-token'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calendar_token' as any)
      if (error) throw error
      return data as unknown as string
    },
  })

  const https = token ? `${window.location.origin}/calendar/${token}/pickem.ics` : null
  const webcal = https?.replace(/^https?:/, 'webcal:') ?? null

  const copy = async () => {
    if (!https) return
    try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { toast.error("Couldn't copy the link") }
  }
  const reset = async () => {
    const { data, error } = await supabase.rpc('calendar_token' as any, { p_reset: true } as any)
    if (error) { toast.error("Couldn't reset the link"); return }
    qc.setQueryData(['calendar-token'], data)
    toast.success('New link made; the old one stopped working. Subscribe again with this one.')
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center gap-2">
        <CalendarPlus className="w-4 h-4 text-gold" />
        <h3 className="font-bold text-white text-sm">Deadlines in Your Calendar</h3>
      </div>
      <p className="text-xs text-field-400">
        Every pick lock in all your Pick&apos;Em leagues, with an alert an hour before. It updates by itself as the season goes.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={webcal ?? undefined}
          aria-disabled={!webcal}
          className="btn-gold justify-center !py-2.5 text-center"
        >
          <CalendarPlus className="w-4 h-4" /> Add to Calendar
        </a>
        <a
          href={webcal ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!webcal}
          className="btn-ghost justify-center !py-2.5 text-center"
        >
          Google Calendar
        </a>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button onClick={copy} disabled={!https} className="flex items-center gap-1 text-field-400 hover:text-white">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button onClick={reset} disabled={!token} className="flex items-center gap-1 text-field-500 hover:text-white ml-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Reset link
        </button>
      </div>
      <p className="text-[11px] text-field-500">
        iPhone and Mac: tap Add to Calendar. Android: use Google Calendar. The link is private to you; reset it if you share it by mistake.
      </p>
    </div>
  )
}
