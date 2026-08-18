const { createCanvas } = require('canvas')
const c = createCanvas(1200, 630)
const ctx = c.getContext('2d')
ctx.font = '900 88px Arial'
console.log('FANTASY  width:', Math.round(ctx.measureText('FANTASY').width))
console.log('FOOTBALL width:', Math.round(ctx.measureText('FOOTBALL').width))
ctx.font = '900 40px Arial'
console.log('Arch Manning width:', Math.round(ctx.measureText('Arch Manning').width))
console.log('Josh Allen   width:', Math.round(ctx.measureText('Josh Allen').width))
console.log('Texas Longhorns width (20px):', (() => { ctx.font='20px Arial'; return Math.round(ctx.measureText('Texas Longhorns').width) })())
console.log('Left col usable: 610px (x=50..660)')
console.log('Right card text area: 426px (x=702..1128)')
