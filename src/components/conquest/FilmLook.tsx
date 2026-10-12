import { useEffect, useRef, useState } from 'react'

// Old film over the newsreel: boiling grain, dust and hairs in the gate,
// scratches running down the reel, light flicker and blotches, the frame
// weaving and now and then jumping, a rounded projector gate burned dark
// at the edges, and the cue marks that flash at the end of a reel.
//
// The grain and dust are one texture each, a tile's width bigger than the
// screen and jumped about a tile at a time (new grain every frame, for the
// price of moving one layer). `lite` (the Fire TV) draws it all into one
// small canvas instead (FilmCanvas): its graphics memory blacked out under
// the full-screen layers, and the picture there holds still (no weave).

/** The sepia, contrast and softness of old nitrate stock, for the film itself */
export const FILM_TONE = 'grayscale(1) sepia(.55) contrast(1.32) brightness(.93)'
export const FILM_TONE_SOFT = `${FILM_TONE} blur(.35px)`

const GRAIN_TILE = 256
const DUST_TILE = 512

let textures: { grain: string; dust: string } | null = null
function makeTextures() {
  if (textures) return textures
  // Grain: clumps (noise drawn small, then blown up soft) over a fine layer, on mid-grey
  const g = document.createElement('canvas')
  g.width = g.height = GRAIN_TILE
  const gc = g.getContext('2d')!
  const coarse = document.createElement('canvas')
  coarse.width = coarse.height = 96
  const cc = coarse.getContext('2d')!
  const ci = cc.createImageData(96, 96)
  for (let i = 0; i < ci.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 150
    ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = v
    ci.data[i + 3] = 255
  }
  cc.putImageData(ci, 0, 0)
  gc.imageSmoothingEnabled = true
  gc.drawImage(coarse, 0, 0, GRAIN_TILE, GRAIN_TILE)
  const fine = gc.getImageData(0, 0, GRAIN_TILE, GRAIN_TILE)
  for (let i = 0; i < fine.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 70
    fine.data[i] += v; fine.data[i + 1] += v; fine.data[i + 2] += v
  }
  gc.putImageData(fine, 0, 0)
  const grain = g.toDataURL('image/jpeg', 0.85)

  // Dust: specks dark and light, a couple of hairs, on nothing
  const d = document.createElement('canvas')
  d.width = d.height = DUST_TILE
  const dc = d.getContext('2d')!
  for (let k = 0; k < 14; k++) {
    dc.fillStyle = Math.random() < 0.6 ? `rgba(18,12,6,${0.5 + Math.random() * 0.4})` : `rgba(255,248,230,${0.4 + Math.random() * 0.4})`
    dc.beginPath()
    dc.ellipse(Math.random() * DUST_TILE, Math.random() * DUST_TILE, 0.8 + Math.random() * 3.2, 0.6 + Math.random() * 2.2, Math.random() * 3, 0, 7)
    dc.fill()
  }
  for (let k = 0; k < 2; k++) {
    dc.strokeStyle = 'rgba(15,10,5,.7)'
    dc.lineWidth = 0.8 + Math.random() * 0.6
    const x = Math.random() * DUST_TILE, y = Math.random() * DUST_TILE
    dc.beginPath()
    dc.moveTo(x, y)
    dc.bezierCurveTo(x + 20 + Math.random() * 30, y - 30, x - 10, y + 40, x + 25 + Math.random() * 25, y + 55 + Math.random() * 30)
    dc.stroke()
  }
  textures = { grain, dust: d.toDataURL('image/png') }
  return textures
}

// Each jump stays inside the layer's one-tile margin, so its edges never show
const CSS = `
@keyframes gu-film-jump {
  0% { transform: translate(0, 0) } 10% { transform: translate(-61px, -117px) } 20% { transform: translate(-103px, 37px) }
  30% { transform: translate(53px, -89px) } 40% { transform: translate(-29px, 101px) } 50% { transform: translate(-113px, 71px) }
  60% { transform: translate(97px, -11px) } 70% { transform: translate(7px, 113px) } 80% { transform: translate(41px, -41px) }
  90% { transform: translate(-79px, 23px) } 100% { transform: translate(0, 0) }
}
@keyframes gu-film-dust {
  0% { transform: translate(0, 0); opacity: 1 } 12% { transform: translate(-203px, 83px); opacity: 0 }
  25% { transform: translate(109px, -157px); opacity: .9 } 37% { transform: translate(-83px, 211px); opacity: 0 }
  50% { transform: translate(191px, 53px); opacity: 1 } 62% { transform: translate(-149px, -127px); opacity: .5 }
  75% { transform: translate(43px, 173px); opacity: 0 } 87% { transform: translate(-61px, -41px); opacity: .8 } 100% { transform: translate(0, 0); opacity: 1 }
}
@keyframes gu-film-scratch-a { 0% { transform: translateX(0); opacity: 0 } 8% { opacity: .55 } 40% { opacity: .2 } 55% { opacity: .6 } 90% { opacity: .1 } 100% { transform: translateX(9vw); opacity: 0 } }
@keyframes gu-film-scratch-b { 0% { transform: translateX(0); opacity: .5 } 30% { opacity: 0 } 45% { opacity: .45 } 70% { opacity: .15 } 100% { transform: translateX(-6vw); opacity: .4 } }
@keyframes gu-film-flicker {
  0% { opacity: .04 } 9% { opacity: .11 } 17% { opacity: .02 } 26% { opacity: .08 } 35% { opacity: .03 } 44% { opacity: .13 }
  52% { opacity: .05 } 61% { opacity: .09 } 70% { opacity: .02 } 79% { opacity: .1 } 88% { opacity: .04 } 100% { opacity: .07 }
}
@keyframes gu-film-weave {
  0% { transform: translate(0, 0) } 13% { transform: translate(.12%, -.18%) } 27% { transform: translate(-.1%, .1%) }
  41% { transform: translate(.08%, .22%) } 55% { transform: translate(-.14%, -.06%) } 69% { transform: translate(.05%, .15%) }
  83% { transform: translate(-.06%, -.2%) } 100% { transform: translate(0, 0) }
}
@keyframes gu-film-jumpframe { 0%, 96% { transform: translateY(0) } 97% { transform: translateY(-2.2%) } 98% { transform: translateY(1%) } 100% { transform: translateY(0) } }
@keyframes gu-film-blotch { 0%, 100% { opacity: 0 } 20% { opacity: .35 } 35% { opacity: .1 } 60% { opacity: .3 } 80% { opacity: 0 } }
@keyframes gu-film-cue { 0%, 18% { opacity: 1 } 19%, 49% { opacity: 0 } 50%, 68% { opacity: 1 } 69%, 100% { opacity: 0 } }
.gu-film-weave { animation: gu-film-weave 1.1s steps(1, end) infinite, gu-film-jumpframe 7.3s steps(1, end) infinite; }
.gu-film-grain { animation: gu-film-jump .55s steps(1, end) infinite; }
.gu-film-dust { animation: gu-film-dust .8s steps(1, end) infinite; }
.gu-film-scratch-a { animation: gu-film-scratch-a 3.7s linear infinite; }
.gu-film-scratch-b { animation: gu-film-scratch-b 5.3s linear infinite; }
.gu-film-flicker { animation: gu-film-flicker 1.3s steps(1, end) infinite; }
.gu-film-blotch { animation: gu-film-blotch 6.1s ease-in-out infinite; }
.gu-film-cue { animation: gu-film-cue 1.6s steps(1, end) 1 both; }
@media (prefers-reduced-motion: reduce) {
  .gu-film-weave, .gu-film-grain, .gu-film-dust, .gu-film-scratch-a, .gu-film-scratch-b, .gu-film-flicker, .gu-film-blotch { animation: none }
  .gu-film-scratch-a, .gu-film-scratch-b, .gu-film-dust { opacity: 0 }
}
`

/**
 * The film's damage and light, laid over the picture (which takes
 * FILM_TONE, and `gu-film-weave` when not lite, itself). `cue`: flash the
 * reel-change marks now.
 */
export function FilmLook({ lite = false, cue = false }: { lite?: boolean; cue?: boolean }) {
  return lite ? <FilmCanvas cue={cue} /> : <FilmLayers cue={cue} />
}

const CUE_STYLE = { right: '7%', top: '8%', width: '4.5%', aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,250,235,.9) 55%, rgba(255,250,235,0) 70%)' } as const

/**
 * The Fire TV's film: all of it (grain, dust, hairs, scratches, flicker
 * and the gate's burned edges) drawn into one small canvas stretched over
 * the picture, a dozen times a second. One small layer is all its
 * graphics memory takes without dropping frames to black; full-screen
 * layers piled up (the phones' way) blacked it out.
 */
function FilmCanvas({ cue }: { cue: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const c = canvas?.getContext('2d')
    if (!canvas || !c) return
    const W = canvas.width, H = canvas.height
    // A few frames of grain made once: dark and light specks on nothing
    const frames = Array.from({ length: 6 }, () => {
      const img = c.createImageData(W, H)
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() + Math.random() + Math.random()) / 3 - 0.5
        const v = n < 0 ? 22 : 245
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = Math.min(255, Math.abs(n) * 330)
      }
      return img
    })
    // The gate's burn, made once
    const gate = document.createElement('canvas')
    gate.width = W
    gate.height = H
    const gc = gate.getContext('2d')!
    const burn = gc.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62)
    burn.addColorStop(0, 'rgba(10,6,2,0)')
    burn.addColorStop(0.55, 'rgba(10,6,2,.5)')
    burn.addColorStop(1, 'rgba(10,6,2,.95)')
    gc.fillStyle = burn
    gc.fillRect(0, 0, W, H)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scratches: { x: number; drift: number; life: number; dark: boolean }[] = []
    let k = 0, raf = 0, last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 80) return
      last = now
      c.putImageData(frames[(k = (k + 1 + Math.floor(Math.random() * 4)) % frames.length)], 0, 0)
      if (!reduce) {
        // Dust, and now and then a hair
        for (let n = Math.floor(Math.random() * 4); n > 0; n--) {
          c.fillStyle = Math.random() < 0.6 ? 'rgba(18,12,6,.8)' : 'rgba(255,248,230,.7)'
          c.beginPath()
          c.ellipse(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 1.6, 0.4 + Math.random() * 1.2, Math.random() * 3, 0, 7)
          c.fill()
        }
        if (Math.random() < 0.06) {
          const x = Math.random() * W, y = Math.random() * H
          c.strokeStyle = 'rgba(15,10,5,.7)'
          c.lineWidth = 0.6
          c.beginPath()
          c.moveTo(x, y)
          c.bezierCurveTo(x + 8, y - 12, x - 4, y + 16, x + 10, y + 26)
          c.stroke()
        }
        // Scratches down the reel, drifting, coming and going
        if (scratches.length < 2 && Math.random() < 0.04) scratches.push({ x: Math.random() * W, drift: (Math.random() - 0.5) * 1.2, life: 20 + Math.random() * 60, dark: Math.random() < 0.4 })
        for (const s of scratches) {
          s.x += s.drift
          s.life--
          if (Math.random() < 0.8) {
            c.fillStyle = s.dark ? `rgba(20,12,5,${0.3 + Math.random() * 0.4})` : `rgba(255,250,235,${0.3 + Math.random() * 0.5})`
            c.fillRect(s.x, 0, 0.7, H)
          }
        }
        for (let i = scratches.length - 1; i >= 0; i--) if (scratches[i].life <= 0) scratches.splice(i, 1)
        // The projector's light, never quite steady
        c.fillStyle = `rgba(0,0,0,${(0.02 + Math.random() * 0.1).toFixed(3)})`
        c.fillRect(0, 0, W, H)
      }
      c.drawImage(gate, 0, 0)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      <style>{CSS}</style>
      <canvas ref={ref} width={480} height={270} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />
      {cue && <div className="gu-film-cue absolute pointer-events-none" style={CUE_STYLE} />}
    </>
  )
}

/** Phones' and computers' film: each part its own layer, blended over the picture */
function FilmLayers({ cue }: { cue: boolean }) {
  const [tex] = useState(() => (typeof document === 'undefined' ? null : makeTextures()))
  return (
    <>
      <style>{CSS}</style>
      {tex && (
        <>
          {/* Grain, boiling: one texture jumping about, frame to frame */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="gu-film-grain absolute"
              style={{ inset: -GRAIN_TILE / 2, backgroundImage: `url(${tex.grain})`, backgroundSize: `${GRAIN_TILE}px ${GRAIN_TILE}px`, mixBlendMode: 'overlay', opacity: 0.55 }}
            />
          </div>
          {/* Dust and hairs in the gate, flashing in and out */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="gu-film-dust absolute" style={{ inset: -DUST_TILE / 2, backgroundImage: `url(${tex.dust})`, backgroundSize: `${DUST_TILE}px ${DUST_TILE}px` }} />
          </div>
        </>
      )}
      {/* Scratches down the reel */}
      <div className="gu-film-scratch-a absolute top-0 bottom-0 pointer-events-none" style={{ left: '23%', width: 1.5, background: 'linear-gradient(to bottom, transparent, rgba(255,250,235,.8) 15%, rgba(255,250,235,.5) 60%, transparent)' }} />
      <div className="gu-film-scratch-b absolute top-0 bottom-0 pointer-events-none" style={{ left: '71%', width: 1, background: 'linear-gradient(to bottom, rgba(20,12,5,.7), rgba(20,12,5,.4) 70%, transparent)' }} />
      {/* The projector's light, never quite steady */}
      <div className="gu-film-flicker absolute inset-0 pointer-events-none" style={{ background: '#fff8e6', mixBlendMode: 'overlay' }} />
      <div
        className="gu-film-blotch absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 30% 40%, rgba(255,240,200,.5), transparent 25%), radial-gradient(circle at 75% 70%, rgba(40,25,10,.5), transparent 20%)', mixBlendMode: 'soft-light' }}
      />
      {/* The gate: rounded corners, the edges burned dark */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ borderRadius: '3.5%', boxShadow: 'inset 0 0 7em 2.5em rgba(10,6,2,.92), 0 0 0 4em #000' }}
      />
      {/* Reel-change cue marks, top right */}
      {cue && <div className="gu-film-cue absolute pointer-events-none" style={CUE_STYLE} />}
    </>
  )
}
