// Generates the app icons in public/icons/ — home-screen icons for the
// installed app (manifest + Apple touch icon) and the small monochrome
// badge Android shows in the status bar for a notification.
//
//   node generate-icons.cjs
//
// A "GU" monogram in the header wordmark's colors: gold G, white U,
// on the app's near-black. Impact stands in for Barlow Condensed
// (not installed for canvas) — same heavy condensed shape.
const { createCanvas, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')

registerFont('C:/Windows/Fonts/impact.ttf', { family: 'Impact' })

const BG = '#0A0A0A'
const GOLD = '#CE7B45'
const WHITE = '#ffffff'
const OUT = path.join(__dirname, 'public', 'icons')
fs.mkdirSync(OUT, { recursive: true })

/**
 * @param size   pixel size (square)
 * @param scale  monogram height as a share of the icon — maskable
 *               icons keep everything inside the central 80% circle
 * @param mono   white-only on transparent (notification badge)
 */
function draw(size, { scale = 0.62, mono = false } = {}) {
  const c = createCanvas(size, size)
  const ctx = c.getContext('2d')

  if (!mono) {
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, size, size)
    // Soft gold glow, like the OG image
    const glow = ctx.createRadialGradient(size / 2, size * 0.55, 0, size / 2, size * 0.55, size * 0.6)
    glow.addColorStop(0, 'rgba(206,123,69,0.22)')
    glow.addColorStop(1, 'rgba(206,123,69,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)
  }

  const fontPx = Math.round(size * scale)
  ctx.font = `${fontPx}px Impact`
  ctx.textBaseline = 'alphabetic'
  const gW = ctx.measureText('G').width
  const uW = ctx.measureText('U').width
  const gap = size * 0.015
  const total = gW + gap + uW
  const x = (size - total) / 2
  // Impact's cap height is ~0.79em; center the caps vertically
  const y = size / 2 + fontPx * 0.79 / 2

  ctx.fillStyle = mono ? WHITE : GOLD
  ctx.fillText('G', x, y)
  ctx.fillStyle = WHITE
  ctx.fillText('U', x + gW + gap, y)

  if (!mono) {
    // Gold bar under the monogram — the app's "chain marker" accent
    const barW = total * 0.9, barH = Math.max(2, size * 0.022)
    ctx.fillStyle = GOLD
    ctx.fillRect((size - barW) / 2, y + size * 0.05, barW, barH)
  }
  return c.toBuffer('image/png')
}

const files = {
  'icon-192.png': draw(192),
  'icon-512.png': draw(512),
  'icon-maskable-512.png': draw(512, { scale: 0.46 }),
  'apple-touch-icon.png': draw(180),
  'badge-96.png': draw(96, { scale: 0.7, mono: true }),
}
for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), buf)
  console.log(`public/icons/${name}  ${buf.length} bytes`)
}
