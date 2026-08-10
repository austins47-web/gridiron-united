// Generates public/og-image.png using node-canvas.
// Run once from the repo root: node generate-og.cjs
const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const W = 1200, H = 630
const c = createCanvas(W, H)
const ctx = c.getContext('2d')

// ── Colors matching tailwind.config.js ───────────────────────
const BG       = '#0e1117'
const CARD     = '#161b27'
const BORDER   = '#273044'
const GRID     = '#1e2535'
const GOLD     = '#F5A623'
const MUTED    = '#8a9ab8'
const NFL_BLUE = '#4a9fe8'
const CFB_AMB  = '#e8a020'
const GRAY500  = '#5a6a8a'
const WHITE    = '#ffffff'
const QB_TEXT  = '#fbbf24'
const QB_BG    = 'rgba(146,64,14,0.5)'

// ── Background ────────────────────────────────────────────────
ctx.fillStyle = BG
ctx.fillRect(0, 0, W, H)

// ── Grid lines ───────────────────────────────────────────────
ctx.strokeStyle = GRID
ctx.lineWidth = 1
ctx.globalAlpha = 0.8
const cols = [200,400,600,800,1000]
const rows = [105,210,315,420,525]
cols.forEach(x => { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke() })
rows.forEach(y => { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke() })
ctx.globalAlpha = 1

// ── Gold top bar ─────────────────────────────────────────────
ctx.fillStyle = GOLD
ctx.fillRect(0, 0, W, 5)

// ── Gold left accent stripe ──────────────────────────────────
ctx.fillStyle = GOLD
roundRect(ctx, 72, 80, 4, 470, 2)
ctx.fill()

// ── Logo icon box ────────────────────────────────────────────
ctx.fillStyle = GOLD
roundRect(ctx, 100, 110, 52, 52, 10)
ctx.fill()

// Football inside icon (dark ellipse + lace lines)
ctx.save()
ctx.translate(126, 136)
ctx.rotate(-35 * Math.PI / 180)
ctx.fillStyle = BG
ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI*2); ctx.fill()
ctx.restore()
ctx.strokeStyle = GOLD; ctx.lineWidth = 1.8
ctx.setLineDash([2.5, 2])
ctx.beginPath(); ctx.moveTo(126,127); ctx.lineTo(126,145); ctx.stroke()
ctx.setLineDash([])
ctx.beginPath(); ctx.moveTo(120,134); ctx.lineTo(132,134); ctx.stroke()
ctx.beginPath(); ctx.moveTo(121,138); ctx.lineTo(131,138); ctx.stroke()

// ── App name ─────────────────────────────────────────────────
ctx.fillStyle = WHITE
ctx.font = 'bold 72px "Arial Black", Arial'
ctx.letterSpacing = '2px'
ctx.fillText('GRIDIRON', 172, 148)

ctx.fillStyle = GOLD
ctx.font = 'bold 52px "Arial Black", Arial'
ctx.fillText('UNITED', 172, 210)

// ── Tagline ──────────────────────────────────────────────────
ctx.fillStyle = MUTED
ctx.font = '22px Arial'
ctx.fillText('CFB + NFL Fantasy  —  Draft College & Pro Players Together', 172, 258)

// ── Divider ──────────────────────────────────────────────────
ctx.strokeStyle = BORDER; ctx.lineWidth = 1
ctx.beginPath(); ctx.moveTo(172,282); ctx.lineTo(1128,282); ctx.stroke()

// ── Feature cards ────────────────────────────────────────────
const cards = [
  { x:172,  label:'NFL',    color:NFL_BLUE, title:'Pro Players',    sub:'All 32 teams' },
  { x:412,  label:'CFB',    color:CFB_AMB,  title:'College Players', sub:'4,700+ athletes' },
  { x:652,  label:'DRAFT',  color:GOLD,     title:'Mock Draft',      sub:'Live scoring' },
  { x:892,  label:'SCORES', color:GRAY500,  title:'Live Games',      sub:'Week-by-week', w:236 },
]
cards.forEach(({ x, label, color, title, sub, w=220 }) => {
  ctx.fillStyle = CARD
  roundRect(ctx, x, 310, w, 90, 12); ctx.fill()
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1
  roundRect(ctx, x, 310, w, 90, 12); ctx.stroke()
  ctx.fillStyle = color
  roundRect(ctx, x, 310, w, 4, [2,2,0,0]); ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 13px "Arial Black", Arial'
  ctx.fillText(label, x+20, 348)
  ctx.fillStyle = WHITE
  ctx.font = 'bold 22px "Arial Black", Arial'
  ctx.fillText(title, x+20, 372)
  ctx.fillStyle = MUTED
  ctx.font = '13px Arial'
  ctx.fillText(sub, x+20, 392)
})

// ── Player row helper ─────────────────────────────────────────
function playerRow(y, pos, posColor, posBg, name, team, league, leagueColor, pts) {
  ctx.fillStyle = CARD
  roundRect(ctx, 172, y, 956, 44, 8); ctx.fill()
  ctx.strokeStyle = y === 428 ? BORDER : GRID; ctx.lineWidth = 1
  roundRect(ctx, 172, y, 956, 44, 8); ctx.stroke()

  // position badge
  ctx.fillStyle = posBg
  roundRect(ctx, 192, y+13, 28, 18, 3); ctx.fill()
  ctx.fillStyle = posColor
  ctx.font = 'bold 11px "Arial Black", Arial'
  ctx.textAlign = 'center'
  ctx.fillText(pos, 206, y+26)
  ctx.textAlign = 'left'

  // name
  ctx.fillStyle = WHITE
  ctx.font = '14px Arial'
  ctx.fillText(name, 234, y+28)

  // team
  ctx.fillStyle = MUTED
  ctx.fillText(team, 390, y+28)

  // league tag
  ctx.fillStyle = leagueColor
  ctx.font = 'bold 13px "Arial Black", Arial'
  ctx.fillText(league, 520, y+28)

  // points
  ctx.fillStyle = GOLD
  ctx.font = 'bold 14px "Arial Black", Arial'
  ctx.textAlign = 'right'
  ctx.fillText(pts, 1128, y+28)
  ctx.textAlign = 'left'
}

// Row 1 — Arch Manning, Texas (CFB)
playerRow(428, 'QB', QB_TEXT, QB_BG, 'Arch Manning', 'Texas', 'CFB', CFB_AMB, '31.2 pts')
// Row 2 — Josh Allen, Buffalo Bills (NFL)
playerRow(478, 'QB', QB_TEXT, QB_BG, 'Josh Allen', 'Buffalo Bills', 'NFL', NFL_BLUE, '38.9 pts')

// ── URL ──────────────────────────────────────────────────────
ctx.fillStyle = GRAY500
ctx.font = 'bold 18px "Arial Black", Arial'
ctx.fillText('GRIDIRON-UNITED.VERCEL.APP', 172, 590)

// ── Bottom gold bar ───────────────────────────────────────────
ctx.fillStyle = GOLD
ctx.fillRect(0, 625, W, 5)

// ── Write PNG ────────────────────────────────────────────────
const out = path.join(__dirname, 'public', 'og-image.png')
fs.writeFileSync(out, c.toBuffer('image/png'))
console.log('Written', fs.statSync(out).size.toLocaleString(), 'bytes →', out)

// ── Utility ──────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r,r,r,r]
  ctx.beginPath()
  ctx.moveTo(x+tl, y)
  ctx.lineTo(x+w-tr, y); ctx.arcTo(x+w,y, x+w,y+tr, tr)
  ctx.lineTo(x+w, y+h-br); ctx.arcTo(x+w,y+h, x+w-br,y+h, br)
  ctx.lineTo(x+bl, y+h); ctx.arcTo(x,y+h, x,y+h-bl, bl)
  ctx.lineTo(x, y+tl); ctx.arcTo(x,y, x+tl,y, tl)
  ctx.closePath()
}
