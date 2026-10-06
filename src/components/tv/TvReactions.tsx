import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Tv, Send, Undo2, Gamepad2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'
import { TV_REACTIONS, TV_MESSAGE_MAX, useTvReactions } from '@/hooks/useTvReactions'

/** The emoji grid: each tap floats that emoji up the Shop TV with your name. */
function ReactionGrid({ send }: { send: (emoji: string) => void }) {
  const [pop, setPop] = useState<string | null>(null)
  return (
    // Fixed columns: with fractional ones the grid could shrink below the
    // emojis and spill them out of the box on a phone
    <div className="grid grid-cols-[repeat(5,2.75rem)] gap-1 justify-center">
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

/**
 * A message for the TV: posted to the league chat, which the TV pops up
 * live. What you send from here is listed under it with Unsend, which
 * deletes it from the chat and takes it off the TV.
 */
function TvMessageBox({ say, unsend }: {
  say: (text: string) => Promise<string | null>
  unsend: (id: string) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ id: string; text: string; gone?: boolean }[]>([])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    const id = await say(text)
    if (id) {
      setSent(list => [{ id, text: text.trim() }, ...list].slice(0, 3))
      setText('')
    }
    setSending(false)
  }
  const takeBack = async (id: string) => {
    if (await unsend(id)) setSent(list => list.map(m => (m.id === id ? { ...m, gone: true } : m)))
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
      {sent.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {sent.map(m => (
            <li key={m.id} className="flex items-center gap-2 text-xs">
              <span className={clsx('flex-1 min-w-0 truncate', m.gone ? 'text-field-600 line-through' : 'text-field-300')}>{m.text}</span>
              {m.gone
                ? <span className="shrink-0 text-field-500">Unsent</span>
                : (
                  <button type="button" onClick={() => takeBack(m.id)} className="shrink-0 flex items-center gap-1 font-bold text-field-400 hover:text-red-400">
                    <Undo2 className="w-3 h-3" /> Unsend
                  </button>
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-0.5 pt-1 text-[11px] leading-snug text-field-500">Pops up on the TV, and goes in the league chat.</p>
      )}
    </form>
  )
}

/**
 * A TV button with the emoji grid and a message box below it, any time
 * the league has a TV: small in the chat header, a gold header button on
 * Pick'Em.
 */
export function TvReactionButton({ variant = 'chat' }: { variant?: 'chat' | 'header' }) {
  const { enabled, send, say, unsend } = useTvReactions()
  const isCommissioner = useAppStore(s => !!s.myMembership?.is_commissioner)
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
        // A set width: sized to its contents, the box shrank to its title
        // next to a small button and squeezed the emojis out
        <div className="absolute right-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-2rem)] rise-in rounded-2xl border border-field-600 bg-field-800 shadow-2xl shadow-black/50 p-2">
          <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-field-400">On the Shop TV</p>
          <ReactionGrid send={send} />
          <TvMessageBox say={say} unsend={unsend} />
          {isCommissioner && (
            <Link
              to="/app/commissioner?tab=extras"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/20"
            >
              <Gamepad2 className="w-3.5 h-3.5" /> TV remote
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
