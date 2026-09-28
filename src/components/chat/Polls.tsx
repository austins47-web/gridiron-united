import { useState } from 'react'
import { BarChart3, Check, Mic, Plus, X, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { ModalPortal } from '@/components/ui/ModalPortal'
import type { PollWithVotes } from '@/hooks/useLeaguePolls'

/** A poll's chat message is `POLL:<poll id>` (see create_league_poll). */
export const POLL_PREFIX = 'POLL:'

function closesLabel(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Closed'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `Closes in ${Math.max(1, mins)}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `Closes in ${hrs}h`
  return `Closes in ${Math.round(hrs / 24)}d`
}

/**
 * A poll in the chat: tap an option to vote, tap it again to take the
 * vote back. Everyone sees the bars as votes come in; "Who voted" shows
 * the names. The Commish's weekly poll gets his header.
 */
export function PollCard({ data, myId, nameOf, onVote, fromCommish = false }: {
  data: PollWithVotes
  myId?: string
  nameOf: (userId: string) => string
  onVote: (option: number) => void
  fromCommish?: boolean
}) {
  const { poll, votes } = data
  const [showVoters, setShowVoters] = useState(false)
  const closed = !!poll.closes_at && new Date(poll.closes_at) <= new Date()
  const total = votes.length
  const mine = votes.find(v => v.user_id === myId)?.option_index
  const counts = poll.options.map((_, i) => votes.filter(v => v.option_index === i).length)
  const top = Math.max(0, ...counts)
  const closing = closesLabel(poll.closes_at)

  return (
    <div className="w-full max-w-sm rounded-2xl border border-gold/30 bg-field-800 overflow-hidden text-left">
      <div className="flex items-center gap-1.5 px-3.5 pt-3 text-[11px] font-cond font-bold uppercase tracking-[0.16em] text-gold">
        {fromCommish ? <Mic className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
        {fromCommish ? "The Commish's poll" : 'Poll'}
      </div>
      <p className="px-3.5 pt-1 pb-2.5 font-bold text-white text-[15px] leading-snug break-words">{poll.question}</p>

      <div className="px-2.5 space-y-1.5">
        {poll.options.map((opt, i) => {
          const n = counts[i]
          const pct = total > 0 ? Math.round((n / total) * 100) : 0
          const isMine = mine === i
          const leading = closed && n > 0 && n === top
          const voters = votes.filter(v => v.option_index === i).map(v => nameOf(v.user_id))
          return (
            <div key={i}>
              <button
                onClick={() => onVote(i)}
                disabled={closed || !myId}
                aria-pressed={isMine}
                className={clsx(
                  'relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors',
                  isMine ? 'border-gold/70' : 'border-field-600',
                  !closed && 'hover:border-gold/50 active:scale-[0.99]',
                  closed && 'cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={clsx('absolute inset-y-0 left-0 transition-[width] duration-500', isMine || leading ? 'bg-gold/25' : 'bg-field-600/50')}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center gap-2">
                  <span className={clsx('min-w-0 flex-1 text-sm break-words', isMine || leading ? 'font-bold text-white' : 'text-field-100')}>
                    {opt}
                  </span>
                  {isMine && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
                  <span className="shrink-0 text-xs tabular-nums text-field-300">
                    <span className="font-bold text-white">{pct}%</span> · {n}
                  </span>
                </span>
              </button>
              {showVoters && voters.length > 0 && (
                <p className="px-2 pt-0.5 text-[11px] text-field-400 leading-snug">{voters.join(', ')}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-3.5 py-2.5 text-[11px] text-field-400">
        <span>{total} vote{total === 1 ? '' : 's'}</span>
        {closing && <span className={clsx(closed && 'font-bold text-field-300')}>· {closing}</span>}
        {!closed && mine == null && <span className="text-field-500">· Tap to vote</span>}
        {total > 0 && (
          <button onClick={() => setShowVoters(v => !v)} className="ml-auto font-bold text-gold hover:text-gold-light">
            {showVoters ? 'Hide voters' : 'Who voted'}
          </button>
        )}
      </div>
    </div>
  )
}

const CLOSE_CHOICES = [
  { key: 'none', label: 'No end' },
  { key: '1h', label: '1 hour' },
  { key: '1d', label: '1 day' },
  { key: 'kickoff', label: 'At kickoff' },
] as const
type CloseChoice = typeof CLOSE_CHOICES[number]['key']

/**
 * Start a poll: a question, 2–6 options and when it closes. In a game
 * thread it can close at that game's kickoff.
 */
export function PollComposer({ leagueId, gameId, kickoff, onClose, onPosted }: {
  leagueId: string
  /** Posting in a game thread. */
  gameId?: string | null
  /** That game's kickoff, when it's still ahead. */
  kickoff?: string | null
  onClose: () => void
  onPosted?: () => void
}) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [closes, setCloses] = useState<CloseChoice>(kickoff ? 'kickoff' : 'none')
  const [posting, setPosting] = useState(false)

  const filled = options.map(o => o.trim()).filter(Boolean)
  const canPost = question.trim().length > 0 && filled.length >= 2 && !posting
  const choices = CLOSE_CHOICES.filter(c => c.key !== 'kickoff' || kickoff)

  const post = async () => {
    if (!canPost) return
    setPosting(true)
    const closesAt = closes === '1h' ? new Date(Date.now() + 3600_000).toISOString()
      : closes === '1d' ? new Date(Date.now() + 24 * 3600_000).toISOString()
      : closes === 'kickoff' ? kickoff ?? null
      : null
    const { error } = await supabase.rpc('create_league_poll', {
      p_league: leagueId,
      p_question: question.trim(),
      p_options: filled,
      p_closes_at: closesAt,
      p_game: gameId ?? null,
    })
    setPosting(false)
    if (error) { toast.error(error.message); return }
    onPosted?.()
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-gold" />
          <h2 className="font-cond font-black text-lg text-white uppercase tracking-wider">Start a poll</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto p-1 text-field-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="label">Question</label>
        <input
          autoFocus
          value={question}
          onChange={e => setQuestion(e.target.value.slice(0, 140))}
          maxLength={140}
          placeholder="Who wins the division?"
          className="input w-full mb-3"
        />

        <label className="label">Options</label>
        <div className="space-y-2 mb-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={e => setOptions(o => o.map((x, j) => (j === i ? e.target.value.slice(0, 60) : x)))}
                maxLength={60}
                placeholder={`Option ${i + 1}`}
                className="input flex-1 !py-2"
              />
              {options.length > 2 && (
                <button
                  onClick={() => setOptions(o => o.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="p-1.5 text-field-500 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button
            onClick={() => setOptions(o => [...o, ''])}
            className="flex items-center gap-1 text-xs font-bold text-gold hover:text-gold-light mb-4"
          >
            <Plus className="w-3.5 h-3.5" /> Add an option
          </button>
        )}

        <label className="label">Voting closes</label>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {choices.map(c => (
            <button
              key={c.key}
              onClick={() => setCloses(c.key)}
              className={clsx(
                'px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                closes === c.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-field-600 bg-field-800 text-field-300 hover:text-white',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button onClick={post} disabled={!canPost} className="btn-gold w-full justify-center">
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          Post the poll
        </button>
      </div>
    </ModalPortal>
  )
}
