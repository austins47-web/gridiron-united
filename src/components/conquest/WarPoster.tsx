import { useEffect, useId } from 'react'
import { M } from './mapGeometry'
import { cityName, type PosterSpec } from './warStory'

/** The War Office's period faces, fetched only when a poster or newsreel shows. */
export function useWarFonts() {
  useEffect(() => {
    const id = 'gu-war-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Limelight&family=Special+Elite&display=swap'
    document.head.appendChild(link)
  }, [])
}

const PAPER = '#ecdfbf'
const INK = '#1f241d'
const SLAB = "'Alfa Slab One', 'Rockwell Extra Bold', Georgia, serif"
const TYPE = "'Special Elite', 'Courier New', monospace"

/** Headline type sized to the poster's width: big for short words, smaller (never squashed much) for long ones */
function Headline({ text, y, max, fill }: { text: string; y: number; max: number; fill: string }) {
  const size = Math.max(40, Math.min(max, 480 / (text.length * 0.7)))
  const natural = text.length * 0.7 * size
  return (
    <text
      x={300} y={y} textAnchor="middle" fontFamily={SLAB} fontSize={size} fill={fill}
      textLength={natural > 490 ? 490 : undefined} lengthAdjust="spacingAndGlyphs"
      stroke={PAPER} strokeWidth={6} paintOrder="stroke" strokeLinejoin="round"
    >
      {text}
    </text>
  )
}

/**
 * A 1940s war poster for a settled week (warStory's posters): a sunburst,
 * the headline, the real map around the action in the empires' colors
 * (besieged cities striped in the besieger's), a ribbon and the fine print.
 * 600×800; scales to whatever width it's given.
 */
export function WarPoster({ spec, owners, besieged, colorOf, className }: {
  spec: PosterSpec
  owners: Record<string, string | null>
  besieged: Record<string, string>
  colorOf: (userId: string | null) => string | null
  className?: string
}) {
  useWarFonts()
  const uid = useId().replace(/:/g, '')
  const id = (s: string) => `${uid}${s}`

  // The medallion's window on the map: a square around the cities in focus
  const pts = spec.focus.map(t => M.stadium[t]).filter(Boolean)
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const vs = Math.max(230, Math.max(...xs) - Math.min(...xs) + 120, Math.max(...ys) - Math.min(...ys) + 120)
  const view = `${cx - vs / 2} ${cy - vs / 2} ${vs} ${vs}`

  const rays = Array.from({ length: 16 }, (_, k) => {
    const a0 = ((2 * k) / 32) * Math.PI * 2, a1 = ((2 * k + 1) / 32) * Math.PI * 2, R = 900
    return `M300 430 L${300 + R * Math.cos(a0)} ${430 + R * Math.sin(a0)} L${300 + R * Math.cos(a1)} ${430 + R * Math.sin(a1)} Z`
  })
  const sieges = Object.entries(besieged)

  let arrow: { d: string; head: string } | null = null
  if (spec.arrow && M.stadium[spec.arrow.from] && M.stadium[spec.arrow.to]) {
    const a = M.stadium[spec.arrow.from], b = M.stadium[spec.arrow.to]
    const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.25, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.25
    const ux = b[0] - mx, uy = b[1] - my, l = Math.hypot(ux, uy) || 1, nx = ux / l, ny = uy / l
    const tip = [b[0] - (nx * vs) / 22, b[1] - (ny * vs) / 22], hl = vs / 10, hw = vs / 16
    const base = [tip[0] - nx * hl, tip[1] - ny * hl]
    arrow = {
      d: `M${a[0]} ${a[1]} Q${mx} ${my} ${base[0]} ${base[1]}`,
      head: `M${tip[0]} ${tip[1]} L${base[0] - ny * hw} ${base[1] + nx * hw} L${base[0] + ny * hw} ${base[1] - nx * hw}Z`,
    }
  }

  return (
    <svg viewBox="0 0 600 800" className={className} role="img" aria-label={`War poster: ${spec.head.join(' ')} ${spec.ribbon}`}>
      <defs>
        <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={4} />
          <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .16  0 0 0 0 .1  0 0 0 .55 0" />
        </filter>
        <pattern id={id('dots')} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="3.5" cy="3.5" r="1.3" fill={INK} />
        </pattern>
        {sieges.map(([t, by]) => (
          <pattern key={t} id={id(`siege${t}`)} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill={colorOf(owners[t] ?? null) ?? '#d8c9a0'} />
            <rect width="4.5" height="9" fill={colorOf(by) ?? INK} />
          </pattern>
        ))}
        <clipPath id={id('inner')}><rect x="22" y="22" width="556" height="756" /></clipPath>
        <clipPath id={id('medal')}><circle cx="300" cy="430" r="158" /></clipPath>
      </defs>

      <rect width="600" height="800" fill={PAPER} />
      <g clipPath={`url(#${id('inner')})`}>
        {rays.map((d, k) => <path key={k} d={d} fill={spec.ray} />)}
      </g>
      <rect x="22" y="22" width="556" height="756" fill="none" stroke={INK} strokeWidth="5" />
      <rect x="30" y="30" width="540" height="740" fill="none" stroke={INK} strokeWidth="1.5" />

      <Headline text={spec.head[0]} y={spec.big === 0 ? 168 : 142} max={spec.big === 0 ? 150 : 80} fill={INK} />
      <Headline text={spec.head[1]} y={spec.big === 0 ? 236 : 224} max={spec.big === 0 ? 64 : 74} fill="#a8322a" />

      {/* The medallion: the real map around the action */}
      <circle cx="300" cy="430" r="166" fill={INK} />
      <g clipPath={`url(#${id('medal')})`}>
        <rect x="130" y="260" width="340" height="340" fill="#d8c9a0" />
        <svg x="142" y="272" width="316" height="316" viewBox={view} overflow="visible">
          {Object.entries(M.territories).map(([t, d]) => (
            <path
              key={t} d={d}
              fill={besieged[t] ? `url(#${id(`siege${t}`)})` : colorOf(owners[t] ?? null) ?? '#d8c9a0'}
              stroke={INK} strokeWidth={vs / 160} strokeLinejoin="round"
            />
          ))}
          {arrow && (
            <>
              <path d={arrow.d} fill="none" stroke={INK} strokeWidth={vs / 26} strokeLinecap="round" />
              <path d={arrow.head} fill={INK} />
            </>
          )}
          {spec.label.map(t => {
            const p = M.stadium[t]
            if (!p) return null
            return (
              <g key={t}>
                <circle cx={p[0]} cy={p[1]} r={vs / 70} fill={PAPER} stroke={INK} strokeWidth={vs / 260} />
                <text
                  x={p[0]} y={p[1] - vs / 34} textAnchor="middle" fontFamily={SLAB} fontSize={vs / (spec.label.length > 1 ? 15 : 12)}
                  fill={INK} stroke={PAPER} strokeWidth={vs / 70} paintOrder="stroke"
                >
                  {spec.label.length > 1 ? t : cityName(t).toUpperCase()}
                </text>
              </g>
            )
          })}
        </svg>
      </g>
      <circle cx="300" cy="430" r="158" fill={`url(#${id('dots')})`} opacity=".12" />
      <circle cx="300" cy="430" r="160" fill="none" stroke={PAPER} strokeWidth="3" />

      <path d="M40 632 H560 L540 669 L560 706 H40 L60 669 Z" fill={spec.ribbonColor} stroke={INK} strokeWidth="3" />
      <text
        x="300" y="683" textAnchor="middle" fontFamily={SLAB} fontSize={Math.min(38, 440 / (spec.ribbon.length * 0.62))}
        fill={PAPER} textLength={spec.ribbon.length * 0.62 * 38 > 440 ? 440 : undefined} lengthAdjust="spacingAndGlyphs"
      >
        {spec.ribbon}
      </text>
      <text x="300" y="745" textAnchor="middle" fontFamily={TYPE} fontSize={Math.min(14.5, 520 / (spec.fine.length * 0.6))} fill={INK} letterSpacing="1">
        {spec.fine}
      </text>
      <rect width="600" height="800" filter={`url(#${id('grain')})`} opacity=".55" style={{ mixBlendMode: 'multiply' }} />
    </svg>
  )
}
