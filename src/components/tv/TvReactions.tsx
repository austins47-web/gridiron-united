import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Tv, Send } from 'lucide-react'
import clsx from 'clsx'
import { TV_REACTIONS, TV_MESSAGE_MAX, useTvReactions } from '@/hooks/useTvReactions'

/** The emoji grid: each tap floats that emoji up the Shop TV with your name. */
function ReactionGrid({ send }: { send: (emoji: string) => void }) {
  const [pop, setPop] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-5 gap-1">
      {TV_REACTIONS.map(e => (
        <button
          key={e}
          onClick={() => { setPop(e); setTimeout(() => setPop(p => (p === e ? null : p)), 200); send(e) }}
          aria-label={`Send ${e} to the Shop TV`}
          className={clsx(
            'w-11 h-11 rounded-xl text-2xl leading-none flex items-center justify-center hover:bg-field-700 transition-transform active:scale-90',
            pop === e && 'scale-125',
          )}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

/** A message for the TV: posted to the league chat, which the TV pops up live. */
function TvMessageBox({ say }: { say: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    if (await say(text)) setText('')
    setSending(false)
  }
  return (
    <form onSubmit={submit} className="mt-2 pt-2 border-t border-field-700">
      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={TV_MESSAGE_MAX}
          placeholder="Say something on the TV…"
          aria-label="Message for the Shop TV"
          className="input flex-1 min-w-0 !py-2 !text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send to the TV"
          className="shrink-0 w-9 h-9 rounded-lg bg-gold text-field-950 flex items-center justify-center disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="px-0.5 pt-1 text-[10px] text-field-500">Pops up on the TV, and goes in the league chat.</p>
    </form>
  )
}

/**
 * A TV button with the emoji grid and a message box below it, any time
 * the league has a TV: small in the chat header, a gold header button on
 * Pick'Em.
 */
export function TvReactionButton({ variant = 'chat' }: { variant?: 'chat' | 'header' }) {
  const { enabled, send, say } = useTvReactions()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!enabled) return null
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="React on the Shop TV"
        aria-label="React on the Shop TV"
        aria-expanded={open}
        className={variant === 'header'
          ? clsx('p-2 rounded-xl border text-gold transition-colors', open ? 'bg-gold/20 border-gold' : 'bg-gold/10 border-gold/40 hover:bg-gold/20')
          : clsx('p-1 mr-1 rounded-lg transition-colors', open ? 'text-gold bg-gold/10' : 'text-field-400 hover:text-gold hover:bg-gold/10')}
      >
        <Tv className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 rise-in rounded-2xl border border-field-600 bg-field-800 shadow-2xl shadow-black/50 p-2">
          <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-field-400 whitespace-nowrap">On the Shop TV</p>
          <ReactionGrid send={send} />
          <TvMessageBox say={say} />
        </div>
      )}
    </div>
  )
}
