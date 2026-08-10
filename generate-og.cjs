const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const W = 1200, H = 630
const c = createCanvas(W, H)
const ctx = c.getContext('2d')

// Exact colors from tailwind.config.js + landing page
const BG       = '#08090f'  // field-950
const CARD     = '#161b27'  // field-800
const BORDER   = '#273044'  // field-600
const GOLD     = '#F5A623'
const WHITE    = '#ffffff'
const MUTED    = '#8a9ab8'  // field-300
const DIM      = '#5a6a8a'  // field-500
const DARKER   = '#3a4560'  // field-400 (darker for URL)
const NFL_BLUE = '#4a9fe8'
const CFB_AMB  = '#e8a020'
const QB_GOLD  = '#fbbf24'

function rr(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x,   y+h, x,   y+h-r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x,   y,   x+r, y,   r)
  ctx.closePath()
}

// ── Background ────────────────────────────────────────────────
ctx.fillStyle = BG
ctx.fillRect(0, 0, W, H)

// ── Gold glow orb (center, exactly like hero) ─────────────────
const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400)
grd.addColorStop(0,   'rgba(245,166,35,0.13)')
grd.addColorStop(1,   'rgba(245,166,35,0)')
ctx.fillStyle = grd
ctx.fillRect(0, 0, W, H)

// ── Field yard lines (horizontal, like the hero SVG) ──────────
ctx.strokeStyle = 'rgba(255,255,255,0.04)'
ctx.lineWidth = 1.5
for (let y = 72; y < H; y += 72) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
}

// ── Center line ───────────────────────────────────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.02)'
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke()

// ── End zone tints ────────────────────────────────────────────
ctx.fillStyle = 'rgba(255,255,255,0.012)'
ctx.fillRect(0, 0, 120, H)
ctx.fillRect(W - 120, 0, 120, H)

// ── Goal posts left ───────────────────────────────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.06)'
ctx.lineWidth = 3
ctx.beginPath(); ctx.moveTo(60, 200); ctx.lineTo(60, 420); ctx.stroke()
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(60, 290); ctx.lineTo(30, 200); ctx.stroke()
ctx.beginPath(); ctx.moveTo(60, 290); ctx.lineTo(90, 200); ctx.stroke()

// ── Goal posts right ──────────────────────────────────────────
ctx.lineWidth = 3
ctx.beginPath(); ctx.moveTo(1140, 200); ctx.lineTo(1140, 420); ctx.stroke()
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(1140, 290); ctx.lineTo(1110, 200); ctx.stroke()
ctx.beginPath(); ctx.moveTo(1140, 290); ctx.lineTo(1170, 200); ctx.stroke()

// ── League badges (top left) ──────────────────────────────────
// NFL badge
ctx.fillStyle = 'rgba(74,159,232,0.2)'
rr(150, 80, 84, 34, 8); ctx.fill()
ctx.strokeStyle = 'rgba(74,159,232,0.35)'; ctx.lineWidth = 1
rr(150, 80, 84, 34, 8); ctx.stroke()
ctx.fillStyle = NFL_BLUE
ctx.font = '900 15px "Arial Black", Arial'
ctx.textAlign = 'center'
ctx.fillText('NFL', 192, 103)

// plus sign
ctx.fillStyle = DARKER
ctx.font = '900 20px "Arial Black", Arial'
ctx.fillText('+', 252, 103)

// CFB badge
ctx.fillStyle = 'rgba(232,160,32,0.2)'
rr(268, 80, 114, 34, 8); ctx.fill()
ctx.strokeStyle = 'rgba(232,160,32,0.35)'; ctx.lineWidth = 1
rr(268, 80, 114, 34, 8); ctx.stroke()
ctx.fillStyle = CFB_AMB
ctx.font = '900 15px "Arial Black", Arial'
ctx.fillText('COLLEGE', 325, 103)
ctx.textAlign = 'left'

// ── HEADLINE — massive, like the hero h1 ─────────────────────
ctx.fillStyle = WHITE
ctx.font = '900 148px "Arial Black", Arial'
ctx.fillText('FANTASY', 150, 238)

ctx.fillStyle = GOLD
ctx.font = '900 148px "Arial Black", Arial'
ctx.fillText('FOOTBALL', 150, 374)

// ── Subhead / UNITED ──────────────────────────────────────────
ctx.fillStyle = DIM
ctx.font = '900 30px "Arial Black", Arial'
ctx.fillText('UNITED', 154, 422)

// ── Tagline ───────────────────────────────────────────────────
ctx.fillStyle = DIM
ctx.font = '22px Arial'
ctx.fillText('Draft NFL pros and college stars on one roster.', 154, 464)

// ── Stat pills ────────────────────────────────────────────────
const stats = [
  { x: 154, n: '32',   l: 'NFL Teams',      w: 142 },
  { x: 308, n: '130+', l: 'CFB Programs',   w: 172 },
  { x: 492, n: '4',    l: 'League Formats', w: 172 },
]
stats.forEach(({ x, n, l, w }) => {
  ctx.fillStyle = CARD
  rr(x, 494, w, 60, 10); ctx.fill()
  ctx.fillStyle = GOLD
  ctx.font = '900 26px "Arial Black", Arial'
  ctx.fillText(n, x + 22, 522)
  ctx.fillStyle = DIM
  ctx.font = '13px Arial'
  ctx.fillText(l, x + 22, 542)
})

// ── Player card helper ────────────────────────────────────────
function card(y, leagueTxt, leagueColor, badgeBg, badgeStroke, name, team, pts) {
  // card
  ctx.fillStyle = CARD
  rr(730, y, 420, 220, 20); ctx.fill()

  // left bar
  ctx.fillStyle = leagueColor
  ctx.beginPath()
  ctx.moveTo(737, y); ctx.arcTo(730, y, 730, y+7, 7)
  ctx.lineTo(730, y + 220 - 7); ctx.arcTo(730, y+220, 737, y+220, 7)
  ctx.lineTo(737, y + 220)
  ctx.lineTo(737, y)
  ctx.closePath(); ctx.fill()

  // league pill
  ctx.fillStyle = badgeBg
  rr(760, y + 28, leagueTxt === 'COLLEGE' ? 84 : 64, 30, 7); ctx.fill()
  ctx.strokeStyle = badgeStroke; ctx.lineWidth = 1
  rr(760, y + 28, leagueTxt === 'COLLEGE' ? 84 : 64, 30, 7); ctx.stroke()
  ctx.fillStyle = leagueColor
  ctx.font = '900 13px "Arial Black", Arial'
  ctx.textAlign = 'center'
  ctx.fillText(leagueTxt, leagueTxt === 'COLLEGE' ? 802 : 792, y + 49)

  // QB badge
  const qbX = leagueTxt === 'COLLEGE' ? 858 : 838
  ctx.fillStyle = 'rgba(146,64,14,0.4)'
  rr(qbX, y + 28, 46, 30, 7); ctx.fill()
  ctx.fillStyle = QB_GOLD
  ctx.fillText('QB', qbX + 23, y + 49)
  ctx.textAlign = 'left'

  // name
  ctx.fillStyle = WHITE
  ctx.font = '900 44px "Arial Black", Arial'
  ctx.fillText(name, 760, y + 128)

  // team
  ctx.fillStyle = MUTED
  ctx.font = '22px Arial'
  ctx.fillText(team, 760, y + 163)

  // pts right-aligned
  ctx.fillStyle = GOLD
  ctx.font = '900 40px "Arial Black", Arial'
  ctx.textAlign = 'right'
  ctx.fillText(pts, 1126, y + 163)
  ctx.fillStyle = DIM
  ctx.font = '15px Arial'
  ctx.fillText('pts / wk', 1126, y + 186)
  ctx.textAlign = 'left'
}

card(72,  'COLLEGE', CFB_AMB, 'rgba(232,160,32,0.2)',  'rgba(232,160,32,0.4)', 'Arch Manning', 'Texas Longhorns', '31.2')
card(316, 'NFL',     NFL_BLUE,'rgba(74,159,232,0.2)',   'rgba(74,159,232,0.4)', 'Josh Allen',   'Buffalo Bills',   '38.9')

// ── URL ───────────────────────────────────────────────────────
ctx.fillStyle = BORDER
ctx.font = 'bold 15px "Arial Black", Arial'
ctx.fillText('GRIDIRON-UNITED.VERCEL.APP', 154, 606)

// ── Write PNG ─────────────────────────────────────────────────
const out = path.join(__dirname, 'public', 'og-image.png')
fs.writeFileSync(out, c.toBuffer('image/png'))
console.log('Written', fs.statSync(out).size.toLocaleString(), 'bytes ->', out)
