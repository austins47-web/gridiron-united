import { Mic, CornerDownRight } from 'lucide-react'
import clsx from 'clsx'

/**
 * The Commish answering an @Commish question — posted by the
 * commish-chat edge function as `COMMISH_REPLY:<this, as JSON>`, a
 * system message threaded to the question (reply_to_id).
 */
export interface CommishReplyPayload {
  askedBy: string
  question: string
  text: string
}

export const COMMISH_REPLY_PREFIX = 'COMMISH_REPLY:'

export function CommishReplyCard({ data, timeLabel, isNew, onJump }: {
  data: CommishReplyPayload
  timeLabel: string
  isNew?: boolean
  onJump?: () => void
}) {
  return (
    <div className="flex justify-start pl-1 pr-8 my-1.5">
      <div className="w-7 shrink-0 self-end">
        <span className="w-7 h-7 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
          <Mic className="w-3.5 h-3.5 text-gold" strokeWidth={2.25} />
        </span>
      </div>
      <div className={clsx('ml-2 flex flex-col items-start max-w-[80%]', isNew && 'message-reveal')}>
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className="text-xs font-bold text-gold">The Commish</span>
          <span className="text-xs text-field-500">{timeLabel}</span>
        </div>
        <button
          onClick={onJump}
          className="flex items-start gap-1 text-[11px] text-field-500 mb-1 max-w-full text-left hover:text-field-300"
        >
          <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="truncate"><span className="font-bold text-field-400">{data.askedBy}:</span> {data.question}</span>
        </button>
        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm leading-relaxed break-words border border-gold/30 bg-field-800 text-field-100">
          {data.text}
        </div>
      </div>
    </div>
  )
}
