import { useEffect, useRef, useState } from 'react'
import { Tv } from 'lucide-react'
import clsx from 'clsx'
import { TV_REACTIONS, useTvReactions } from '@/hooks/useTvReactions'

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

/**
 * A TV button with the grid below it, while a game is on: small in the
 * chat header, a gold header button on Pick'Em (it used to float over
 * the pick cards and covered them).
 */
export function TvReactionButton({ variant = 'chat' }: { variant?: 'chat' | 'header' }) {
  const { enabled, send } = useTvReactions()
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
          <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-field-400 whitespace-nowrap">React on the Shop TV</p>
          <ReactionGrid send={send} />
        </div>
      )}
    </div>
  )
}
