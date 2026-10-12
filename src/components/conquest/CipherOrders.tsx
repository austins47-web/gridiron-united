import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { swatch } from './conquestView'

/** Letters a cipher's made of (no 0/O, 1/I/L to muddle) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const scramble = (n: number) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

/** A steady cipher for someone's sealed order this week: "XQ7-RT9-KM2" */
export function cipherOf(seed: string): string {
  let h = 2166136261
  const out: string[] = []
  for (let i = 0; i < 9; i++) {
    for (const c of `${seed}|${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
    out.push(ALPHABET[h % ALPHABET.length])
  }
  return `${out.slice(0, 3).join('')}-${out.slice(3, 6).join('')}-${out.slice(6).join('')}`
}

export interface CipherRow {
  key: string
  name: string
  color: string
  /** who it's on, once it's out (null while it's sealed) */
  target: string | null
  /** the code it shows while sealed */
  code: string
}

const STEP_MS = 55
/** How long one row takes to come out of code, and the wait before the next starts */
const DECODE_MS = 1300
const STAGGER_MS = 350

/**
 * Attack orders as coded messages: sealed, a cipher with a couple of its
 * letters always turning over; once they're out (the week's first
 * kickoff), each decrypts letter by letter into who it's on, row after
 * row, if `animate` (otherwise they just show).
 */
export function CipherOrders({ rows, animate = false, big = false }: { rows: CipherRow[]; animate?: boolean; big?: boolean }) {
  const [t, setT] = useState(0)
  const sealed = rows.some(r => !r.target)
  const decoding = animate && rows.some(r => r.target)
  const total = decoding ? DECODE_MS + STAGGER_MS * Math.max(0, rows.length - 1) + 200 : 0
  useEffect(() => {
    if (!sealed && !decoding) return
    const start = performance.now()
    const id = setInterval(() => {
      const el = performance.now() - start
      setT(el)
      if (!sealed && el > total) clearInterval(id)
    }, decoding ? STEP_MS : 700)
    return () => clearInterval(id)
  }, [sealed, decoding, total])

  return (
    <ul className={clsx('space-y-1', big ? 'font-mono text-[19px]' : 'font-mono text-[13px]')}>
      {rows.map((r, i) => {
        let shown: string
        let done = true
        if (!r.target) {
          // Sealed: the code, a letter or two always turning over
          const turn = Math.floor(t / 700) % 9
          shown = r.code.split('').map((ch, k) => (ch !== '-' && (k + i) % 9 === turn ? scramble(1) : ch)).join('')
        } else {
          const plain = `→ ${r.target.toUpperCase()}`
          const into = animate ? Math.max(0, t - i * STAGGER_MS) / DECODE_MS : 1
          done = into >= 1
          const solved = Math.floor(Math.min(1, into) * plain.length)
          shown = done ? plain : plain.slice(0, solved) + scramble(Math.max(0, plain.length - solved)).replace(/./g, (c, k) => (plain[solved + k] === ' ' ? ' ' : c))
        }
        return (
          <li key={r.key} className="flex items-center gap-2 min-w-0">
            <span className={clsx('rounded-sm shrink-0', big ? 'w-4 h-4' : 'w-2.5 h-2.5')} style={swatch(r.color)} />
            <span className="font-cond font-bold text-white truncate">{r.name}</span>
            <span className={clsx('ml-auto shrink-0 tracking-wider tabular-nums', !r.target ? 'text-[#3fd0ff]' : done ? 'text-white font-bold' : 'text-amber-300')}>
              {r.target ? shown : `▸ ${shown}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
