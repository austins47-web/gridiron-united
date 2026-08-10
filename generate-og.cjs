const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const W = 1200, H = 630
const c = createCanvas(W, H)
const ctx = c.getContext('2d')

const BG       = '#08090f'
const CARD     = '#161b27'
const BORDER   = '#273044'
const GOLD     = '#F5A623'
const WHITE    = '#ffffff'
const MUTED    = '#8a9ab8'
const DIM      = '#5a6a8a'
const DARKER   = '#3a4560'
const NFL_BLUE = '#4a9fe8'
const CFB_AMB  = '#e8a020'
const QB_GOLD  = '#fbbf24'

// Left col: x=50 to x=660 (610px usable). Right col: x=680 to x=1150.
const LX  = 50   // left margin
const COL = 660  // left column right edge — cards start at 680

function rr(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r, y)
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r)
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r)
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,   y+h, x,   y+h-r, r)
  ctx.lineTo(x, y+r); ctx.arcTo(x,   y,   x+r, y,   r)
  ctx.closePath()
}

// ── Background ────────────────────────────────────────────────
ctx.fillStyle = BG
ctx.fillRect(0, 0, W, H)

// ── Gold glow orb ─────────────────────────────────────────────
const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 420)
grd.addColorStop(0, 'rgba(245,166,35,0.13)')
grd.addColorStop(1, 'rgba(245,166,35,0)')
ctx.fillStyle = grd
ctx.fillRect(0, 0, W, H)

// ── Field yard lines ──────────────────────────────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.04)'
ctx.lineWidth = 1.5
for (let y = 72; y < H; y += 72) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
}

// ── End zone tints ────────────────────────────────────────────
ctx.fillStyle = 'rgba(255,255,255,0.012)'
ctx.fillRect(0, 0, 80, H)
ctx.fillRect(W - 80, 0, 80, H)

// ── Goal posts (decorative, behind everything) ────────────────
ctx.strokeStyle = 'rgba(255,255,255,0.055)'
ctx.lineWidth = 3
ctx.beginPath(); ctx.moveTo(40, 190); ctx.lineTo(40, 430); ctx.stroke()
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(40, 280); ctx.lineTo(14, 190); ctx.stroke()
ctx.beginPath(); ctx.moveTo(40, 280); ctx.lineTo(66, 190); ctx.stroke()

ctx.lineWidth = 3
ctx.beginPath(); ctx.moveTo(1160, 190); ctx.lineTo(1160, 430); ctx.stroke()
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(1160, 280); ctx.lineTo(1134, 190); ctx.stroke()
ctx.beginPath(); ctx.moveTo(1160, 280); ctx.lineTo(1186, 190); ctx.stroke()

// ── Vertical divider between columns ─────────────────────────
ctx.strokeStyle = 'rgba(39,48,68,0.8)'
ctx.lineWidth = 1
ctx.beginPath(); ctx.moveTo(668, 40); ctx.lineTo(668, 590); ctx.stroke()

// ── LEFT COLUMN ───────────────────────────────────────────────

// League badges
ctx.fillStyle = 'rgba(74,159,232,0.2)'
rr(LX, 44, 72, 32, 7); ctx.fill()
ctx.strokeStyle = 'rgba(74,159,232,0.35)'; ctx.lineWidth = 1
rr(LX, 44, 72, 32, 7); ctx.stroke()
ctx.fillStyle = NFL_BLUE
ctx.font = '900 13px "Arial Black", Arial'
ctx.textAlign = 'center'
ctx.fillText('NFL', LX + 36, 66)

ctx.fillStyle = DARKER
ctx.font = '900 18px "Arial Black", Arial'
ctx.fillText('+', LX + 88, 67)

ctx.fillStyle = 'rgba(232,160,32,0.2)'
rr(LX + 100, 44, 100, 32, 7); ctx.fill()
ctx.strokeStyle = 'rgba(232,160,32,0.35)'; ctx.lineWidth = 1
rr(LX + 100, 44, 100, 32, 7); ctx.stroke()
ctx.fillStyle = CFB_AMB
ctx.font = '900 13px "Arial Black", Arial'
ctx.fillText('COLLEGE', LX + 150, 66)
ctx.textAlign = 'left'

// Headline — fit within 610px left col
// "FANTASY" at 88px ≈ 530px wide — fits
// "FOOTBALL" at 88px ≈ 605px wide — tight but fits
ctx.fillStyle = WHITE
ctx.font = '900 88px "Arial Black", Arial'
ctx.fillText('FANTASY', LX, 184)

ctx.fillStyle = GOLD
ctx.font = '900 88px "Arial Black", Arial'
ctx.fillText('FOOTBALL', LX, 284)

// UNITED subtext
ctx.fillStyle = DIM
ctx.font = '900 26px "Arial Black", Arial'
ctx.fillText('UNITED', LX + 2, 328)

// Tagline — two short lines so it never runs past col edge
ctx.fillStyle = DIM
ctx.font = '20px Arial'
ctx.fillText('Draft NFL pros and college stars', LX + 2, 372)
ctx.fillText('on the same roster. Free to play.', LX + 2, 398)

// Stat pills
const stats = [
  { n: '32',   l: 'NFL Teams',    w: 130 },
  { n: '130+', l: 'CFB Programs', w: 150 },
  { n: '4',    l: 'Formats',      w: 110 },
]
let sx = LX
stats.forEach(({ n, l, w }) => {
  ctx.fillStyle = CARD
  rr(sx, 428, w, 56, 10); ctx.fill()
  ctx.fillStyle = GOLD
  ctx.font = '900 24px "Arial Black", Arial'
  ctx.fillText(n, sx + 18, 453)
  ctx.fillStyle = DIM
  ctx.font = '12px Arial'
  ctx.fillText(l, sx + 18, 472)
  sx += w + 10
})

// URL
ctx.fillStyle = BORDER
ctx.font = 'bold 13px "Arial Black", Arial'
ctx.fillText('GRIDIRON-UNITED.VERCEL.APP', LX + 2, 582)

// ── RIGHT COLUMN ──────────────────────────────────────────────
// Cards: x=680, width=470, so right edge = 1150. 1200 - 1150 = 50px margin.

function card(y, leagueTxt, leagueColor, badgeBg, badgeStroke, name, team, pts) {
  const CX = 680, CW = 470, CH = 228

  ctx.fillStyle = CARD
  rr(CX, y, CW, CH, 18); ctx.fill()

  // color bar
  ctx.fillStyle = leagueColor
  ctx.beginPath()
  ctx.moveTo(CX+7, y); ctx.arcTo(CX, y, CX, y+7, 7)
  ctx.lineTo(CX, y+CH-7); ctx.arcTo(CX, y+CH, CX+7, y+CH, 7)
  ctx.lineTo(CX+7, y+CH); ctx.lineTo(CX+7, y)
  ctx.closePath(); ctx.fill()

  // league pill
  const pw = leagueTxt === 'COLLEGE' ? 84 : 62
  ctx.fillStyle = badgeBg
  rr(CX+22, y+26, pw, 28, 6); ctx.fill()
  ctx.strokeStyle = badgeStroke; ctx.lineWidth = 1
  rr(CX+22, y+26, pw, 28, 6); ctx.stroke()
  ctx.fillStyle = leagueColor
  ctx.font = '900 12px "Arial Black", Arial'
  ctx.textAlign = 'center'
  ctx.fillText(leagueTxt, CX + 22 + pw/2, y + 46)

  // QB badge
  const qbX = CX + 22 + pw + 8
  ctx.fillStyle = 'rgba(146,64,14,0.4)'
  rr(qbX, y+26, 42, 28, 6); ctx.fill()
  ctx.fillStyle = QB_GOLD
  ctx.fillText('QB', qbX + 21, y + 46)
  ctx.textAlign = 'left'

  // name — 40px fits both names well within 470px card
  ctx.fillStyle = WHITE
  ctx.font = '900 40px "Arial Black", Arial'
  ctx.fillText(name, CX+22, y + 122)

  // team
  ctx.fillStyle = MUTED
  ctx.font = '20px Arial'
  ctx.fillText(team, CX+22, y + 154)

  // pts
  ctx.fillStyle = GOLD
  ctx.font = '900 36px "Arial Black", Arial'
  ctx.textAlign = 'right'
  ctx.fillText(pts, CX+CW-22, y + 154)
  ctx.fillStyle = DIM
  ctx.font = '14px Arial'
  ctx.fillText('pts/wk', CX+CW-22, y + 176)
  ctx.textAlign = 'left'
}

card(40,  'COLLEGE', CFB_AMB,  'rgba(232,160,32,0.18)', 'rgba(232,160,32,0.4)',  'Arch Manning', 'Texas Longhorns', '31.2')
card(296, 'NFL',     NFL_BLUE, 'rgba(74,159,232,0.18)', 'rgba(74,159,232,0.4)',  'Josh Allen',   'Buffalo Bills',   '38.9')

// ── Write PNG ─────────────────────────────────────────────────
const out = path.join(__dirname, 'public', 'og-image.png')
fs.writeFileSync(out, c.toBuffer('image/png'))
console.log('Written', fs.statSync(out).size.toLocaleString(), 'bytes ->', out)
