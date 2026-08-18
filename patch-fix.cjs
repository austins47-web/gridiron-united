const fs = require('fs')
const p = 'src/components/pickem/PickEmView.tsx'
let src = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const from = `                        <span className={clsx(
                          'font-black',
                          winPct >= 60 ? 'text-emerald-400' : winPct <= 40 ? 'text-field-400' : 'text-white'
                        )}>{winPct}%</span>`

const to = `                        <span className={clsx(
                          'font-black',
                          winPct >= 60 ? 'text-nfl' : winPct <= 40 ? 'text-field-400' : 'text-white'
                        )}>{winPct}%</span>`

if (!src.includes(from)) { console.error('NO MATCH'); process.exit(1) }
src = src.replace(from, to)
fs.writeFileSync(p, src.replace(/\n/g, '\r\n'), 'utf8')
console.log('✓ win% text patched')
