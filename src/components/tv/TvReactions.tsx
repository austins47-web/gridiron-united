import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Tv, Send, Undo2, Gamepad2, MessageSquare, Trash2, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'
import { TV_REACTIONS, TV_MESSAGE_MAX, useTvReactions, useTvChat } from '@/hooks/useTvReactions'

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

/** "now", "5m", "2h", "3d" */
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
}

/**
 * The TV chat: the TV's own, not the league chat. What's said here pops
 * up on the TV and is listed below the box, newest first; your own
 * messages have Unsend, and the commissioner can take anyone's down.
 * In the TV button's popup, and in the commissioner's TV remote (`bare`:
 * no divider or label of its own).
 */
export function TvChatBox({ leagueId, open, say, unsend, isCommissioner, bare = false }: {
  leagueId: string | null
  open: boolean
  say: (text: string) => Promise<string | null>
  unsend: (id: string) => Promise<boolean>
  isCommissioner: boolean
  bare?: boolean
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const { data: messages = [], isLoading } = useTvChat(leagueId, open)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    if (await say(text)) setText('')
    setSending(false)
  }
  const takeDown = async (id: string) => {
    setBusy(id)
    await unsend(id)
    setBusy(null)
  }
  return (
    <form onSubmit={submit} className={bare ? undefined : 'mt-2 pt-2 border-t border-field-700'}>
      {!bare && (
        <p className="px-0.5 pb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-field-400">
          <MessageSquare className="w-3 h-3" /> TV chat
        </p>
      )}
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
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {messages.length > 0 ? (
        <ul className="mt-2 max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
          {messages.map(m => (
            <li key={m.id} className="text-xs leading-snug">
              <div className="flex items-baseline gap-1.5">
                <span className={clsx('font-bold truncate', m.mine ? 'text-white' : 'text-gold')}>{m.mine ? 'You' : m.name}</span>
                <span className="text-field-500 shrink-0">{ago(m.created_at)}</span>
                {(m.mine || isCommissioner) && (
                  <button
                    type="button"
                    onClick={() => takeDown(m.id)}
                    disabled={busy === m.id}
                    className="ml-auto shrink-0 flex items-center gap-1 font-bold text-field-400 hover:text-red-400 disabled:opacity-50"
                  >
                    {m.mine ? <><Undo2 className="w-3 h-3" /> Unsend</> : <><Trash2 className="w-3 h-3" /> Delete</>}
                  </button>
                )}
              </div>
              <p className="text-field-200 break-words">{m.message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-0.5 pt-1.5 text-[11px] leading-snug text-field-500">
          {isLoading ? 'Loading the TV chat…' : 'Pops up on the TV. It’s the TV’s own chat: nothing here goes in the league chat.'}
        </p>
      )}
    </form>
  )
}

/**
 * A TV button with the emoji grid and the TV chat below it, any time
 * the league has a TV: small in the chat header, a gold header button on
 * Pick'Em.
 */
export function TvReactionButton({ variant = 'chat' }: { variant?: 'chat' | 'header' }) {
  const { enabled, leagueId, send, say, unsend } = useTvReactions()
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
        <div className="absolute right-0 top-full mt-2 z-30 w-72 max-w-[calc(100vw-2rem)] rise-in rounded-2xl border border-field-600 bg-field-800 shadow-2xl shadow-black/50 p-2">
          <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-field-400">On the Shop TV</p>
          <ReactionGrid send={send} />
          <TvChatBox leagueId={leagueId} open={open} say={say} unsend={unsend} isCommissioner={isCommissioner} />
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
