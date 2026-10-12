import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { M } from './mapGeometry'
import { useWarFonts } from './WarPoster'
import { WHOLE_MAP, cityName, mapAfterMoves, type WarStory } from './warStory'
import { createFilmSound, createNarrator, type FilmSound, type Narrator } from '@/lib/filmSound'
import type { ConquestData } from './conquestView'
import { fetchVoices, type VoiceFrom } from './newsreelVoice'

/** The TV's music dips while the newsreel talks (ShopTV's Spotify speaker listens). */
export const TV_DUCK = 'gu-tv-duck'

type Phase = 'ready' | 'leader' | 'title' | 'line' | 'end' | 'done'
/** The whole country, 16:9, where the camera starts (it moves the viewBox itself after this) */
const START_VIEW = `${M.width / 2 - (M.height * 8) / 9} 0 ${(M.height * 16) / 9} ${M.height}`
const DISPLAY = "'Limelight', 'Rockwell', Georgia, serif"

class Stopped extends Error {}

/**
 * The week's newsreel (warStory's lines): a film leader counting down, the
 * title card and a bugle, then the war map in black and white with the
 * camera moving battle to battle while the Commish narrates (the
 * Transatlantic announcer's recordings, else the device's voice or the
 * robot one; captions always), and the map filling in as it goes. Fills its
 * parent, which sets the 16:9 frame.
 */
export function Newsreel({ war, story, autoPlay = false, lite = false, soundHint, voiceFrom, onDone }: {
  war: ConquestData
  story: WarStory
  /** start straight away (the TV); otherwise it waits for a tap on play */
  autoPlay?: boolean
  /** lighter film effects (a Fire TV) */
  lite?: boolean
  /** what to do for sound, if the browser's holding it back */
  soundHint: string
  /** where to ask for the announcer's recordings: the TV's code, or the league (signed in) */
  voiceFrom?: VoiceFrom
  onDone?: () => void
}) {
  useWarFonts()
  const [phase, setPhase] = useState<Phase>('ready')
  const [count, setCount] = useState(3)
  const [line, setLine] = useState(-1)
  const [soundOff, setSoundOff] = useState(false)
  const sound = useRef<FilmSound | null>(null)
  const voice = useRef<Narrator | null>(null)
  const voiceOk = useRef(true)
  const run = useRef(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const color = useMemo(() => new Map(war.players.map(p => [p.userId, p.color])), [war.players])
  const colorOf = (u: string | null | undefined) => (u ? color.get(u) ?? '#777' : null)

  const start = (inTap: boolean) => {
    const id = ++run.current
    sound.current?.close()
    voice.current?.stop()
    sound.current = createFilmSound()
    voice.current = createNarrator(sound.current)
    voiceOk.current = true
    if (inTap) { void sound.current.unlock(); voice.current?.prime() }
    window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: true }))
    const alive = () => run.current === id
    const wait = (ms: number) => new Promise<void>((resolve, reject) => setTimeout(() => (alive() ? resolve() : reject(new Stopped())), ms))
    const s = sound.current
    // The announcer's recordings, fetched and readied while the leader and title run
    const recordings: Promise<(AudioBuffer | null)[] | null> = voiceFrom
      ? fetchVoices(story.lines.map(l => l.text), voiceFrom).then(urls => urls && Promise.all(urls.map(u =>
        fetch(u).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? s.prepare(b) : null)).catch(() => null))))
      : Promise.resolve(null)
    ;(async () => {
      setSoundOff(!(await s.unlock()))
      s.bed(true)
      setPhase('leader')
      for (let k = 0; k < 3; k++) { setCount(3 - k); s.beep(); await wait(1000) }
      setPhase('title')
      s.fanfare()
      await wait(2100)
      for (let i = 0; i < story.lines.length; i++) {
        if (!alive()) throw new Stopped()
        setLine(i)
        setPhase('line')
        const text = story.lines[i].text
        const began = Date.now()
        // The announcer's recording (the first line waits a little for them the first time
        // they're made), else the device's or the robot's voice, else long enough to read
        const rec = await Promise.race([
          recordings.then(r => r?.[i] ?? null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), i === 0 ? 9000 : 1500)),
        ])
        let spoke = false
        if (voiceOk.current) spoke = rec ? await s.play(rec) : voice.current ? await voice.current.say(text) : false
        if (!spoke) voiceOk.current = false
        const least = spoke ? 900 : 1300 + text.split(' ').length * 330
        await wait(Math.max(0, least - (Date.now() - began)))
        await wait(450)
      }
      setPhase('end')
      s.sting()
      await wait(2800)
      s.bed(false)
      setPhase('done')
      window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: false }))
      onDoneRef.current?.()
    })().catch(() => { /* stopped */ })
  }

  useEffect(() => {
    if (autoPlay) start(false)
    return () => {
      run.current++
      sound.current?.close()
      voice.current?.stop()
      window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A click, a tap or OK on the TV's remote turns the sound on mid-reel
  useEffect(() => {
    if (!soundOff) return
    const on = () => {
      voiceOk.current = true
      voice.current?.prime()
      void sound.current?.unlock().then(ok => { if (ok) setSoundOff(false) })
    }
    window.addEventListener('click', on, true)
    window.addEventListener('keydown', on, true)
    return () => { window.removeEventListener('click', on, true); window.removeEventListener('keydown', on, true) }
  }, [soundOff])

  // What the map shows: every move told so far (all of them at the end)
  const current = phase === 'line' ? story.lines[line] : null
  const { owners, sieges } = useMemo(() => {
    if (phase === 'end' || phase === 'done') return { owners: war.owners, sieges: war.besieged ?? {} }
    if (phase !== 'line') return mapAfterMoves(story.before, story.moves, [])
    return mapAfterMoves(story.before, story.moves, story.lines.slice(0, line + 1).flatMap(l => l.reveals))
  }, [phase, line, story, war.owners, war.besieged])
  const arrows = phase === 'line' ? story.lines.slice(0, line + 1).flatMap((l, i) => l.arrows.map(a => ({ ...a, now: i === line, key: `${i}${a.from}${a.to}` }))) : []
  const hatches = [...new Set(Object.values(sieges))]

  // The camera, the leader's sweep and the film's flicker and grain run frame by frame
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const film = useRef<HTMLDivElement>(null)
  const grain = useRef<HTMLCanvasElement>(null)
  const sweep = useRef<SVGPathElement>(null)
  const shotRef = useRef({ shot: WHOLE_MAP, since: 0, len: 1 })
  shotRef.current = current
    ? { shot: current.shot, since: shotRef.current.shot === current.shot ? shotRef.current.since : performance.now(), len: 2500 + current.text.length * 60 }
    : { shot: WHOLE_MAP, since: 0, len: 1 }
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const leaderAt = useRef(0)
  useEffect(() => { if (phase === 'leader') leaderAt.current = performance.now() }, [phase])
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cam = { ...WHOLE_MAP }
    let last = performance.now(), lastFx = 0, raf = 0
    const g = grain.current?.getContext('2d') ?? null
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { shot, since, len } = shotRef.current
      const drift = since ? 1 + 0.06 * Math.min(1, (now - since) / len) : 1
      const k = 1 - Math.exp(-dt * (reduce ? 8 : 2.1))
      cam = { x: cam.x + (shot.x - cam.x) * k, y: cam.y + (shot.y - cam.y) * k, z: cam.z + (shot.z * drift - cam.z) * k }
      const w = ((M.height * 16) / 9) / cam.z, h = (w * 9) / 16
      svg.current?.setAttribute('viewBox', `${cam.x - w / 2} ${cam.y - h / 2} ${w} ${h}`)
      if (phaseRef.current === 'leader' && sweep.current) {
        const s = ((now - leaderAt.current) / 1000) % 1, a = s * Math.PI * 2 - Math.PI / 2
        sweep.current.setAttribute('d', `M80 45 L80 -60 A105 105 0 ${s > 0.5 ? 1 : 0} 1 ${80 + 105 * Math.cos(a)} ${45 + 105 * Math.sin(a)} Z`)
      }
      const playing = phaseRef.current !== 'ready' && phaseRef.current !== 'done'
      if (!reduce && !lite && playing && now - lastFx > 55) {
        lastFx = now
        if (film.current) {
          film.current.style.filter = `grayscale(1) contrast(1.18) brightness(${(0.9 + Math.random() * 0.12).toFixed(3)})`
          film.current.style.transform = `translate(${((Math.random() - 0.5) * 0.25).toFixed(2)}%, ${((Math.random() - 0.5) * 0.35).toFixed(2)}%)`
        }
        if (g && grain.current) {
          const img = g.createImageData(grain.current.width, grain.current.height)
          for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v
            img.data[i + 3] = 255
          }
          g.putImageData(img, 0, 0)
          g.fillStyle = '#fff'
          if (Math.random() < 0.35) g.fillRect(Math.random() * grain.current.width, 0, 0.6, grain.current.height)
          if (Math.random() < 0.25) { g.beginPath(); g.arc(Math.random() * grain.current.width, Math.random() * grain.current.height, 0.8 + Math.random() * 1.6, 0, 7); g.fill() }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lite])

  // Type sized to the frame (1u = 1% of its width)
  const [u, setU] = useState(10)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setU(el.clientWidth / 100)
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const z = current?.shot.z ?? 1
  const card = 'absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-300'
  const showTitle = phase === 'ready' || phase === 'title'
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-black select-none" style={{ fontSize: u }}>
      <style>{`
        @keyframes gu-reel-ring { from { transform: scale(.35); opacity: .95 } to { transform: scale(1.6); opacity: 0 } }
        @keyframes gu-reel-march { to { stroke-dashoffset: -12 } }
        .gu-reel-ring { transform-box: fill-box; transform-origin: center; animation: gu-reel-ring 1.4s ease-out infinite; }
        .gu-reel-march { animation: gu-reel-march .5s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .gu-reel-ring, .gu-reel-march { animation: none } }
      `}</style>
      <div ref={film} className="absolute -inset-[0.5%]" style={{ filter: 'grayscale(1) contrast(1.18)' }}>
        <svg ref={svg} viewBox={START_VIEW} className="absolute inset-[0.5%] w-[99%] h-[99%]" style={{ background: '#161616' }} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            {hatches.map(by => (
              <pattern key={by} id={`gu-reel-h-${by}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="3.5" height="8" fill={colorOf(by) ?? '#fff'} />
                <rect x="3.5" width="1" height="8" fill="#000" />
              </pattern>
            ))}
          </defs>
          <g stroke="#ffffff12" strokeWidth=".8">
            {Array.from({ length: 45 }, (_, i) => <line key={`x${i}`} x1={-600 + i * 50} y1={-400} x2={-600 + i * 50} y2={1100} />)}
            {Array.from({ length: 30 }, (_, i) => <line key={`y${i}`} x1={-600} y1={-400 + i * 50} x2={1700} y2={-400 + i * 50} />)}
          </g>
          {Object.entries(M.territories).map(([t, d]) => (
            <path key={t} d={d} fill={colorOf(owners[t]) ?? '#2c2c2c'} stroke="#050505" strokeWidth={1.1} strokeLinejoin="round" style={{ transition: 'fill .9s ease' }} />
          ))}
          {Object.entries(sieges).map(([t, by]) => M.territories[t] && <path key={t} d={M.territories[t]} fill={`url(#gu-reel-h-${by})`} />)}
          {arrows.map(a => {
            const p = M.stadium[a.from], q = M.stadium[a.to]
            if (!p || !q) return null
            const mx = (p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.22, my = (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.22
            const d = `M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}`
            return (
              <g key={a.key} opacity={a.now ? 1 : 0.45} fill="none" strokeLinecap="round">
                <path d={d} stroke="#000" strokeWidth={6.5} />
                <path d={d} stroke="#fff" strokeWidth={3} strokeDasharray="7 5" className={a.now ? 'gu-reel-march' : undefined} />
              </g>
            )
          })}
          {Object.keys(sieges).map(t => M.stadium[t] && (
            <circle key={t} className="gu-reel-ring" cx={M.stadium[t][0]} cy={M.stadium[t][1]} r={18} fill="none" stroke="#fff" strokeWidth={2} />
          ))}
          {current?.labels.map(t => M.stadium[t] && (
            <text
              key={t} x={M.stadium[t][0]} y={M.stadium[t][1] - 22 / z} textAnchor="middle" fill="#fff" stroke="#000"
              strokeWidth={9 / z} paintOrder="stroke" fontFamily={DISPLAY} fontSize={34 / z} letterSpacing=".06em"
            >
              {cityName(t).toUpperCase()}
            </text>
          ))}
        </svg>

        {/* The leader counting down */}
        <div className={card} style={{ background: '#8d8d8d', opacity: phase === 'leader' ? 1 : 0 }}>
          <svg viewBox="0 0 160 90" className="w-full h-full" aria-hidden>
            <circle cx="80" cy="45" r="36" fill="none" stroke="#222" strokeWidth="1.2" />
            <circle cx="80" cy="45" r="30" fill="none" stroke="#222" strokeWidth=".8" />
            <path ref={sweep} fill="#00000030" />
            <line x1="0" y1="45" x2="160" y2="45" stroke="#222" strokeWidth=".6" />
            <line x1="80" y1="0" x2="80" y2="90" stroke="#222" strokeWidth=".6" />
            <text x="80" y="58" textAnchor="middle" fontFamily={DISPLAY} fontSize="38" fill="#111">{count}</text>
          </svg>
        </div>
        <div className={card} style={{ opacity: showTitle ? 1 : 0, background: 'radial-gradient(ellipse at center, #3a3a3a 0%, #0d0d0d 75%)' }}>
          <p style={{ fontFamily: DISPLAY, fontSize: '2.2em', letterSpacing: '.3em', color: '#ddd' }}>Gridiron United</p>
          <p style={{ fontFamily: DISPLAY, fontSize: '6.6em', lineHeight: 1, color: '#fff', margin: '.2em 0' }}>News of the Week</p>
          <div style={{ width: '36%', height: 2, margin: '.6em auto', background: 'linear-gradient(90deg, transparent, #bbb, transparent)' }} />
          <p style={{ fontFamily: DISPLAY, fontSize: '2em', letterSpacing: '.22em', color: '#ccc' }}>Dispatch from the Front · Week {story.week}{story.pending ? ' · As It Stands' : ''}</p>
        </div>
        <div className={card} style={{ opacity: phase === 'end' || phase === 'done' ? 1 : 0, background: 'radial-gradient(ellipse at center, #3a3a3a 0%, #0d0d0d 75%)' }}>
          <p style={{ fontFamily: DISPLAY, fontSize: '2.2em', letterSpacing: '.3em', color: '#ddd' }}>Gridiron United News</p>
          <p style={{ fontFamily: DISPLAY, fontSize: '6.6em', lineHeight: 1, color: '#fff', margin: '.2em 0' }}>
            {war.finalWeek != null && story.week >= war.finalWeek ? 'The End' : 'Stay Tuned'}
          </p>
          <div style={{ width: '36%', height: 2, margin: '.6em auto', background: 'linear-gradient(90deg, transparent, #bbb, transparent)' }} />
          <p style={{ fontFamily: DISPLAY, fontSize: '2em', letterSpacing: '.22em', color: '#ccc' }}>{story.pending ? 'More to come' : 'Pick wisely'}</p>
        </div>
        {current && (
          <p
            className="absolute inset-x-[6%] bottom-[7%] text-center font-cond font-semibold text-white"
            style={{ fontSize: '2.6em', lineHeight: 1.3, textShadow: '0 0 3px #000, 0 0 3px #000, 0 2px 4px #000' }}
          >
            {current.text}
          </p>
        )}
      </div>
      {!lite && <canvas ref={grain} width={240} height={135} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.2, mixBlendMode: 'screen' }} />}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, #000000c0 100%)' }} />

      {phase === 'ready' && (
        <button
          type="button"
          onClick={() => start(true)}
          aria-label="Play the newsreel"
          className="absolute inset-0 m-auto w-[14%] aspect-square max-w-[96px] min-w-[56px] rounded-full border-2 border-white/80 bg-black/60 text-white flex items-center justify-center"
        >
          <Play className="w-1/2 h-1/2 ml-[8%]" fill="currentColor" />
        </button>
      )}
      {phase === 'done' && !autoPlay && (
        <button
          type="button"
          onClick={() => start(true)}
          className="absolute left-1/2 -translate-x-1/2 bottom-[8%] rounded-full border border-white/70 bg-black/60 px-4 py-1.5 text-sm font-bold text-white"
        >
          Play again
        </button>
      )}
      {soundOff && phase !== 'ready' && phase !== 'done' && (
        <p className="absolute right-[2%] top-[3%] rounded-full bg-black/70 border border-white/40 px-[1.2em] py-[.4em] text-white font-cond font-bold" style={{ fontSize: '1.8em' }}>
          🔇 {soundHint}
        </p>
      )}
    </div>
  )
}
