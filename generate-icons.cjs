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

// ── Notification icons ────────────────────────────────────────
// One per kind of alert, shown beside the notification on Android and
// desktop (iPhone always shows the app icon): the app's own lucide
// glyph in gold on the dark tile. Kept inside the middle so a circular
// crop still shows all of it.
const { loadImage } = require('canvas')
const NOTIFY = {
  reminder: 'alarm-clock', result: 'trophy', lead: 'flame', clinch: 'crown',
  tiebreaker: 'target', alive: 'swords', draft: 'timer', trade: 'arrow-left-right',
  lineup: 'shirt', test: 'bell-ring',
}
const lucideSvg = (name, color) => {
  const src = fs.readFileSync(path.join(__dirname, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`), 'utf8')
  const arr = src.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*?\])\);/)[1]
  const nodes = new Function(`return ${arr}`)()
  const attrs = o => Object.entries(o).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('')}</svg>`
}
;(async () => {
  const dir = path.join(OUT, 'notify')
  fs.mkdirSync(dir, { recursive: true })
  for (const [file, icon] of Object.entries(NOTIFY)) {
    const size = 192
    const c = createCanvas(size, size), ctx = c.getContext('2d')
    ctx.fillStyle = '#141414'
    ctx.beginPath(); ctx.roundRect(0, 0, size, size, 44); ctx.fill()
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.5)
    glow.addColorStop(0, 'rgba(206,123,69,0.20)'); glow.addColorStop(1, 'rgba(206,123,69,0)')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, size, size)
    const img = await loadImage(Buffer.from(lucideSvg(icon, GOLD)))
    const g = 104
    ctx.drawImage(img, (size - g) / 2, (size - g) / 2, g, g)
    fs.writeFileSync(path.join(dir, `${file}.png`), c.toBuffer('image/png'))
  }
  console.log(`public/icons/notify/: ${Object.keys(NOTIFY).join(', ')}`)
})()
