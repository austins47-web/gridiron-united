import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Share2, Trophy } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { whenDecided, type BadBeat } from './standings'
import { PickDNABars } from './PickDNA'
import type { SeasonProfile, PickDNA, PickTraits } from './season'

interface Slide { key: string; bg: string; body: ReactNode }

const weekLabel = (w: number) =>
  w === 19 ? 'Wild Card weekend' : w === 20 ? 'the Divisional round' : w === 21 ? 'Championship weekend' : w === 22 ? 'the Super Bowl' : `Week ${w}`

/**
 * Pick'Em Wrapped: one player's season as tap-through story slides —
 * record, best week, pick personality (Pick DNA), boldest call, the
 * bad beat that hurt most, best and worst teams, the Belt — ending on
 * a summary card they can share as an image. "So far" until the
 * season's over. Built from the same season data as the Season card.
 */
export function PickemWrapped({
  profile, dna, leagueDna, worstBeat, beltWeeks, leagueName, totalPlayers, throughWeek, seasonOver, isYou, onClose,
}: {
  profile: SeasonProfile
  dna: PickDNA | null
  leagueDna: PickTraits | null
  worstBeat: BadBeat | null
  /** Weeks this player has held the belt. */
  beltWeeks: number
  leagueName: string
  totalPlayers: number
  throughWeek: number | null
  seasonOver: boolean
  isYou: boolean
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const [sharing, setSharing] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  const s = profile.standing
  const losses = Math.max(0, s.played - s.correct)
  const you = isYou ? 'You' : profile.name
  const your = isYou ? 'Your' : `${profile.name}'s`
  const call = profile.boldestCall

  const slides: Slide[] = [
    {
      key: 'intro', bg: 'from-gold/35 via-field-900 to-field-950',
      body: (
        <>
          <Kicker>{leagueName}</Kicker>
          <p className="font-cond font-black uppercase text-white text-6xl leading-[0.85] mt-3">Pick&apos;Em<br />Wrapped</p>
          <p className="text-field-200 text-lg mt-5">{isYou ? 'Your season' : `${profile.name}'s season`}{seasonOver ? '' : ' so far'}</p>
          {throughWeek != null && !seasonOver && <p className="text-field-400 text-sm mt-1">Through {weekLabel(throughWeek)}</p>}
          <p className="text-field-500 text-xs mt-10">Tap to start</p>
        </>
      ),
    },
    {
      key: 'record', bg: 'from-field-800 via-field-900 to-gold/25',
      body: (
        <>
          <Kicker>{you} went</Kicker>
          <Big>{s.correct}–{losses}</Big>
          <p className="text-2xl text-white font-bold mt-2">{Math.round(s.pct * 100)}% right</p>
          <p className="text-field-300 mt-4">#{profile.rank} of {totalPlayers} in the league</p>
          {s.weeksWon > 0 && (
            <p className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-gold/15 border border-gold/40 px-3 py-1 text-gold font-bold text-sm">
              <Trophy className="w-4 h-4" /> {s.weeksWon} week{s.weeksWon === 1 ? '' : 's'} won
            </p>
          )}
        </>
      ),
    },
  ]

  if (profile.bestWeek) {
    const b = profile.bestWeek, t = profile.toughestWeek
    slides.push({
      key: 'weeks', bg: 'from-gold/25 via-field-900 to-field-950',
      body: (
        <>
          <Kicker>{your} best week</Kicker>
          <Big>{b.correct}/{b.played}</Big>
          <p className="text-2xl text-white font-bold mt-2">{weekLabel(b.week)}{b.won ? ' 🏆' : ''}</p>
          {t && t.week !== b.week && (
            <p className="text-field-400 mt-6">Toughest: {weekLabel(t.week)}, {t.correct}/{t.played}</p>
          )}
        </>
      ),
    })
  }

  if (dna && leagueDna && dna.picks > 0) {
    slides.push({
      key: 'dna', bg: 'from-field-800 via-field-900 to-gold/30',
      body: (
        <>
          <Kicker>{your} pick personality</Kicker>
          <p className="font-cond font-black uppercase text-gold text-5xl leading-none mt-3">{dna.archetype.title}</p>
          <p className="text-field-200 mt-3">{dna.archetype.blurb}</p>
          <div className="mt-6 text-left w-full max-w-xs mx-auto" onClick={e => e.stopPropagation()}>
            <PickDNABars dna={dna} league={leagueDna} compact />
          </div>
        </>
      ),
    })
  }

  if (call) {
    slides.push({
      key: 'call', bg: 'from-gold/30 via-field-900 to-field-950',
      body: (
        <>
          <Kicker>{your} boldest call</Kicker>
          <Logo team={call.team} />
          <p className="font-cond font-black uppercase text-white text-4xl leading-none mt-2">{call.team} over {call.opponent}</p>
          <p className="text-field-200 mt-3">
            {call.backers === 1
              ? `${isYou ? 'Only you' : `Only ${profile.name}`} saw it coming`
              : `${call.backers * 4 <= call.pickers ? 'Only ' : ''}${call.backers} of ${call.pickers} saw it coming`}
          </p>
          <p className="text-field-500 text-sm mt-1">{weekLabel(call.week)}</p>
        </>
      ),
    })
  }

  if (worstBeat) {
    const w = worstBeat
    slides.push({
      key: 'beat', bg: 'from-red-500/25 via-field-900 to-field-950',
      body: (
        <>
          <Kicker>The one that hurt</Kicker>
          <Logo team={w.loser} />
          <Big>{Math.round(w.peak * 100)}%</Big>
          <p className="text-field-200 mt-2">{w.loser}&apos;s chance to win in the second half</p>
          <p className="text-white font-bold mt-4">
            {w.decided ? `${w.winner} went ahead ${whenDecided(w.decided)}` : `${w.winner} came back`}
          </p>
          <p className="text-field-500 text-sm mt-1">Lost {w.loserScore}–{w.winnerScore} · {weekLabel(w.week)}</p>
        </>
      ),
    })
  }

  if (profile.bestTeam || profile.worstTeam) {
    slides.push({
      key: 'teams', bg: 'from-field-800 via-field-900 to-gold/25',
      body: (
        <div className="space-y-8">
          {profile.bestTeam && (
            <div>
              <Kicker>{isYou ? 'You can trust' : 'Can trust'}</Kicker>
              <Logo team={profile.bestTeam.team} />
              <p className="font-cond font-black text-white text-4xl">{profile.bestTeam.team} · {profile.bestTeam.wins}–{profile.bestTeam.losses}</p>
            </div>
          )}
          {profile.worstTeam && (
            <div>
              <Kicker>{your} nemesis</Kicker>
              <Logo team={profile.worstTeam.team} />
              <p className="font-cond font-black text-white text-4xl">{profile.worstTeam.team} · {profile.worstTeam.wins}–{profile.worstTeam.losses}</p>
            </div>
          )}
        </div>
      ),
    })
  }

  if (beltWeeks > 0) {
    slides.push({
      key: 'belt', bg: 'from-gold/40 via-field-900 to-field-950',
      body: (
        <>
          <Kicker>The Belt</Kicker>
          <Big>{beltWeeks}</Big>
          <p className="text-2xl text-white font-bold mt-2">week{beltWeeks === 1 ? '' : 's'} as champ</p>
          {profile.bestStreak >= 2 && <p className="text-field-300 mt-4">Best run: {profile.bestStreak} straight</p>}
        </>
      ),
    })
  }

  slides.push({
    key: 'summary', bg: 'from-field-900 via-field-950 to-field-950',
    body: (
      <div className="w-full" onClick={e => e.stopPropagation()}>
        <div ref={summaryRef} className="rounded-2xl border border-gold/40 bg-gradient-to-br from-[#2a1a10] via-[#141414] to-[#0A0A0A] p-5 text-left">
          <p className="font-cond font-bold text-[11px] uppercase tracking-[0.2em] text-gold">Pick&apos;Em Wrapped{seasonOver ? '' : ' · so far'}</p>
          <p className="font-cond font-black text-3xl uppercase text-white leading-tight mt-1 truncate">{profile.name}</p>
          <p className="text-xs text-field-400 truncate">{leagueName}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Stat label="Record" value={`${s.correct}–${losses}`} />
            <Stat label="Rank" value={`#${profile.rank} of ${totalPlayers}`} />
            <Stat label="Weeks won" value={String(s.weeksWon)} />
            <Stat label="Best week" value={profile.bestWeek ? `${profile.bestWeek.correct}/${profile.bestWeek.played}` : '—'} />
            {dna && dna.picks > 0 && <Stat label="Personality" value={dna.archetype.title} wide />}
            {call && <Stat label="Boldest call" value={`${call.team} over ${call.opponent}`} wide />}
            {profile.worstTeam && <Stat label="Nemesis" value={profile.worstTeam.team} />}
            {worstBeat && <Stat label="Worst beat" value={`${worstBeat.loser} at ${Math.round(worstBeat.peak * 100)}%`} />}
          </div>
          <p className="text-[10px] text-field-500 mt-4">gridironunited.app</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={share} disabled={sharing} className="btn-gold justify-center !py-2.5">
            <Share2 className="w-4 h-4" /> {sharing ? 'Making it…' : 'Share'}
          </button>
          <button onClick={onClose} className="btn-ghost justify-center !py-2.5">Done</button>
        </div>
      </div>
    ),
  })

  const last = slides.length - 1
  const next = useCallback(() => setI(n => Math.min(n + 1, last)), [last])
  const prev = useCallback(() => setI(n => Math.max(n - 1, 0)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = scroll }
  }, [next, prev, onClose])

  async function share() {
    if (!summaryRef.current) return
    setSharing(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(summaryRef.current, { backgroundColor: '#0A0A0A', scale: 2 })
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('no image')
      const name = `pickem-wrapped-${profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
      const file = new File([blob], name, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Pick'Em Wrapped" })
      } else {
        const a = document.createElement('a')
        a.download = name
        a.href = URL.createObjectURL(blob)
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error("Couldn't make the image")
    } finally {
      setSharing(false)
    }
  }

  const slide = slides[Math.min(i, last)]

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-field-950 flex justify-center" role="dialog" aria-label="Pick'Em Wrapped">
      <div className={clsx('relative w-full max-w-md h-[100dvh] bg-gradient-to-br transition-colors duration-500', slide.bg)}>
        {/* Progress + close */}
        <div className="absolute top-0 inset-x-0 z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
          <div className="flex-1 flex gap-1">
            {slides.map((sl, k) => (
              <span key={sl.key} className="h-1 flex-1 rounded-full bg-white/15 overflow-hidden">
                <span className={clsx('block h-full bg-white transition-all duration-300', k <= i ? 'w-full' : 'w-0')} />
              </span>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tap left for back, right for next */}
        <div
          className="absolute inset-0 flex items-center justify-center px-8 text-center cursor-pointer select-none"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            if (e.clientX - r.left < r.width * 0.33) prev(); else next()
          }}
        >
          <div key={slide.key} className="rise-in w-full flex flex-col items-center">{slide.body}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-cond font-bold text-xs uppercase tracking-[0.24em] text-gold">{children}</p>
}

function Big({ children }: { children: ReactNode }) {
  return <p className="font-cond font-black text-white text-7xl leading-none mt-3 tabular-nums">{children}</p>
}

function Logo({ team }: { team: string }) {
  const src = teamLogoUrl({ abbr: team }, 'NFL')
  return src ? <img src={src} alt="" className="w-16 h-16 object-contain mx-auto mt-4" /> : null
}

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={clsx('min-w-0', wide && 'col-span-2')}>
      <p className="text-[10px] uppercase tracking-wider text-field-500">{label}</p>
      <p className="font-cond font-black text-white text-lg leading-tight truncate">{value}</p>
    </div>
  )
}
