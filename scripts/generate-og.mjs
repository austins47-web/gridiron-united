import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'

const W = 1200
const H = 630
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// Background
ctx.fillStyle = '#0a1a0a'
ctx.fillRect(0, 0, W, H)

// Grid lines
ctx.strokeStyle = '#1a3a1a'
ctx.lineWidth = 1
const step = 70
for (let x = 0; x < W; x += step) {
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
}
for (let y = 0; y < H; y += step) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
}

// Green border bars
ctx.fillStyle = '#22c55e'
ctx.fillRect(0, 0, 14, H)
ctx.fillRect(W - 14, 0, 14, H)
ctx.fillRect(0, 0, W, 14)
ctx.fillRect(0, H - 14, W, 14)

// Faint yard lines
ctx.fillStyle = 'rgba(34,197,94,0.12)'
ctx.fillRect(70, 258, W - 140, 7)
ctx.fillRect(70, 368, W - 140, 7)

// GRIDIRON — big green
ctx.font = 'bold 168px "Arial Narrow", Arial'
ctx.fillStyle = '#22c55e'
ctx.textAlign = 'center'
ctx.textBaseline = 'alphabetic'
ctx.fillText('GRIDIRON', W / 2, 305)

// UNITED — white
ctx.font = '400 128px "Arial Narrow", Arial'
ctx.fillStyle = '#ffffff'
ctx.fillText('UNITED', W / 2, 448)

// Tag line
ctx.font = '500 28px Arial'
ctx.fillStyle = '#86efac'
ctx.fillText('NFL + CFB FANTASY FOOTBALL', W / 2, 526)

// Domain
ctx.font = '400 20px Arial'
ctx.fillStyle = 'rgba(74,222,128,0.5)'
ctx.fillText('gridiron-united.vercel.app', W / 2, 592)

// Top center diamond mark
ctx.fillStyle = '#22c55e'
ctx.beginPath()
ctx.moveTo(W / 2, 30); ctx.lineTo(W / 2 + 14, 50)
ctx.lineTo(W / 2, 70); ctx.lineTo(W / 2 - 14, 50)
ctx.closePath(); ctx.fill()

// Horizontal accent lines flanking the diamond
ctx.strokeStyle = 'rgba(34,197,94,0.35)'
ctx.lineWidth = 1
ctx.beginPath(); ctx.moveTo(100, 50); ctx.lineTo(W / 2 - 26, 50); ctx.stroke()
ctx.beginPath(); ctx.moveTo(W / 2 + 26, 50); ctx.lineTo(W - 100, 50); ctx.stroke()

const buf = canvas.toBuffer('image/png')
writeFileSync('public/og-image.png', buf)
console.log('og-image.png written — 1200x630px')
