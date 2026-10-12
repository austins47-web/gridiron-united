import { useState } from 'react'

// Old film over the newsreel: boiling grain, dust and hairs in the gate,
// scratches running down the reel, light flicker and blotches, the frame
// weaving and now and then jumping, a rounded projector gate burned dark
// at the edges, and the cue marks that flash at the end of a reel. All of
// it moves the cheap way (whole layers jumping, fading or sliding), so a
// Fire TV keeps up; `lite` leaves off the softest, costliest touches.

/** The sepia, contrast and softness of old nitrate stock, for the film itself */
export const FILM_TONE = 'grayscale(1) sepia(.55) contrast(1.32) brightness(.93)'
export const FILM_TONE_SOFT = `${FILM_TONE} blur(.35px)`

let textures: { grain: string; dust: string } | null = null
function makeTextures() {
  if (textures) return textures
  // Grain: clumps (noise drawn small, then blown up soft) over a fine layer, on mid-grey
  const g = document.createElement('canvas')
  g.width = g.height = 256
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
  gc.drawImage(coarse, 0, 0, 256, 256)
  const fine = gc.getImageData(0, 0, 256, 256)
  for (let i = 0; i < fine.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 70
    fine.data[i] += v; fine.data[i + 1] += v; fine.data[i + 2] += v
  }
  gc.putImageData(fine, 0, 0)

  // Dust: specks dark and light, a couple of hairs, on nothing
  const d = document.createElement('canvas')
  d.width = d.height = 512
  const dc = d.getContext('2d')!
  for (let k = 0; k < 14; k++) {
    dc.fillStyle = Math.random() < 0.6 ? `rgba(18,12,6,${0.5 + Math.random() * 0.4})` : `rgba(255,248,230,${0.4 + Math.random() * 0.4})`
    dc.beginPath()
    dc.ellipse(Math.random() * 512, Math.random() * 512, 0.8 + Math.random() * 3.2, 0.6 + Math.random() * 2.2, Math.random() * 3, 0, 7)
    dc.fill()
  }
  for (let k = 0; k < 2; k++) {
    dc.strokeStyle = 'rgba(15,10,5,.7)'
    dc.lineWidth = 0.8 + Math.random() * 0.6
    const x = Math.random() * 512, y = Math.random() * 512
    dc.beginPath()
    dc.moveTo(x, y)
    dc.bezierCurveTo(x + 20 + Math.random() * 30, y - 30, x - 10, y + 40, x + 25 + Math.random() * 25, y + 55 + Math.random() * 30)
    dc.stroke()
  }
  textures = { grain: g.toDataURL('image/jpeg', 0.85), dust: d.toDataURL('image/png') }
  return textures
}

const CSS = `
@keyframes gu-film-jump {
  0% { transform: translate(0, 0) } 10% { transform: translate(-5%, -10%) } 20% { transform: translate(-15%, 5%) }
  30% { transform: translate(7%, -25%) } 40% { transform: translate(-5%, 25%) } 50% { transform: translate(-15%, 10%) }
  60% { transform: translate(15%, 0) } 70% { transform: translate(0, 15%) } 80% { transform: translate(3%, 35%) }
  90% { transform: translate(-10%, 10%) } 100% { transform: translate(0, 0) }
}
@keyframes gu-film-dust {
  0% { transform: translate(0, 0); opacity: 1 } 12% { transform: translate(-20%, 8%); opacity: 0 }
  25% { transform: translate(10%, -15%); opacity: .9 } 37% { transform: translate(-8%, 20%); opacity: 0 }
  50% { transform: translate(18%, 5%); opacity: 1 } 62% { transform: translate(-14%, -12%); opacity: .5 }
  75% { transform: translate(4%, 16%); opacity: 0 } 87% { transform: translate(-6%, -4%); opacity: .8 } 100% { transform: translate(0, 0); opacity: 1 }
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
 * FILM_TONE and the `gu-film-weave` class itself). `cue`: flash the
 * reel-change marks now.
 */
export function FilmLook({ lite = false, cue = false }: { lite?: boolean; cue?: boolean }) {
  const [tex] = useState(() => (typeof document === 'undefined' ? null : makeTextures()))
  return (
    <>
      <style>{CSS}</style>
      {tex && (
        <>
          {/* Grain, boiling: one texture jumping about, frame to frame */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="gu-film-grain absolute" style={{ inset: '-50%', backgroundImage: `url(${tex.grain})`, backgroundSize: '256px 256px', mixBlendMode: 'overlay', opacity: 0.55 }} />
          </div>
          {/* Dust and hairs in the gate, flashing in and out */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="gu-film-dust absolute" style={{ inset: '-50%', backgroundImage: `url(${tex.dust})`, backgroundSize: '512px 512px' }} />
          </div>
        </>
      )}
      {/* Scratches down the reel */}
      <div className="gu-film-scratch-a absolute top-0 bottom-0 pointer-events-none" style={{ left: '23%', width: 1.5, background: 'linear-gradient(to bottom, transparent, rgba(255,250,235,.8) 15%, rgba(255,250,235,.5) 60%, transparent)' }} />
      <div className="gu-film-scratch-b absolute top-0 bottom-0 pointer-events-none" style={{ left: '71%', width: 1, background: 'linear-gradient(to bottom, rgba(20,12,5,.7), rgba(20,12,5,.4) 70%, transparent)' }} />
      {/* The projector's light, never quite steady */}
      <div className="gu-film-flicker absolute inset-0 pointer-events-none" style={{ background: '#fff8e6', mixBlendMode: 'overlay' }} />
      {!lite && (
        <div
          className="gu-film-blotch absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 30% 40%, rgba(255,240,200,.5), transparent 25%), radial-gradient(circle at 75% 70%, rgba(40,25,10,.5), transparent 20%)', mixBlendMode: 'soft-light' }}
        />
      )}
      {/* The gate: rounded corners, the edges burned dark */}
      <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: '3.5%', boxShadow: 'inset 0 0 7em 2.5em rgba(10,6,2,.92), 0 0 0 4em #000' }} />
      {/* Reel-change cue marks, top right */}
      {cue && <div className="gu-film-cue absolute pointer-events-none" style={{ right: '7%', top: '8%', width: '4.5%', aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,250,235,.9) 55%, rgba(255,250,235,0) 70%)' }} />}
    </>
  )
}
