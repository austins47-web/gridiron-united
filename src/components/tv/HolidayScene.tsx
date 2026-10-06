import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { HolidayTheme, HolidaySceneSpec } from '@/lib/holiday'

// ══════════════════════════════════════════════════════════════
// The Shop TV dressed for a holiday (src/lib/holiday.ts): a glow in
// the theme's colors around the edges, decorations along the header
// (cobwebs and a spider, string lights, a leaf garland, bunting or a
// gold shimmer), things sitting on the ticker (jack-o'-lanterns,
// presents, pie), Halloween fog, and every couple of minutes a moment
// across the screen (bats, a ghost, Santa's sleigh, a turkey,
// fireworks, a flyover, a football, spotlights). New Year's Eve counts
// down the last ten seconds to midnight.
//
// Laid out in the TV's 1920×1080 space, transforms and opacity only, so
// it runs on a Fire TV's browser. ?preview=moments plays a moment every
// 14 seconds.
// ══════════════════════════════════════════════════════════════

const W = 1920
const H = 1080
const HEADER = 92
const TICKER = 56

type Moment = HolidaySceneSpec['moments'][number]

/** How long each moment runs. */
const MOMENT_MS: Record<Moment, number> = {
  bats: 9000, ghost: 11_000, sleigh: 12_000, turkey: 14_000,
  fireworks: 7500, flyover: 7000, football: 4800, spotlight: 9000,
}

const SCENE_CSS = `
@keyframes hs-across-left { from { transform: translateX(${W + 200}px) } to { transform: translateX(-700px) } }
@keyframes hs-across-right { from { transform: translateX(-1300px) } to { transform: translateX(${W + 200}px) } }
@keyframes hs-bob { from { transform: translateY(-18px) } to { transform: translateY(18px) } }
@keyframes hs-flap { from { transform: scaleY(1) } to { transform: scaleY(.55) } }
@keyframes hs-hop { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-16px) } }
@keyframes hs-arc { 0% { transform: translateY(0) } 50% { transform: translateY(-420px) } 100% { transform: translateY(0) } }
@keyframes hs-spin { to { transform: rotate(900deg) } }
@keyframes hs-blink { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
@keyframes hs-flicker { 0%, 100% { opacity: .55 } 30% { opacity: .9 } 60% { opacity: .45 } 80% { opacity: .8 } }
@keyframes hs-dangle { from { transform: translateY(0) } to { transform: translateY(46px) } }
@keyframes hs-fog { from { transform: translateX(0) } to { transform: translateX(-${W}px) } }
@keyframes hs-shimmer { from { background-position: -600px 0 } to { background-position: ${W + 600}px 0 } }
@keyframes hs-rise { from { transform: translateY(var(--rise)); opacity: 1 } 90% { opacity: 1 } to { transform: translateY(0); opacity: 0 } }
@keyframes hs-burst { 0% { transform: translate(0, 0) scale(1); opacity: 1 } 100% { transform: translate(var(--tx), var(--ty)) scale(.35); opacity: 0 } }
@keyframes hs-sweep { 0% { transform: rotate(var(--from)); opacity: 0 } 12% { opacity: 1 } 50% { transform: rotate(var(--to)) } 88% { opacity: 1 } 100% { transform: rotate(var(--from)); opacity: 0 } }
@keyframes hs-fade { 0% { opacity: 0 } 10% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }
@keyframes hs-pop { 0% { transform: scale(.4); opacity: 0 } 25% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
`

const prefersCalm = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function HolidayScene({ theme }: { theme: HolidayTheme }) {
  const [c1, c2] = theme.colors
  return (
    <>
      <style>{SCENE_CSS}</style>
      <div className="absolute inset-0 pointer-events-none z-[6] overflow-hidden" aria-hidden>
        {/* A glow in the theme's colors around the edges */}
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 140px 24px ${c1}44, inset 0 0 380px 60px ${c2}2b` }} />
        {theme.scene.fog && <Fog />}
        <Edge theme={theme} />
        <Footer theme={theme} />
        <Moments theme={theme} />
      </div>
      {theme.key === 'newyear' && <NewYearCountdown theme={theme} />}
    </>
  )
}

// ── Along the header ──────────────────────────────────────────

function Edge({ theme }: { theme: HolidayTheme }) {
  const [c1, c2] = theme.colors
  switch (theme.scene.edge) {
    case 'webs':
      return (
        <>
          <Cobweb style={{ left: 0, top: HEADER }} />
          <Cobweb style={{ right: 0, top: HEADER, transform: 'scaleX(-1)' }} />
          {/* A spider letting itself down from the right-hand web */}
          <div className="absolute" style={{ right: 96, top: HEADER, animation: 'hs-dangle 3.6s ease-in-out infinite alternate' }}>
            <div className="mx-auto w-px bg-white/40" style={{ height: 130 }} />
            <div className="text-[40px] leading-none -mt-1 text-center">🕷️</div>
          </div>
        </>
      )
    case 'lights': {
      // A scalloped wire with a bulb at the bottom of each swag
      const swag = 64
      const n = Math.ceil(W / swag)
      const colors = ['#ef4444', '#22c55e', '#facc15', '#3b82f6']
      let d = `M 0 ${HEADER + 2}`
      for (let i = 0; i < n; i++) d += ` Q ${i * swag + swag / 2} ${HEADER + 22} ${(i + 1) * swag} ${HEADER + 2}`
      return (
        <>
          <svg className="absolute left-0 top-0" width={W} height={HEADER + 40}>
            <path d={d} fill="none" stroke="#1f2937" strokeWidth={3} />
          </svg>
          {Array.from({ length: n }, (_, i) => {
            const color = colors[i % colors.length]
            return (
              <div
                key={i}
                className="absolute rounded-b-full rounded-t-[40%]"
                style={{
                  left: i * swag + swag / 2 - 7, top: HEADER + 12, width: 14, height: 20,
                  background: color, boxShadow: `0 0 14px 4px ${color}aa`,
                  animation: `hs-blink ${1.6 + (i % 3) * 0.5}s ease-in-out ${(i % 5) * 0.3}s infinite`,
                }}
              />
            )
          })}
        </>
      )
    }
    case 'garland': {
      const items = theme.scene.garland ?? [theme.emoji]
      const step = 76
      return (
        <>
          {Array.from({ length: Math.ceil(W / step) }, (_, i) => (
            <span
              key={i}
              className="absolute text-[28px] leading-none"
              style={{ left: i * step + 18, top: HEADER - 14 + (i % 2) * 8, transform: `rotate(${i % 2 ? 18 : -14}deg)` }}
            >
              {items[i % items.length]}
            </span>
          ))}
        </>
      )
    }
    case 'bunting': {
      const flag = 96
      const fills = [c1, '#f8fafc', c2]
      return (
        <svg className="absolute left-0" style={{ top: HEADER - 2 }} width={W} height={44}>
          <path d={`M 0 2 ${Array.from({ length: W / flag + 1 }, (_, i) => `Q ${i * flag + flag / 2} 14 ${(i + 1) * flag} 2`).join(' ')}`} fill="none" stroke="#e5e7eb" strokeWidth={2} />
          {Array.from({ length: Math.ceil(W / flag) }, (_, i) => (
            <path key={i} d={`M ${i * flag + 14} 6 L ${i * flag + flag - 14} 6 L ${i * flag + flag / 2} 40 Z`} fill={fills[i % 3]} opacity={0.92} />
          ))}
        </svg>
      )
    }
    case 'shimmer':
      return (
        <div
          className="absolute left-0 right-0"
          style={{
            top: HEADER - 2, height: 5,
            background: `linear-gradient(90deg, transparent, ${c1}, #fff8dc, ${c1}, transparent) no-repeat`,
            backgroundSize: '600px 100%',
            backgroundColor: `${c1}55`,
            animation: 'hs-shimmer 5s linear infinite',
          }}
        />
      )
  }
}

/** A cobweb in a corner: spokes from the corner and sagging threads between them. */
function Cobweb({ style }: { style: CSSProperties }) {
  const R = 170
  const spokes = [0, 18, 36, 54, 72, 90].map(a => (a * Math.PI) / 180)
  const rings = [34, 64, 96, 128, 160]
  const pt = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)]
  return (
    <svg className="absolute" style={style} width={R} height={R}>
      <g stroke="rgba(255,255,255,0.38)" strokeWidth={1.4} fill="none">
        {spokes.map((a, i) => { const [x, y] = pt(R, a); return <line key={i} x1={0} y1={0} x2={x} y2={y} /> })}
        {rings.map(r => (
          <path
            key={r}
            d={spokes.slice(1).map((a, i) => {
              const [x0, y0] = pt(r, spokes[i])
              const [x1, y1] = pt(r, a)
              const [mx, my] = pt(r * 0.82, (a + spokes[i]) / 2)
              return `${i === 0 ? `M ${x0} ${y0}` : ''} Q ${mx} ${my} ${x1} ${y1}`
            }).join(' ')}
          />
        ))}
      </g>
    </svg>
  )
}

// ── On the ticker ─────────────────────────────────────────────

function Footer({ theme }: { theme: HolidayTheme }) {
  const items = theme.scene.footer
  const glow = theme.key === 'halloween'
  const row = (side: 'left' | 'right') => (
    <div className="absolute flex items-end gap-3" style={{ [side]: 22, bottom: TICKER - 8 }}>
      {items.map((e, i) => (
        <div key={i} className="relative">
          {/* Candlelight inside the jack-o'-lanterns */}
          {glow && (
            <div
              className="absolute rounded-full"
              style={{
                inset: -18, background: 'radial-gradient(circle, rgba(251,146,60,0.55), transparent 65%)',
                animation: `hs-flicker ${1.3 + i * 0.4}s ease-in-out infinite`,
              }}
            />
          )}
          <span className="relative block leading-none" style={{ fontSize: i === 1 ? 54 : 46 }}>{e}</span>
        </div>
      ))}
    </div>
  )
  return <>{row('left')}{row('right')}</>
}

function Fog() {
  const band = (opacity: number, dur: number, reverse: boolean, bottom: number) => (
    <div
      className="absolute left-0"
      style={{
        bottom, width: W * 2, height: 240, opacity,
        background: 'radial-gradient(ellipse 380px 90px at 10% 60%, rgba(226,232,240,0.5), transparent 70%), radial-gradient(ellipse 520px 110px at 35% 70%, rgba(226,232,240,0.45), transparent 70%), radial-gradient(ellipse 420px 90px at 60% 55%, rgba(226,232,240,0.5), transparent 70%), radial-gradient(ellipse 560px 120px at 85% 70%, rgba(226,232,240,0.45), transparent 70%)',
        animation: `hs-fog ${dur}s linear infinite${reverse ? ' reverse' : ''}`,
      }}
    />
  )
  return <>{band(0.22, 70, false, TICKER - 40)}{band(0.16, 95, true, TICKER - 10)}</>
}

// ── Moments ───────────────────────────────────────────────────

function Moments({ theme }: { theme: HolidayTheme }) {
  const [playing, setPlaying] = useState<{ kind: Moment; id: number } | null>(null)
  useEffect(() => {
    if (prefersCalm()) return
    const preview = new URLSearchParams(window.location.search).get('preview') === 'moments'
    const list = theme.scene.moments
    let i = 0, n = 0
    let end: ReturnType<typeof setTimeout> | undefined
    const play = () => {
      const kind = list[i++ % list.length]
      setPlaying({ kind, id: ++n })
      clearTimeout(end)
      end = setTimeout(() => setPlaying(null), MOMENT_MS[kind])
    }
    const first = setTimeout(play, preview ? 2000 : 25_000)
    const every = setInterval(play, preview ? 14_000 : 150_000)
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(end) }
  }, [theme.key, theme.scene.moments])

  if (!playing) return null
  const id = playing.id
  switch (playing.kind) {
    case 'bats': return <Bats key={id} />
    case 'ghost': return <Ghost key={id} />
    case 'sleigh': return <Sleigh key={id} />
    case 'turkey': return <Turkey key={id} />
    case 'fireworks': return <Fireworks key={id} theme={theme} />
    case 'flyover': return <Flyover key={id} theme={theme} />
    case 'football': return <Football key={id} />
    case 'spotlight': return <Spotlights key={id} />
  }
}

function Bats() {
  const flock = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    x: (i % 3) * 110 + (i * 37) % 60,
    y: Math.floor(i / 3) * 70 + (i * 53) % 40,
    size: 40 + ((i * 29) % 26),
    flap: 0.18 + ((i * 7) % 10) / 100,
    bob: 0.9 + ((i * 13) % 7) / 10,
  })), [])
  return (
    <div className="absolute" style={{ top: 170, left: 0, animation: `hs-across-left ${MOMENT_MS.bats}ms linear forwards` }}>
      {flock.map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.x, top: b.y, animation: `hs-bob ${b.bob}s ease-in-out infinite alternate` }}>
          <div style={{ fontSize: b.size, lineHeight: 1, animation: `hs-flap ${b.flap}s ease-in-out infinite alternate` }}>🦇</div>
        </div>
      ))}
    </div>
  )
}

function Ghost() {
  return (
    <div className="absolute" style={{ top: 460, left: 0, animation: `hs-across-right ${MOMENT_MS.ghost}ms linear forwards` }}>
      <div className="flex items-start gap-2" style={{ animation: 'hs-bob 1.6s ease-in-out infinite alternate', opacity: 0.9 }}>
        <span className="text-[150px] leading-none">👻</span>
        <span className="mt-4 rounded-2xl bg-white text-field-950 font-cond font-black text-[44px] px-5 py-1" style={{ animation: 'hs-fade 2.4s ease-in-out infinite' }}>BOO!</span>
      </div>
    </div>
  )
}

function Sleigh() {
  return (
    <div className="absolute" style={{ top: 150, left: 0, animation: `hs-across-left ${MOMENT_MS.sleigh}ms linear forwards` }}>
      <div className="flex items-end gap-1 whitespace-nowrap" style={{ animation: 'hs-bob 1.8s ease-in-out infinite alternate' }}>
        <span className="text-[64px] leading-none">🦌</span>
        <span className="text-[64px] leading-none">🦌</span>
        <span className="text-[64px] leading-none">🦌</span>
        <span className="text-[80px] leading-none ml-3">🎅</span>
        <span className="text-[72px] leading-none -ml-6">🛷</span>
        <span className="text-[36px] leading-none ml-2 opacity-80">✨ ✨ ✨</span>
      </div>
    </div>
  )
}

function Turkey() {
  return (
    <div className="absolute" style={{ bottom: TICKER + 18, left: 0, animation: `hs-across-left ${MOMENT_MS.turkey}ms linear forwards` }}>
      <div className="text-[84px] leading-none" style={{ animation: 'hs-hop .45s ease-in-out infinite' }}>🦃</div>
    </div>
  )
}

function Football() {
  return (
    <div className="absolute" style={{ top: 760, left: 0, animation: `hs-across-right ${MOMENT_MS.football}ms linear forwards` }}>
      <div style={{ animation: `hs-arc ${MOMENT_MS.football}ms ease-in-out forwards` }}>
        <div className="text-[88px] leading-none" style={{ animation: `hs-spin ${MOMENT_MS.football}ms linear forwards` }}>🏈</div>
      </div>
    </div>
  )
}

function Flyover({ theme }: { theme: HolidayTheme }) {
  const trails = [theme.colors[1] ?? '#b91c1c', '#f8fafc', theme.colors[0]]
  return (
    <div className="absolute" style={{ top: 250, left: 0, animation: `hs-across-right ${MOMENT_MS.flyover}ms linear forwards` }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="absolute flex items-center" style={{ left: i === 1 ? 90 : 0, top: i * 70 }}>
          <div style={{ width: 1000, height: 12, background: `linear-gradient(90deg, transparent, ${trails[i]}cc)` }} />
          <span className="text-[64px] leading-none" style={{ transform: 'rotate(45deg)' }}>✈️</span>
        </div>
      ))}
    </div>
  )
}

function Fireworks({ theme }: { theme: HolidayTheme }) {
  const bursts = useMemo(() => {
    const colors = [theme.colors[0], theme.colors[1], '#fde68a', '#ffffff']
    return Array.from({ length: 5 }, (_, b) => ({
      x: 260 + ((b * 397) % (W - 520)),
      y: 180 + ((b * 211) % 380),
      delay: b * 1.2,
      color: colors[b % colors.length],
      sparks: Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2
        const r = 170 + ((i * 31) % 70)
        return { tx: Math.cos(a) * r, ty: Math.sin(a) * r + 40 }
      }),
    }))
  }, [theme.colors])
  return (
    <>
      {bursts.map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.x, top: b.y }}>
          {/* The shell going up */}
          <div
            className="absolute w-2 h-8 rounded-full"
            style={{ background: b.color, '--rise': `${H - b.y}px`, opacity: 0, animation: `hs-rise .7s ease-out ${b.delay}s forwards` } as CSSProperties}
          />
          {b.sparks.map((s, j) => (
            <div
              key={j}
              className="absolute w-3 h-3 rounded-full"
              style={{
                background: b.color, boxShadow: `0 0 10px 2px ${b.color}`, opacity: 0,
                '--tx': `${s.tx}px`, '--ty': `${s.ty}px`,
                animation: `hs-burst 1.6s cubic-bezier(.15,.7,.3,1) ${b.delay + 0.7}s forwards`,
              } as CSSProperties}
            />
          ))}
        </div>
      ))}
    </>
  )
}

function Spotlights() {
  const beam = (side: 'left' | 'right') => (
    <div
      className="absolute"
      style={{
        [side]: 80, bottom: TICKER, width: 520, height: 1300,
        transformOrigin: '50% 100%',
        background: 'linear-gradient(to top, rgba(255,250,220,0.26), rgba(255,250,220,0.04) 85%, transparent)',
        clipPath: 'polygon(46% 100%, 54% 100%, 100% 0, 0 0)',
        '--from': side === 'left' ? '-28deg' : '28deg',
        '--to': side === 'left' ? '22deg' : '-22deg',
        animation: `hs-sweep ${MOMENT_MS.spotlight}ms ease-in-out forwards`,
      } as CSSProperties}
    />
  )
  return <>{beam('left')}{beam('right')}</>
}

// ── New Year's Eve: the last ten seconds ──────────────────────

function NewYearCountdown({ theme }: { theme: HolidayTheme }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const now = new Date()
    if (now.getMonth() !== 11 || now.getDate() !== 31) return
    const midnight = new Date(now.getFullYear() + 1, 0, 1).getTime()
    let tick: ReturnType<typeof setInterval> | undefined
    // From ten seconds out until a minute after midnight
    const start = () => {
      tick = setInterval(() => {
        const ms = midnight - Date.now()
        if (ms < -60_000) { setLeft(null); clearInterval(tick); return }
        setLeft(Math.ceil(ms / 1000))
      }, 200)
    }
    const wait = midnight - 10_500 - Date.now()
    const t = setTimeout(start, Math.max(0, wait))
    return () => { clearTimeout(t); clearInterval(tick) }
  }, [])
  if (left == null) return null
  const year = new Date().getFullYear() + (left > 0 ? 1 : 0)
  return (
    <div className="absolute inset-0 z-[45] pointer-events-none flex flex-col items-center justify-center bg-field-950/85">
      {left > 0 ? (
        <span key={left} className="font-cond font-black text-[420px] leading-none text-gold" style={{ animation: 'hs-pop .9s ease-out forwards', textShadow: `0 0 60px ${theme.colors[0]}` }}>{left}</span>
      ) : (
        <>
          <Fireworks theme={theme} />
          <p className="font-cond font-black uppercase text-[150px] leading-none text-white" style={{ animation: 'hs-pop 1s ease-out forwards' }}>Happy New Year</p>
          <p className="font-cond font-black text-[220px] leading-none text-gold" style={{ textShadow: `0 0 60px ${theme.colors[0]}` }}>{year}</p>
        </>
      )}
    </div>
  )
}
