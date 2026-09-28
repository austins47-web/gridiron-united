import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pin, X, Pencil, PinOff, Loader2, CornerDownRight } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useLeaguePin } from '@/hooks/useLeaguePin'

const dismissKey = (leagueId: string) => `gu-pin-dismissed-${leagueId}`

function readDismissed(leagueId: string): string | null {
  try { return localStorage.getItem(dismissKey(leagueId)) } catch { return null }
}

/**
 * The commissioner's pinned announcement, at the top of Pick'Em and the
 * chat. On Pick'Em it can be dismissed until the next pin or edit; the
 * commissioner can edit or unpin it from here.
 */
export function PinnedBanner({ leagueId, isCommissioner, dismissible = false, onJump, className }: {
  leagueId: string
  /** Outer spacing — nothing renders when there's no pin. */
  className?: string
  isCommissioner?: boolean
  dismissible?: boolean
  /** Scrolls to the chat message it was pinned from, when that's loaded. */
  onJump?: (messageId: string) => boolean
}) {
  const { data: pin } = useLeaguePin(leagueId)
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(() => readDismissed(leagueId))
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [unpinning, setUnpinning] = useState(false)

  if (!pin) return null
  if (dismissible && dismissed === pin.updated_at) return null

  const author = pin.author?.display_name || pin.author?.username || 'The commissioner'
  const long = pin.message.length > 140

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(leagueId), pin.updated_at) } catch { /* shows again next visit */ }
    setDismissed(pin.updated_at)
  }
  const unpin = async () => {
    setUnpinning(true)
    const { error } = await supabase.rpc('unpin_league_announcement', { p_league: leagueId })
    setUnpinning(false)
    if (error) { toast.error(error.message); return }
    qc.setQueryData(['league-pin', leagueId], null)
    toast.success('Unpinned')
  }

  return (
    <div className={clsx("rounded-xl border border-gold/40 bg-gold/[0.07] px-3.5 py-2.5", className)}>
      <div className="flex items-center gap-1.5">
        <Pin className="w-3.5 h-3.5 text-gold shrink-0" />
        <span className="font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-gold">Pinned</span>
        <span className="text-[11px] text-field-400 truncate">· {author}</span>
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          {isCommissioner && (
            <>
              <button onClick={() => setEditing(true)} aria-label="Edit the announcement" title="Edit" className="p-1 text-field-400 hover:text-gold">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={unpin} disabled={unpinning} aria-label="Unpin" title="Unpin" className="p-1 text-field-400 hover:text-red-400">
                {unpinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PinOff className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          {dismissible && (
            <button onClick={dismiss} aria-label="Hide until the next announcement" title="Hide" className="p-1 text-field-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className={clsx('mt-1 text-sm text-white leading-snug whitespace-pre-line break-words', !expanded && long && 'line-clamp-3')}>
        {pin.message}
      </p>
      {(long || (onJump && pin.source_message_id)) && (
        <div className="mt-1 flex items-center gap-3 text-[11px] font-bold">
          {long && (
            <button onClick={() => setExpanded(e => !e)} className="text-gold hover:text-gold-light">
              {expanded ? 'Show less' : 'Read it all'}
            </button>
          )}
          {onJump && pin.source_message_id && (
            <button
              onClick={() => { if (!onJump(pin.source_message_id!)) toast("That message is further back than the chat has loaded") }}
              className="flex items-center gap-0.5 text-field-400 hover:text-white"
            >
              <CornerDownRight className="w-3 h-3" /> In the chat
            </button>
          )}
        </div>
      )}
      {editing && <PinComposer leagueId={leagueId} initial={pin.message} onClose={() => setEditing(false)} />}
    </div>
  )
}

/**
 * The commissioner writing (or rewriting) the league's announcement.
 * A new one can go in the chat too; everyone gets a notification.
 */
export function PinComposer({ leagueId, initial = '', onClose }: {
  leagueId: string
  initial?: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState(initial)
  const [post, setPost] = useState(!initial)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const message = text.trim()
    if (!message) return
    setSaving(true)
    const { error } = await supabase.rpc('pin_league_announcement', { p_league: leagueId, p_message: message, p_post: post, p_notify: !initial })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['league-pin', leagueId] })
    toast.success('Pinned for the whole league')
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Pin className="w-5 h-5 text-gold" />
          <h2 className="font-cond font-black text-lg text-white uppercase tracking-wider">
            {initial ? 'Edit the announcement' : 'Pin an announcement'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto p-1 text-field-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-field-400 text-sm mb-3">
          {initial
            ? "Saving an edit doesn't notify everyone again."
            : "It sits at the top of Pick'Em and the chat until you unpin it, and everyone gets a notification."}
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={4}
          placeholder="Picks lock Thursday at 8 PM ET this week. Loser buys wings."
          className="input w-full resize-none mb-1"
        />
        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-2 text-sm text-field-200 cursor-pointer">
            <input type="checkbox" checked={post} onChange={e => setPost(e.target.checked)} className="accent-[#CE7B45] w-4 h-4" />
            Post it in the chat too
          </label>
          <span className={clsx('text-xs', text.length > 450 ? 'text-gold' : 'text-field-500')}>{text.length}/500</span>
        </div>
        <button onClick={save} disabled={!text.trim() || saving} className="btn-gold w-full justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pin className="w-4 h-4" />}
          {initial ? 'Save' : 'Pin it'}
        </button>
      </div>
    </ModalPortal>
  )
}
