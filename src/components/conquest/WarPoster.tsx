import { useEffect, useId } from 'react'
import { M } from './mapGeometry'
import { cityName, type PosterSpec } from './warStory'
import { along, laneRoute } from './sea'
import { Warship } from './Warship'

/** The War Office's period faces, fetched only when a poster or newsreel shows. */
export function useWarFonts() {
  useEffect(() => {
    const id = 'gu-war-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Limelight&family=Allerta+Stencil&family=Special+Elite&family=Yellowtail&display=swap'
    document.head.appendChild(link)
  }, [])
}

// A lithograph's few inks on aged paper, as the war posters were printed
const PAPER = '#ebdcb6'
const CREAM = '#f4e8c9'
const INK = '#1d1b18'
const RED = '#b3332b'
const NAVY = '#1f3150'
const OCHRE = '#d9a23a'
const GOTHIC = "'Anton', Impact, 'Arial Narrow', sans-serif"
const SCRIPT = "'Yellowtail', 'Brush Script MT', cursive"
const STENCIL = "'Allerta Stencil', 'Special Elite', 'Courier New', monospace"

/** A player's color as the printer would've mixed it: muted, and never too light or dark */
function inkOf(color: string | null): string | null {
  const m = color?.match(/hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/)
  if (!m) return color
  const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return `hsl(${h} ${Math.round(Math.min(s, 60) * 0.8)}% ${Math.round(Math.max(32, Math.min(58, l * 0.9)))}%)`
}

/**
 * Poster lettering: tall gothic capitals with a solid block shadow cast
 * down and right, sized to the width (squeezed a little, never much, for
 * long names).
 */
function Block({ text, y, max, fill, shadow, width = 520, depth }: {
  text: string; y: number; max: number; fill: string; shadow: string; width?: number; depth?: number
}) {
  const em = 0.47
  const size = Math.max(34, Math.min(max, width / (text.length * em)))
  const natural = text.length * em * size
  const d = depth ?? Math.max(3, Math.round(size * 0.055))
  const fit = natural > width ? { textLength: width, lengthAdjust: 'spacingAndGlyphs' as const } : {}
  return (
    <g fontFamily={GOTHIC} fontSize={size} textAnchor="middle">
      {Array.from({ length: d }, (_, i) => (
        <text key={i} x={300 + d - i} y={y + d - i} fill={shadow} {...fit}>{text}</text>
      ))}
      <text x={300} y={y} fill={fill} {...fit}>{text}</text>
    </g>
  )
}

/** A five-pointed star */
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r
    return `${k ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`
  }).join('') + 'Z'

/** A B-17 from below, nose up, about 44 long */
const BOMBER = 'M0 -22C2.6 -22 3.4 -15 3.4 -8L31 -2.4 31 1.4 3.2 3.2 2.8 14 12 16.6 12 19.2 2.2 18.6C1.6 21.4 .8 22 0 22S-1.6 21.4-2.2 18.6L-12 19.2-12 16.6-2.8 14-3.2 3.2-31 1.4-31-2.4-3.4-8C-3.4-15-2.6-22 0-22ZM8.4-10.6H11V-4.6H8.4ZM17.6-8.6H20.2V-2.8H17.6ZM-11-10.6H-8.4V-4.6H-11ZM-20.2-8.6H-17.6V-2.8H-20.2Z'

/** A soldier standing guard, from the front: helmet, shoulders, rifle and bayonet; feet at 0, 112 tall */
const SOLDIER = 'M-13 -82Q-13 -99 0 -99Q13 -99 13 -82L17 -80L-17 -80ZM-8 -79H8Q8 -66 0 -65Q-8 -66 -8 -79ZM-7 -65H7L22 -57L24 -18H15L13 0H-13L-15 -18H-24L-22 -57ZM22.5 -96H26V-20H22.5ZM22.5 -96L24.25 -112L26 -96Z'

/** A skyline along the horizon: the shop's factories (or what's left of a city), with smokestacks */
function skyline(y: number, ruined: boolean): string {
  const blocks: [number, number][] = ruined
    ? [[44, 34], [30, 58], [52, 26], [26, 70], [48, 40], [34, 22], [58, 50], [28, 64], [46, 30], [40, 52], [30, 26], [52, 44], [44, 36]]
    : [[60, 30], [22, 74], [70, 42], [18, 88], [64, 34], [54, 52], [20, 80], [74, 38], [48, 28], [22, 70], [56, 46], [40, 32]]
  let x = 16, d = `M16 ${y}`
  for (const [w, h] of blocks) {
    const top = y - h
    if (ruined) d += `L${x} ${top + 8}L${x + w * 0.3} ${top}L${x + w * 0.45} ${top + 12}L${x + w * 0.7} ${top + 4}L${x + w} ${top + 14}`
    else if (w < 30) d += `L${x + 4} ${top}L${x + w - 4} ${top}L${x + w - 4} ${y - 20}L${x + w} ${y - 20}` // a smokestack
    else { const n = Math.round(w / 18); d += `L${x} ${top}`; for (let k = 0; k < n; k++) d += `L${x + ((k + 1) * w) / n} ${top - 10}L${x + ((k + 1) * w) / n} ${top}` } // sawtooth roof
    x += w
    if (x > 584) break
  }
  return `${d}L584 ${y - 20}L584 ${y}Z`
}

/**
 * A 1940s war poster for a settled week (warStory's posters), printed the
 * way they were: a few flat inks on aged paper, big block lettering, a
 * scene for each kind (the hero's night sky of searchlights and bombers
 * over the factories, a besieged city's soldiers standing guard under the
 * sun's rays, a fallen capital's flag at half-mast over a burning
 * skyline), the real map in a starred seal, a folded ribbon and the
 * printer's fine print. Folded, taped and worn at the edges.
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
  const ink = (u: string | null) => inkOf(colorOf(u))
  const kind = spec.key === 'hero' ? 'hero' : spec.key === 'fell' ? 'fell' : 'siege'
  const week = spec.fine.match(/WEEK (\d+)/)?.[1] ?? ''

  // The seal's window on the map: a square around the cities in focus (a city on its own, all of it)
  const pts = spec.focus.map(t => M.stadium[t]).filter(Boolean)
  if (spec.focus.length === 1 && M.territories[spec.focus[0]]) {
    const n = (M.territories[spec.focus[0]].match(/-?\d*\.?\d+/g) ?? []).map(Number)
    const tx = n.filter((_, i) => i % 2 === 0), ty = n.filter((_, i) => i % 2 === 1)
    const x0 = Math.min(...tx), x1 = Math.max(...tx), y0 = Math.min(...ty), y1 = Math.max(...ty)
    const r = Math.max(x1 - x0, y1 - y0) * 0.12
    pts.push([x0 - r, y0 - r], [x1 + r, y1 + r])
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const vs = Math.max(230, Math.max(...xs) - Math.min(...xs) + 120, Math.max(...ys) - Math.min(...ys) + 120)
  const view = `${cx - vs / 2} ${cy - vs / 2} ${vs} ${vs}`
  const sieges = Object.entries(besieged)

  // The attack: a curve between the cities, or along the sea lane with a warship on it
  let arrow: { d: string; head: string; ship?: { x: number; y: number; flip: boolean } } | null = null
  const route = spec.arrow?.sea ? laneRoute(spec.arrow.from, spec.arrow.to) : null
  const headAt = (tip: number[], nx: number, ny: number) => {
    const hl = vs / 10, hw = vs / 16, base = [tip[0] - nx * hl, tip[1] - ny * hl]
    return { base, head: `M${tip[0]} ${tip[1]} L${base[0] - ny * hw} ${base[1] + nx * hw} L${base[0] + ny * hw} ${base[1] - nx * hw}Z` }
  }
  if (route) {
    const end = along(route, 1), mid = along(route, 0.5)
    const { head } = headAt(end.at, end.dir[0], end.dir[1])
    arrow = { d: route.d, head, ship: { x: mid.at[0], y: mid.at[1], flip: route.pts[route.pts.length - 1][0] < route.pts[0][0] } }
  } else if (spec.arrow && M.stadium[spec.arrow.from] && M.stadium[spec.arrow.to]) {
    const a = M.stadium[spec.arrow.from], b = M.stadium[spec.arrow.to]
    const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.25, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.25
    const ux = b[0] - mx, uy = b[1] - my, l = Math.hypot(ux, uy) || 1, nx = ux / l, ny = uy / l
    const { base, head } = headAt([b[0] - (nx * vs) / 22, b[1] - (ny * vs) / 22], nx, ny)
    arrow = { d: `M${a[0]} ${a[1]} Q${mx} ${my} ${base[0]} ${base[1]}`, head }
  }

  const SKY = 612 // where the scene meets the paper below it
  const ring = kind === 'hero' ? RED : kind === 'siege' ? NAVY : INK
  const ringStar = kind === 'fell' ? RED : CREAM
  const fallen = kind === 'fell' ? inkOf(spec.flag ?? null) : null

  return (
    <svg viewBox="0 0 600 800" className={className} role="img" aria-label={`War poster: ${spec.head.join(' ')} ${spec.ribbon}`}>
      <defs>
        <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={4} />
          <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .16  0 0 0 0 .1  0 0 0 .55 0" />
        </filter>
        {/* Foxing and water stains */}
        <filter id={id('stain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves={3} seed={11} />
          <feColorMatrix values="0 0 0 0 .42  0 0 0 0 .3  0 0 0 0 .14  2.2 0 0 0 -1.2" />
        </filter>
        {/* The paper's edge, worn ragged */}
        <filter id={id('rag')} filterUnits="userSpaceOnUse" x="0" y="0" width="600" height="800">
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves={2} seed={3} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={9} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <mask id={id('sheet')} maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="800">
          <path d="M6 6H594V794H6Z" fill="#fff" filter={`url(#${id('rag')})`} />
          {/* a corner torn off */}
          <path d="M594 730L594 800L534 800Q556 776 566 758Q578 742 594 730Z" fill="#000" filter={`url(#${id('rag')})`} />
        </mask>
        <radialGradient id={id('age')} cx="50%" cy="48%" r="72%">
          <stop offset=".55" stopColor="#7a5a2c" stopOpacity="0" />
          <stop offset="1" stopColor="#7a5a2c" stopOpacity=".5" />
        </radialGradient>
        <pattern id={id('dots')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="3" cy="3" r="1.15" fill={INK} />
        </pattern>
        <pattern id={id('bigdots')} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="5" cy="5" r="2.2" fill={INK} />
        </pattern>
        <linearGradient id={id('dusk')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141b2b" />
          <stop offset=".62" stopColor="#2b1d24" />
          <stop offset="1" stopColor="#a8352a" />
        </linearGradient>
        {sieges.map(([t, by]) => (
          <pattern key={t} id={id(`siege${t}`)} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill={ink(owners[t] ?? null) ?? '#d8c9a0'} />
            <rect width="4.5" height="9" fill={ink(by) ?? INK} />
          </pattern>
        ))}
        <clipPath id={id('scene')}><rect x="16" y="16" width="568" height={SKY - 16} /></clipPath>
        <clipPath id={id('seal')}><circle cx="300" cy="425" r="140" /></clipPath>
      </defs>

      <g mask={`url(#${id('sheet')})`}>
        <rect width="600" height="800" fill={PAPER} />

        {/* ── The scene ── */}
        <g clipPath={`url(#${id('scene')})`}>
          {kind === 'hero' && (
            <>
              <rect x="16" y="16" width="568" height={SKY} fill={NAVY} />
              {/* Searchlights sweeping the night */}
              {[[70, -28], [190, -10], [410, 12], [530, 26]].map(([x, lean], k) => (
                <path key={k} d={`M${x - 5} ${SKY}L${x + 5} ${SKY}L${300 + lean * 9 + 70} 0L${300 + lean * 9 - 30} 0Z`} fill={CREAM} opacity={0.13} />
              ))}
              {/* The bombers, in formation */}
              {[[92, 318, 1], [56, 372, 0.8], [128, 382, 0.8], [510, 262, 0.62], [540, 296, 0.5]].map(([x, y, k], i) => (
                <path key={i} d={BOMBER} transform={`translate(${x} ${y}) rotate(38) scale(${k})`} fill="#0d1422" stroke={CREAM} strokeOpacity={0.35} strokeWidth={0.8} />
              ))}
              <path d={skyline(SKY, false)} fill={INK} />
              {[[96, 524], [208, 512], [452, 524]].map(([x, y], i) => (
                <g key={i} fill={CREAM} opacity={0.16}>
                  {Array.from({ length: 5 }, (_, k) => <circle key={k} cx={x - k * k * 2.4} cy={y - k * 13} r={6 + k * 3.2} />)}
                </g>
              ))}
            </>
          )}
          {kind === 'siege' && (
            <>
              <rect x="16" y="16" width="568" height={SKY} fill={OCHRE} />
              {/* The sun's rays behind the city */}
              {Array.from({ length: 18 }, (_, k) => {
                const a0 = ((2 * k) / 36) * Math.PI * 2, a1 = ((2 * k + 1) / 36) * Math.PI * 2, R = 900
                return <path key={k} d={`M300 425 L${300 + R * Math.cos(a0)} ${425 + R * Math.sin(a0)} L${300 + R * Math.cos(a1)} ${425 + R * Math.sin(a1)} Z`} fill="#ecc061" />
              })}
              <rect x="16" y="16" width="568" height={SKY} fill={`url(#${id('bigdots')})`} opacity={0.08} />
              {/* Barbed wire */}
              <path d={`M16 ${SKY - 30}` + Array.from({ length: 29 }, (_, k) => `Q${16 + k * 20 + 10} ${SKY - (k % 2 ? 22 : 38)} ${16 + (k + 1) * 20} ${SKY - 30}`).join('')} fill="none" stroke={INK} strokeWidth={2} />
              {Array.from({ length: 28 }, (_, k) => (
                <path key={k} d={`M${26 + k * 20 - 4} ${SKY - 34}l8 8m0 -8l-8 8`} stroke={INK} strokeWidth={1.6} />
              ))}
              <rect x="16" y={SKY - 14} width="568" height="14" fill={INK} />
              {/* Soldiers standing guard */}
              {[[64, 1], [148, 0.86], [452, 0.86], [536, 1]].map(([x, k], i) => (
                <path key={i} d={SOLDIER} transform={`translate(${x} ${SKY - 6}) scale(${k * 1.15})`} fill={NAVY} stroke={INK} strokeWidth={1.2} />
              ))}
            </>
          )}
          {kind === 'fell' && (
            <>
              <rect x="16" y="16" width="568" height={SKY} fill={`url(#${id('dusk')})`} />
              <rect x="16" y="16" width="568" height={SKY} fill={`url(#${id('bigdots')})`} opacity={0.1} />
              {/* Smoke over the burning city */}
              {[[70, SKY - 60], [262, SKY - 70], [520, SKY - 66]].map(([x, y], i) => (
                <g key={i} fill="#2c2427" opacity={0.5}>
                  {Array.from({ length: 7 }, (_, k) => <circle key={k} cx={x + k * k * 2.2 * (i % 2 ? -1 : 1)} cy={y - k * 34} r={12 + k * 7} opacity={1 - k * 0.11} />)}
                </g>
              ))}
              <path d={skyline(SKY, true)} fill={INK} />
              {[[70, SKY - 52], [262, SKY - 60], [380, SKY - 40], [520, SKY - 58]].map(([x, y], i) => (
                <path key={i} d={`M${x - 12} ${y + 22}Q${x - 14} ${y + 4} ${x - 4} ${y - 8}Q${x - 2} ${y + 4} ${x + 3} ${y - 2}Q${x + 6} ${y - 18} ${x + 2} ${y - 28}Q${x + 18} ${y - 6} ${x + 12} ${y + 22}Z`} fill={OCHRE} stroke={RED} strokeWidth={3} />
              ))}
            </>
          )}
        </g>

        {/* ── The headline ── */}
        {kind === 'hero' && (
          <>
            <Block text={spec.head[0]} y={172} max={150} fill={CREAM} shadow={RED} />
            <Block text={spec.head[1]} y={248} max={70} fill={OCHRE} shadow={INK} width={440} depth={4} />
          </>
        )}
        {kind === 'siege' && (
          <>
            <Block text={spec.head[0]} y={128} max={84} fill={NAVY} shadow={CREAM} width={480} depth={3} />
            <Block text={spec.head[1]} y={238} max={110} fill={RED} shadow={INK} />
          </>
        )}
        {kind === 'fell' && (
          <>
            <text x={300} y={104} textAnchor="middle" fontFamily={SCRIPT} fontSize={70} fill={CREAM} transform="rotate(-6 300 92)">Remember</text>
            <Block text={spec.head[1]} y={240} max={132} fill={RED} shadow="#4a1410" />
          </>
        )}

        {/* ── The seal: the real map, ringed with stars ── */}
        <circle cx="300" cy="425" r="162" fill={ring} stroke={INK} strokeWidth="4" />
        {Array.from({ length: 16 }, (_, k) => {
          const a = (k / 16) * Math.PI * 2 - Math.PI / 2
          return <path key={k} d={star(300 + 151 * Math.cos(a), 425 + 151 * Math.sin(a), 6.5)} fill={ringStar} />
        })}
        <g clipPath={`url(#${id('seal')})`}>
          <rect x="150" y="275" width="300" height="300" fill="#b9c3b1" />
          <svg x="160" y="285" width="280" height="280" viewBox={view} overflow="visible">
            {/* The colors, printed a hair off the black plate */}
            <g transform={`translate(${vs / 170} ${vs / 240})`}>
              {Object.entries(M.territories).map(([t, d]) => (
                <path key={t} d={d} fill={besieged[t] ? `url(#${id(`siege${t}`)})` : ink(owners[t] ?? null) ?? '#ddd0a8'} />
              ))}
            </g>
            {Object.values(M.territories).map((d, k) => (
              <path key={k} d={d} fill="none" stroke={INK} strokeWidth={vs / 170} strokeLinejoin="round" />
            ))}
            {arrow && (
              <>
                <path d={arrow.d} fill="none" stroke={CREAM} strokeWidth={vs / 18} strokeLinecap="round" />
                <path d={arrow.d} fill="none" stroke={INK} strokeWidth={vs / 30} strokeLinecap="round" />
                <path d={arrow.head} fill={INK} stroke={CREAM} strokeWidth={vs / 110} strokeLinejoin="round" />
                {arrow.ship && (
                  <g transform={`translate(${arrow.ship.x} ${arrow.ship.y - vs / 60})`}>
                    <Warship size={vs / 6} fill={INK} outline={CREAM} wake={CREAM} flip={arrow.ship.flip} />
                  </g>
                )}
              </>
            )}
            {spec.label.map(t => {
              const p = M.stadium[t]
              if (!p) return null
              return (
                <g key={t}>
                  <path d={star(p[0], p[1], vs / 48)} fill={RED} stroke={CREAM} strokeWidth={vs / 300} />
                  <text
                    x={p[0]} y={p[1] - vs / 30} textAnchor="middle" fontFamily={STENCIL} fontSize={vs / (spec.label.length > 1 ? 14 : 11)}
                    fill={INK} stroke={CREAM} strokeWidth={vs / 80} paintOrder="stroke" strokeLinejoin="round"
                  >
                    {spec.label.length > 1 ? t : cityName(t).toUpperCase()}
                  </text>
                </g>
              )
            })}
          </svg>
          <circle cx="300" cy="425" r="140" fill={`url(#${id('dots')})`} opacity={0.14} />
        </g>
        <circle cx="300" cy="425" r="140" fill="none" stroke={CREAM} strokeWidth="3" />
        <circle cx="300" cy="425" r="162" fill="none" stroke={INK} strokeWidth="4" />

        {/* A flag at half-mast over the fallen city, torn by the fighting */}
        {kind === 'fell' && (
          <g>
            <rect x="76" y="190" width="6" height={SKY - 190} fill={CREAM} stroke={INK} strokeWidth="1.5" />
            <circle cx="79" cy="186" r="7" fill={OCHRE} stroke={INK} strokeWidth="1.5" />
            <g transform="translate(82 372)">
              <clipPath id={id('flag')}>
                <path d="M0 0H118L108 10L122 22L104 34L116 48L100 58L112 70H0Z" />
              </clipPath>
              <g clipPath={`url(#${id('flag')})`}>
                {Array.from({ length: 7 }, (_, k) => (
                  <rect key={k} x="0" y={k * 10} width="124" height="10" fill={k % 2 ? CREAM : fallen ?? RED} />
                ))}
                <rect x="0" y="0" width="46" height="34" fill={NAVY} />
                <path d={star(23, 17, 10)} fill={CREAM} />
              </g>
              <path d="M0 0H118L108 10L122 22L104 34L116 48L100 58L112 70H0Z" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            </g>
          </g>
        )}

        {/* ── The ribbon, folded at its ends ── */}
        <path d="M24 660H100V716H24L46 688Z" fill={spec.ribbonColor} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M576 660H500V716H576L554 688Z" fill={spec.ribbonColor} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 660H100V716H24L46 688Z" fill={INK} opacity=".35" />
        <path d="M576 660H500V716H576L554 688Z" fill={INK} opacity=".35" />
        <path d="M70 704L100 716V704Z" fill={INK} />
        <path d="M530 704L500 716V704Z" fill={INK} />
        <rect x="70" y="648" width="460" height="56" fill={spec.ribbonColor} stroke={INK} strokeWidth="3" />
        <Block text={spec.ribbon} y={691} max={40} fill={CREAM} shadow={INK} width={420} depth={2} />

        {/* ── The fine print, and the printer's line ── */}
        <text x="300" y="746" textAnchor="middle" fontFamily={STENCIL} fontSize={Math.min(15, 520 / (spec.fine.length * 0.62))} fill={INK} letterSpacing="1">
          {spec.fine}
        </text>
        <line x1="60" y1="760" x2="540" y2="760" stroke={INK} strokeWidth="1" />
        <text x="300" y="780" textAnchor="middle" fontFamily={GOTHIC} fontSize="9.5" fill={INK} letterSpacing=".8">GRIDIRON UNITED PRINTING OFFICE : 2026 — O-{week || '0'}{kind === 'hero' ? 1 : kind === 'siege' ? 2 : 3} · POSTER No. {week}</text>

        {/* ── Age: stains, the folds, browned edges, grain ── */}
        <rect width="600" height="800" filter={`url(#${id('stain')})`} opacity=".22" style={{ mixBlendMode: 'multiply' }} />
        <rect width="600" height="800" fill={`url(#${id('age')})`} style={{ mixBlendMode: 'multiply' }} />
        <path d="M299.5 0V800M0 399.5H600" stroke="#fff" strokeOpacity=".22" strokeWidth="1.4" />
        <path d="M301.2 0V800M0 401.2H600" stroke="#4a3418" strokeOpacity=".2" strokeWidth="1" />
        <rect width="600" height="800" filter={`url(#${id('grain')})`} opacity=".55" style={{ mixBlendMode: 'multiply' }} />
      </g>

      {/* Tape holding it up */}
      <rect x="-14" y="10" width="92" height="26" transform="rotate(-38 32 23)" fill="#efe2a8" opacity=".62" />
      <rect x="522" y="10" width="92" height="26" transform="rotate(38 568 23)" fill="#efe2a8" opacity=".62" />
    </svg>
  )
}
