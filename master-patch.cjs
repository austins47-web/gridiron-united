// master-patch.cjs — applies all changes in sequence
// Run from project root: node master-patch.cjs

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

let totalPatches = 0
let failedPatches = []

function patch(file, label, from, to) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!src.includes(from)) {
    console.error(`  ✗ NO MATCH [${label}]`)
    failedPatches.push({ file, label })
    return false
  }
  src = src.replace(from, to)
  fs.writeFileSync(file, src.replace(/\n/g, '\r\n'), 'utf8')
  console.log(`  ✓ ${label}`)
  totalPatches++
  return true
}

function patchAll(file, label, pairs) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  let ok = true
  for (const [from, to] of pairs) {
    if (!src.includes(from)) {
      console.error(`  ✗ NO MATCH [${label}]`)
      failedPatches.push({ file, label })
      ok = false
      break
    }
    src = src.replace(from, to)
  }
  if (ok) {
    fs.writeFileSync(file, src.replace(/\n/g, '\r\n'), 'utf8')
    console.log(`  ✓ ${label}`)
    totalPatches++
  }
  return ok
}

const ROOT = 'C:\\Users\\austi\\downloads\\gridiron-united\\gridiron-united'
const SRC  = path.join(ROOT, 'src')
const SCORES   = path.join(SRC, 'components/scores/LiveScoresView.tsx')
const PROXY    = path.join(ROOT, 'supabase/functions/sportsdata/index.ts')
const TEAMPAGE = path.join(SRC, 'components/teams/TeamPage.tsx')
const PICKEM   = path.join(SRC, 'components/pickem/PickEmView.tsx')
const COMM     = path.join(SRC, 'components/commissioner/CommissionerPanel.tsx')
const LEAGUES  = path.join(SRC, 'components/leagues/LeaguesView.tsx')
const CSS      = path.join(SRC, 'index.css')

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 1. LiveScoresView — preseason weeks, HOF, CFB week 0, postseason')
// ══════════════════════════════════════════════════════════════════════════════

// 1a. Replace the week constants with structured option arrays
patch(SCORES, 'NFL/CFB week constants → option arrays',
`const NFL_WEEKS   = Array.from({ length: 18 }, (_, i) => i + 1)  // 1–18 regular season
const CFB_WEEKS   = Array.from({ length: 15 }, (_, i) => i + 1)  // 1–15`,
`// ── Week option descriptors ────────────────────────────────
type WeekOpt = { value: string; label: string; seasonType: number; week: number }

const NFL_WEEK_OPTIONS: WeekOpt[] = [
  { value: 'hof',  label: 'Hall of Fame Game', seasonType: 1, week: 0 },
  { value: 'pre1', label: 'Preseason Wk 1',    seasonType: 1, week: 1 },
  { value: 'pre2', label: 'Preseason Wk 2',    seasonType: 1, week: 2 },
  { value: 'pre3', label: 'Preseason Wk 3',    seasonType: 1, week: 3 },
  ...Array.from({ length: 18 }, (_, i) => ({
    value: String(i + 1), label: \`Week \${i + 1}\`, seasonType: 2, week: i + 1,
  })),
  { value: 'wc',   label: 'Wild Card',         seasonType: 3, week: 1 },
  { value: 'div',  label: 'Divisional',        seasonType: 3, week: 2 },
  { value: 'conf', label: 'Conference Champ.', seasonType: 3, week: 3 },
  { value: 'sb',   label: 'Super Bowl',        seasonType: 3, week: 4 },
]
const CFB_WEEK_OPTIONS: WeekOpt[] = [
  { value: '0', label: 'Week 0', seasonType: 2, week: 0 },
  ...Array.from({ length: 15 }, (_, i) => ({
    value: String(i + 1), label: \`Week \${i + 1}\`, seasonType: 2, week: i + 1,
  })),
]
function resolveNFLOpt(k: string): WeekOpt {
  return NFL_WEEK_OPTIONS.find(o => o.value === k) ?? NFL_WEEK_OPTIONS[4]
}
function resolveCFBOpt(k: string): WeekOpt {
  return CFB_WEEK_OPTIONS.find(o => o.value === k) ?? CFB_WEEK_OPTIONS[1]
}`
)

// 1b. localStorage keys (bump to v2 so old number-stored value doesn't conflict)
patch(SCORES, 'localStorage key names',
`const WEEK_KEY    = 'gu_scores_week'
const TAB_KEY     = 'gu_scores_tab'`,
`const WEEK_KEY    = 'gu_scores_week_v2'   // v2: string keys
const TAB_KEY     = 'gu_scores_tab'`
)

// 1c. State declarations — change from number to string week keys
patch(SCORES, 'week state: number → string',
`  const [nflWeek, setNflWeek] = useState<number>(() =>
    Number(localStorage.getItem(\`\${WEEK_KEY}_NFL\`)) || 1)
  const [cfbWeek, setCfbWeek] = useState<number>(() =>
    Number(localStorage.getItem(\`\${WEEK_KEY}_CFB\`)) || 1)`,
`  const [nflWeekKey, setNflWeekKey] = useState<string>(() =>
    localStorage.getItem(\`\${WEEK_KEY}_NFL\`) ?? '1')
  const [cfbWeekKey, setCfbWeekKey] = useState<string>(() =>
    localStorage.getItem(\`\${WEEK_KEY}_CFB\`) ?? '1')
  const nflOpt = resolveNFLOpt(nflWeekKey)
  const cfbOpt = resolveCFBOpt(cfbWeekKey)`
)

// 1d. localStorage persist effects
patch(SCORES, 'persist effects',
`  useEffect(() => { localStorage.setItem(\`\${WEEK_KEY}_NFL\`, String(nflWeek)) }, [nflWeek])
  useEffect(() => { localStorage.setItem(\`\${WEEK_KEY}_CFB\`, String(cfbWeek)) }, [cfbWeek])`,
`  useEffect(() => { localStorage.setItem(\`\${WEEK_KEY}_NFL\`, nflWeekKey) }, [nflWeekKey])
  useEffect(() => { localStorage.setItem(\`\${WEEK_KEY}_CFB\`, cfbWeekKey) }, [cfbWeekKey])`
)

// 1e. week/setWeek derived values
patch(SCORES, 'week/setWeek derived',
`  const week    = tab === 'NFL' ? nflWeek : cfbWeek
  const setWeek = tab === 'NFL' ? setNflWeek : setCfbWeek`,
`  const weekOpt  = tab === 'NFL' ? nflOpt : cfbOpt
  const weekKey  = tab === 'NFL' ? nflWeekKey : cfbWeekKey
  const setWeekKey = tab === 'NFL' ? setNflWeekKey : setCfbWeekKey`
)

// 1f. useQuery — update query key + fetchWeek call to pass seasonType
patch(SCORES, 'useQuery fetchWeek call',
`    queryKey: ['scores', tab, tab === 'NFL' ? NFL_SEASON : CFB_SEASON, week, refreshTick],
    queryFn: async () => {
      const result = await fetchWeek(tab, tab === 'NFL' ? NFL_SEASON : CFB_SEASON, week)`,
`    queryKey: ['scores', tab, tab === 'NFL' ? NFL_SEASON : CFB_SEASON, weekKey, refreshTick],
    queryFn: async () => {
      const result = await fetchWeek(tab, tab === 'NFL' ? NFL_SEASON : CFB_SEASON, weekOpt.week, weekOpt.seasonType)`
)

// 1g. fetchWeek function signature
patch(SCORES, 'fetchWeek signature',
`async function fetchWeek(league: LeagueTab, season: number, week: number): Promise<{ games: LiveGame[]; currentWeek: number }> {`,
`async function fetchWeek(league: LeagueTab, season: number, week: number, seasonType = 2): Promise<{ games: LiveGame[]; currentWeek: number }> {`
)

// 1h. fetchWeek proxy URL — add seasontype param
patch(SCORES, 'fetchWeek proxy URL',
`  const endpoint = league === 'NFL'
    ? \`nfl/scores/\${season}/\${week}\`
    : \`cfb/scores/\${season}/\${week}\`
  const res = await fetch(\`\${BASE}?endpoint=\${encodeURIComponent(endpoint)}\`, {`,
`  const endpoint = league === 'NFL'
    ? \`nfl/scores/\${season}/\${week}\`
    : \`cfb/scores/\${season}/\${week}\`
  const res = await fetch(\`\${BASE}?endpoint=\${encodeURIComponent(endpoint)}&seasontype=\${seasonType}\`, {`
)

// 1i. weeks variable no longer used — replace its usage in the "All NFL Games · Week N" label
patch(SCORES, 'All NFL Games week label',
`              All {tab} Games · Week {week}`,
`              All {tab} Games · {weekOpt.label}`
)

// 1j. Week picker <select> — replace flat list with grouped <optgroup> for NFL, flat for CFB
patch(SCORES, 'NFL/CFB week picker select',
`        <div className="flex items-center gap-2 bg-field-800 border border-field-700 rounded-lg px-3 py-1.5">
          <span className="text-xs text-field-400 font-bold uppercase tracking-wider shrink-0">Week</span>
          <select
            value={week}
            onChange={e => setWeek(Number(e.target.value))}
            className="bg-transparent text-white text-sm font-bold cursor-pointer outline-none"
          >
            {weeks.map(w => (
              <option key={w} value={w} className="bg-field-800 text-white">Week {w}</option>
            ))}
          </select>
        </div>`,
`        <div className="flex items-center gap-2 bg-field-800 border border-field-700 rounded-lg px-3 py-1.5">
          <span className="text-xs text-field-400 font-bold uppercase tracking-wider shrink-0">
            {tab === 'NFL' ? 'NFL' : 'CFB'}
          </span>
          <select
            value={weekKey}
            onChange={e => setWeekKey(e.target.value)}
            className="bg-transparent text-white text-sm font-bold cursor-pointer outline-none"
          >
            {tab === 'NFL' ? (
              <>
                <optgroup label="── PRESEASON ──" style={{ background: '#161b27', color: '#e8a020' }}>
                  {NFL_WEEK_OPTIONS.filter(o => o.seasonType === 1).map(o => (
                    <option key={o.value} value={o.value} style={{ background: '#161b27' }}>{o.label}</option>
                  ))}
                </optgroup>
                <optgroup label="── REGULAR SEASON ──" style={{ background: '#161b27', color: '#8a9ab8' }}>
                  {NFL_WEEK_OPTIONS.filter(o => o.seasonType === 2).map(o => (
                    <option key={o.value} value={o.value} style={{ background: '#161b27' }}>{o.label}</option>
                  ))}
                </optgroup>
                <optgroup label="── POSTSEASON ──" style={{ background: '#161b27', color: '#F5A623' }}>
                  {NFL_WEEK_OPTIONS.filter(o => o.seasonType === 3).map(o => (
                    <option key={o.value} value={o.value} style={{ background: '#161b27' }}>{o.label}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              CFB_WEEK_OPTIONS.map(o => (
                <option key={o.value} value={o.value} style={{ background: '#161b27' }}>{o.label}</option>
              ))
            )}
          </select>
        </div>`
)

// 1k. Remove the now-unused `weeks` variable declaration
patch(SCORES, 'remove weeks variable',
`  const weeks = tab === 'NFL' ? NFL_WEEKS : CFB_WEEKS\n\n`,
``
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 2. Supabase proxy — forward seasontype param to ESPN')
// ══════════════════════════════════════════════════════════════════════════════

patch(PROXY, 'NFL scores endpoint seasontype',
`    } else if (endpoint.startsWith('nfl/scores/')) {
      // nfl/scores/{season}/{week} — e.g. nfl/scores/2026/1
      const [,, season, week] = endpoint.split('/')
      // seasontype=1 preseason, 2=regular, 3=postseason
      data = await espnFetch(\`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=\${season}&seasontype=2&week=\${week}\`)`,
`    } else if (endpoint.startsWith('nfl/scores/')) {
      const [,, season, week] = endpoint.split('/')
      const seasontype = url.searchParams.get('seasontype') ?? '2'
      data = await espnFetch(\`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=\${season}&seasontype=\${seasontype}&week=\${week}\`)`
)

patch(PROXY, 'CFB scores endpoint seasontype',
`    } else if (endpoint.startsWith('cfb/scores/')) {
      const [,, season, week] = endpoint.split('/')
      data = await espnFetch(\`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50&week=\${week}&season=\${season}\`)`,
`    } else if (endpoint.startsWith('cfb/scores/')) {
      const [,, season, week] = endpoint.split('/')
      const seasontype = url.searchParams.get('seasontype') ?? '2'
      data = await espnFetch(\`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50&week=\${week}&season=\${season}&seasontype=\${seasontype}\`)`
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 3. TeamPage — show preseason + W0 games in Schedule tab')
// ══════════════════════════════════════════════════════════════════════════════

// 3a. Schedule query — fetch preseason + regular for NFL, W0 + regular for CFB
patch(TEAMPAGE, 'schedule query — merge preseason',
`  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['team-schedule', league, teamId, SEASON],
    queryFn: () => proxyFetch(\`\${league.toLowerCase()}/teams/\${teamId}/schedule\`, {
      season: String(SEASON), seasontype: '2',
    }),
    staleTime: 5 * 60_000,
    enabled: tab === 'schedule' || tab === 'overview',
  })`,
`  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['team-schedule', league, teamId, SEASON],
    queryFn: async () => {
      if (league === 'NFL') {
        // Merge preseason (type 1) + regular season (type 2)
        const [preJson, regJson] = await Promise.all([
          proxyFetch(\`nfl/teams/\${teamId}/schedule\`, { season: String(SEASON), seasontype: '1' }),
          proxyFetch(\`nfl/teams/\${teamId}/schedule\`, { season: String(SEASON), seasontype: '2' }),
        ])
        const preEvents = (preJson?.events ?? []).map((e: any) => ({ ...e, _seasonType: 1 }))
        const regEvents = (regJson?.events ?? []).map((e: any) => ({ ...e, _seasonType: 2 }))
        const merged = [...preEvents, ...regEvents].sort(
          (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        return { ...regJson, events: merged }
      }
      // CFB: W0 + regular (deduplicated)
      const [w0Json, regJson] = await Promise.all([
        proxyFetch(\`cfb/teams/\${teamId}/schedule\`, { season: String(SEASON), seasontype: '2', week: '0' }).catch(() => ({ events: [] })),
        proxyFetch(\`cfb/teams/\${teamId}/schedule\`, { season: String(SEASON), seasontype: '2' }),
      ])
      const seen = new Set<string>()
      const merged = [
        ...(w0Json?.events ?? []).map((e: any) => ({ ...e, _week0: true })),
        ...(regJson?.events ?? []),
      ]
        .filter((e: any) => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      return { ...regJson, events: merged }
    },
    staleTime: 5 * 60_000,
    enabled: tab === 'schedule' || tab === 'overview',
  })`
)

// 3b. Schedule tab — replace "Wk N" week label with smart PRE/HOF/W0 badge
patch(TEAMPAGE, 'schedule week label',
`                  {/* Week */}
                  <span className="text-xs text-field-500 w-10 shrink-0 text-center">Wk {g.week}</span>`,
`                  {/* Week */}
                  <span className={clsx(
                    'text-xs font-bold w-12 shrink-0 text-center',
                    (g as any)._seasonType === 1 ? 'text-amber-400'
                    : (g as any)._week0 ? 'text-sky-400'
                    : 'text-field-500'
                  )}>
                    {(g as any)._seasonType === 1
                      ? (g.week === 0 ? 'HOF' : \`PRE\${g.week}\`)
                      : (g as any)._week0
                      ? 'W0'
                      : \`Wk \${g.week}\`}
                  </span>`
)

// 3c. Also update schedule header label
patch(TEAMPAGE, 'schedule header label',
`              <span className="text-xs text-field-400 font-bold uppercase tracking-wider">{SEASON} Regular Season</span>`,
`              <span className="text-xs text-field-400 font-bold uppercase tracking-wider">{SEASON} Season Schedule</span>`
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 4. PickEmView — postseason weeks + fix green color chips')
// ══════════════════════════════════════════════════════════════════════════════

// 4a. Add postseason WEEK_END_DATES entries
patch(PICKEM, 'add postseason WEEK_END_DATES',
`  18: '2027-01-11T03:00:00Z',
}`,
`  18: '2027-01-11T03:00:00Z',
  // ── Postseason ──
  19: '2027-01-19T05:00:00Z',  // Wild Card weekend end
  20: '2027-01-26T05:00:00Z',  // Divisional weekend end
  21: '2027-02-02T05:00:00Z',  // Conference Championships end
  22: '2027-02-09T05:00:00Z',  // Super Bowl end
}`
)

// 4b. getActiveWeek — extend to 22
patch(PICKEM, 'getActiveWeek max 22',
`  for (let w = 1; w <= 18; w++) {
    const end = new Date(WEEK_END_DATES[w])
    if (now < end) return w
  }
  return 18`,
`  for (let w = 1; w <= 22; w++) {
    const end = WEEK_END_DATES[w] ? new Date(WEEK_END_DATES[w]) : null
    if (end && now < end) return w
  }
  return 22`
)

// 4c. Week dropdown — add postseason section with labels
patch(PICKEM, 'week dropdown — add postseason section',
`              <div className="max-h-64 overflow-y-auto">
                {Array.from({ length: 18 }, (_, i) => i + 1).map(w => {
                  const isOver = new Date() >= new Date(WEEK_END_DATES[w])
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w
                          ? 'bg-gold/10 text-gold'
                          : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">Week {w}</span>
                      <span className={clsx('text-xs font-bold uppercase tracking-wider', 
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-emerald-400'
                      )}>
                        {isCurrent ? 'Current' : isOver ? 'Complete' : 'Upcoming'}
                      </span>
                    </button>
                  )
                })}
              </div>`,
`              <div className="max-h-72 overflow-y-auto">
                {/* Regular season weeks */}
                <div className="px-3 py-1 border-b border-field-700">
                  <span className="text-field-500 text-[10px] font-bold uppercase tracking-wider">Regular Season</span>
                </div>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(w => {
                  const endDate = WEEK_END_DATES[w]
                  const isOver = endDate ? new Date() >= new Date(endDate) : false
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w ? 'bg-gold/10 text-gold' : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">Week {w}</span>
                      <span className={clsx('text-xs font-bold uppercase tracking-wider',
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-field-300'
                      )}>
                        {isCurrent ? 'Current' : isOver ? 'Complete' : 'Upcoming'}
                      </span>
                    </button>
                  )
                })}
                {/* Postseason weeks */}
                <div className="px-3 py-1 border-t border-b border-field-700 mt-1">
                  <span className="text-gold text-[10px] font-bold uppercase tracking-wider">Postseason</span>
                </div>
                {[
                  { w: 19, label: 'Wild Card' },
                  { w: 20, label: 'Divisional' },
                  { w: 21, label: 'Conference Champ.' },
                  { w: 22, label: 'Super Bowl' },
                ].map(({ w, label }) => {
                  const endDate = WEEK_END_DATES[w]
                  const isOver = endDate ? new Date() >= new Date(endDate) : false
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w ? 'bg-gold/10 text-gold' : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">{label}</span>
                      <span className={clsx('text-xs font-bold uppercase tracking-wider',
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-field-300'
                      )}>
                        {isCurrent ? 'Current' : isOver ? 'Complete' : 'Upcoming'}
                      </span>
                    </button>
                  )
                })}
              </div>`
)

// 4d. Fix the week label shown in the dropdown button — show friendly name for postseason
patch(PICKEM, 'week button label — show postseason name',
`            <span className="font-cond font-black text-white text-base uppercase tracking-wider">
              Week {week}
            </span>`,
`            <span className="font-cond font-black text-white text-base uppercase tracking-wider">
              {week === 19 ? 'Wild Card'
               : week === 20 ? 'Divisional'
               : week === 21 ? 'Conf. Champ.'
               : week === 22 ? 'Super Bowl'
               : \`Week \${week}\`}
            </span>`
)

// 4e. Fix green color chips — "picked all" success state uses emerald, replace with gold scheme
patch(PICKEM, 'picked count badge: emerald → gold',
`              pickedCount === totalGames
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-field-800 border-field-700 text-field-300'`,
`              pickedCount === totalGames
                ? 'bg-gold/10 border-gold/30 text-gold'
                : 'bg-field-800 border-field-700 text-field-300'`
)

// 4f. GamePickCard — "Final" status: emerald → field scheme
patch(PICKEM, 'GamePickCard Final badge',
`        {isFinal && <span className="text-xs text-emerald-400 font-bold">Final</span>}`,
`        {isFinal && <span className="text-xs text-field-300 font-bold">Final</span>}`
)

// 4g. GamePickCard win% bar: emerald → gold when high
patch(PICKEM, 'GamePickCard win% bar color',
`                          className={clsx(
                            'h-full rounded-full transition-all',
                            winPct >= 60 ? 'bg-emerald-500' : winPct <= 40 ? 'bg-field-500' : 'bg-gold'
                          )}`,
`                          className={clsx(
                            'h-full rounded-full transition-all',
                            winPct >= 60 ? 'bg-nfl' : winPct <= 40 ? 'bg-field-500' : 'bg-gold'
                          )}`
)

// 4h. GamePickCard win% text: emerald → white
patch(PICKEM, 'GamePickCard win% text',
`                      <span className={clsx(
                            'font-black',
                            winPct >= 60 ? 'text-emerald-400' : winPct <= 40 ? 'text-field-400' : 'text-white'
                          )}>`,
`                      <span className={clsx(
                            'font-black',
                            winPct >= 60 ? 'text-nfl' : winPct <= 40 ? 'text-field-400' : 'text-white'
                          )}>`
)

// 4i. PicksChart: isWinner correct pick badge — emerald → gold
patch(PICKEM, 'PicksChart correct pick badge',
`              {isPicked && isFinal && isWinner && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
              )}`,
`              {isPicked && isFinal && isWinner && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-gold" />
                </div>
              )}`
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 5. CommissionerPanel — pickem-only mode + PickDeadlineSettings')
// ══════════════════════════════════════════════════════════════════════════════

// 5a. Import the new PickDeadlineSettings component
patch(COMM, 'import PickDeadlineSettings',
`import { CfbPostseasonManager } from './CfbPostseasonManager'`,
`import { CfbPostseasonManager } from './CfbPostseasonManager'
import { PickDeadlineSettings } from './PickDeadlineSettings'`
)

// 5b. Add Clock import to lucide
patch(COMM, 'add Clock to lucide imports',
`  Shield, Users, Zap, TrendingUp, Trash2, Plus, Search,
  Save, RotateCcw, AlertCircle, ChevronDown, ChevronUp,
  Edit3, Check, X, Crown, ArrowLeftRight`,
`  Shield, Users, Zap, TrendingUp, Trash2, Plus, Search,
  Save, RotateCcw, AlertCircle, ChevronDown, ChevronUp,
  Edit3, Check, X, Crown, ArrowLeftRight, Clock`
)

// 5c. CommissionerPanel — detect pickem league and show only relevant tabs
patch(COMM, 'CommissionerPanel tabs — pickem guard',
`  const isCommissioner = myMembership?.is_commissioner

  if (!activeLeagueId) {`,
`  const isCommissioner = myMembership?.is_commissioner
  const isPickem = activeLeague?.league_type === 'pickem'

  if (!activeLeagueId) {`
)

// 5d. TABS array — filter for pickem
patch(COMM, 'TABS array — pickem filter',
`  const TABS: { id: CommTab; label: string; icon: React.ReactNode }[] = [
    { id: 'scoring', label: 'Scoring', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'rosters', label: 'Rosters', icon: <Users className="w-4 h-4" /> },
    { id: 'players', label: 'Player Scores', icon: <Zap className="w-4 h-4" /> },
    { id: 'members', label: 'Members', icon: <Crown className="w-4 h-4" /> },
    { id: 'league', label: 'League', icon: <Shield className="w-4 h-4" /> },
    { id: 'cfb_postseason', label: 'CFB Playoffs', icon: <span className="text-sm">🎓</span> },
    { id: 'trades', label: 'Trades', icon: <span className="text-sm">🔄</span> },
  ]`,
`  const TABS: { id: CommTab; label: string; icon: React.ReactNode }[] = isPickem
    ? [
        { id: 'league',  label: 'League',   icon: <Shield className="w-4 h-4" /> },
        { id: 'members', label: 'Members',  icon: <Crown className="w-4 h-4" /> },
        { id: 'scoring', label: 'Pick Deadline', icon: <Clock className="w-4 h-4" /> },
      ]
    : [
        { id: 'scoring', label: 'Scoring', icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'rosters', label: 'Rosters', icon: <Users className="w-4 h-4" /> },
        { id: 'players', label: 'Player Scores', icon: <Zap className="w-4 h-4" /> },
        { id: 'members', label: 'Members', icon: <Crown className="w-4 h-4" /> },
        { id: 'league', label: 'League', icon: <Shield className="w-4 h-4" /> },
        { id: 'cfb_postseason', label: 'CFB Playoffs', icon: <span className="text-sm">🎓</span> },
        { id: 'trades', label: 'Trades', icon: <span className="text-sm">🔄</span> },
      ]`
)

// 5e. Tab content — render PickDeadlineSettings for 'scoring' tab when isPickem
patch(COMM, 'Tab content — pickem scoring → PickDeadlineSettings',
`      {tab === 'scoring' && <ScoringEditor league={activeLeague!} onSaved={setActiveLeague} />}`,
`      {tab === 'scoring' && (isPickem
        ? <PickDeadlineSettings
            leagueId={activeLeagueId!}
            initialLockType={(activeLeague as any)?.pick_lock_type ?? 'kickoff'}
            initialDeadlineDay={(activeLeague as any)?.pick_deadline_day ?? 3}
            initialDeadlineTime={(activeLeague as any)?.pick_deadline_time ?? '18:00'}
          />
        : <ScoringEditor league={activeLeague!} onSaved={setActiveLeague} />
      )}`
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 6. LeaguesView — fix pickem league description label')
// ══════════════════════════════════════════════════════════════════════════════

// 6a. LeagueCard meta row — show "Pick'Em" instead of scoring_type for pickem leagues
patch(LEAGUES, 'LeagueCard pickem label',
`            <div className="text-xs text-field-400 flex gap-3 mt-0.5">
              <span className="capitalize">{league.scoring_type}</span>
              <span className="capitalize">{league.draft_type} draft</span>
              <span className="capitalize">{league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase()}</span>
              <span className="capitalize">{league.draft_status}</span>
            </div>`,
`            <div className="text-xs text-field-400 flex gap-3 mt-0.5">
              {league.league_type === 'pickem'
                ? <span className="text-gold font-bold">Pick'Em</span>
                : <>
                    <span className="capitalize">{league.scoring_type}</span>
                    <span className="capitalize">{league.draft_type} draft</span>
                    <span className="capitalize">{league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase()}</span>
                  </>
              }
              <span className="capitalize">{league.draft_status}</span>
            </div>`
)

// 6b. LeagueInfoPanel Format row — show "Pick'Em" for pickem
patch(LEAGUES, 'LeagueInfoPanel Format value',
`          ['Format', league.scoring_type?.toUpperCase()],`,
`          ['Format', league.league_type === 'pickem' ? "Pick'Em" : league.scoring_type?.toUpperCase()],`
)

// 6c. LeagueInfoPanel Pool row — hide for pickem
patch(LEAGUES, 'LeagueInfoPanel Pool hide for pickem',
`          ['Pool', league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase() ?? 'Both'],`,
`          ...(league.league_type !== 'pickem' ? [['Pool', league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase() ?? 'Both'] as [string, string]] : []),`
)

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 7. index.css — color audit fixes')
// ══════════════════════════════════════════════════════════════════════════════

// 7a. Status badges — questionable should use gold/amber not yellow, active uses field not emerald
patch(CSS, 'status-active: emerald → nfl/field',
`  .status-active      { @apply bg-emerald-500/20 text-emerald-400; }
  .status-questionable { @apply bg-yellow-500/20 text-yellow-400; }`,
`  .status-active      { @apply bg-nfl/20 text-nfl; }
  .status-questionable { @apply bg-gold/20 text-gold; }`
)

// 7b. pos-QB: amber → gold (gold IS the correct scheme)
patch(CSS, 'pos-QB: amber → gold',
`  .pos-QB   { @apply bg-amber-500/20 text-amber-400; }`,
`  .pos-QB   { @apply bg-gold/20 text-gold; }`
)

// 7c. pos-RB: emerald → custom green that still reads well
patch(CSS, 'pos-RB: emerald → teal-ish',
`  .pos-RB   { @apply bg-emerald-500/20 text-emerald-400; }`,
`  .pos-RB   { @apply bg-teal-500/20 text-teal-400; }`
)

// 7d. pos-TE: orange stays (fine — part of position color system)
// pos-K: purple stays (fine — distinct from accent colors)
// pos-DST: rose stays (fine)

// 7e. trade-chat-card — remove green, use field-700 scheme in dark mode
patch(CSS, 'trade-chat-card dark mode: green → field',
`  .trade-chat-card {
    background-color: rgba(6, 78, 59, 0.25);
    border-color: rgba(16, 185, 129, 0.35);
  }
  .trade-chat-header {
    background-color: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.25);
  }
  .trade-chat-title  { color: #6ee7b7; }
  .trade-chat-time   { color: #34d399; }
  .trade-chat-label  { color: #6ee7b7; }
  .trade-chat-player { color: #f3f4f6; }
  .trade-chat-empty  { color: #6b7280; }
  .trade-chat-divider { border-color: rgba(16, 185, 129, 0.2); }`,
`  .trade-chat-card {
    background-color: rgba(22, 27, 39, 0.9);
    border-color: rgba(39, 48, 68, 0.8);
  }
  .trade-chat-header {
    background-color: rgba(30, 37, 53, 0.8);
    border-color: rgba(39, 48, 68, 0.6);
  }
  .trade-chat-title  { color: #F5A623; }
  .trade-chat-time   { color: #8a9ab8; }
  .trade-chat-label  { color: #F5A623; }
  .trade-chat-player { color: #f3f4f6; }
  .trade-chat-empty  { color: #5a6a8a; }
  .trade-chat-divider { border-color: rgba(39, 48, 68, 0.5); }`
)

// 7f. live-dot: emerald → red (live indicator should be red, not green)
patch(CSS, 'live-dot: emerald → red',
`  .live-dot {
    @apply w-2 h-2 rounded-full bg-emerald-400 animate-pulse;
  }`,
`  .live-dot {
    @apply w-2 h-2 rounded-full bg-red-400 animate-pulse;
  }`
)

// 7g. ScoringEditor score value: green-400 → nfl (blue, matches scheme)
// This is in CommissionerPanel.tsx not CSS
patch(COMM, 'scoring editor positive value: green → nfl',
`                      {scores[row.key] > 0 ? \`+\${scores[row.key]}\` : scores[row.key]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}`,
`                      {scores[row.key] > 0 ? \`+\${scores[row.key]}\` : scores[row.key]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}`,
// NOTE: the actual green-400 is inside className conditional — patch separately below
)

patch(COMM, 'scoring editor green-400 → nfl-blue',
`scores[row.key] > 0 ? 'text-green-400' : scores[row.key] < 0 ? 'text-red-400' : 'text-field-500'`,
`scores[row.key] > 0 ? 'text-nfl' : scores[row.key] < 0 ? 'text-red-400' : 'text-field-500'`
)

// 7h. PlayerScoreEditor sync result: emerald → nfl
patch(COMM, 'sync result emerald → nfl',
`              <p className="text-emerald-400 text-xs mt-1 font-bold">
                ✓ Last sync: {syncResult.players} total players ({syncResult.withProjections} NFL with projections)
              </p>`,
`              <p className="text-nfl text-xs mt-1 font-bold">
                ✓ Last sync: {syncResult.players} total players ({syncResult.withProjections} NFL with projections)
              </p>`
)

// 7i. TeamPage schedule — result W/L: emerald → gold for W
patch(TEAMPAGE, 'schedule result W: emerald → gold',
`                      <span className={clsx('text-xs font-black mr-1.5',
                        g.result === 'W' ? 'text-emerald-400' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>`,
`                      <span className={clsx('text-xs font-black mr-1.5',
                        g.result === 'W' ? 'text-gold' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>`
)

// 7j. TeamPage overview results W: emerald → gold
patch(TEAMPAGE, 'overview results W: emerald → gold',
`                      <span className={clsx('w-6 text-center text-xs font-black',
                        g.result === 'W' ? 'text-emerald-400' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>`,
`                      <span className={clsx('w-6 text-center text-xs font-black',
                        g.result === 'W' ? 'text-gold' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>`
)

// 7k. StatusBadge in LiveScoresView: Final uses emerald → field-300
patch(SCORES, 'StatusBadge Final: emerald → field-300',
`    return <span className={clsx('font-bold text-emerald-400', compact ? 'text-[10px]' : 'text-xs')}>Final</span>`,
`    return <span className={clsx('font-bold text-field-300', compact ? 'text-[10px]' : 'text-xs')}>Final</span>`
)

// 7l. PicksChart weekly scoreboard bg: trade-chat green → field-800 
// (already handled by trade-chat-card fix above, but check PicksChart directly)
// PicksChart has a bg-gold/[0.05] highlight for current user which is fine

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 8. Write PickDeadlineSettings component')
// ══════════════════════════════════════════════════════════════════════════════

const PICKSETTINGS_CONTENT = `import { useState } from 'react'
import { Clock, AlarmClock, Lock, CheckCircle2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'

interface Props {
  leagueId: string
  initialLockType: 'deadline' | 'kickoff'
  initialDeadlineDay: number   // 0=Sun … 6=Sat
  initialDeadlineTime: string  // 'HH:MM' 24h
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export function PickDeadlineSettings({ leagueId, initialLockType, initialDeadlineDay, initialDeadlineTime }: Props) {
  const [lockType,     setLockType]     = useState<'deadline'|'kickoff'>(initialLockType)
  const [deadlineDay,  setDeadlineDay]  = useState(initialDeadlineDay)
  const [deadlineTime, setDeadlineTime] = useState(initialDeadlineTime)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<'idle'|'saved'|'error'>('idle')

  const dirty = lockType !== initialLockType || deadlineDay !== initialDeadlineDay || deadlineTime !== initialDeadlineTime

  async function save() {
    setSaving(true); setStatus('idle')
    const { error } = await supabase.from('leagues').update({
      pick_lock_type:    lockType,
      pick_deadline_day:  lockType === 'deadline' ? deadlineDay  : null,
      pick_deadline_time: lockType === 'deadline' ? deadlineTime : null,
    }).eq('id', leagueId)
    setSaving(false)
    setStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setStatus('idle'), 3000)
  }

  function fmt(t: string) {
    const [h, m] = t.split(':').map(Number)
    return \`\${h % 12 || 12}:\${String(m).padStart(2,'0')} \${h >= 12 ? 'PM' : 'AM'}\`
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-cond font-bold text-white tracking-wide text-base mb-1">Pick Deadline</h3>
        <p className="text-field-400 text-sm">Control when picks lock each week.</p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { val: 'deadline' as const, icon: Clock,       title: 'Weekly Deadline',  desc: 'All picks lock at the same time every week' },
          { val: 'kickoff'  as const, icon: AlarmClock,  title: 'Lock at Kickoff',  desc: 'Each game locks individually at its kickoff' },
        ].map(({ val, icon: Icon, title, desc }) => (
          <button key={val} onClick={() => setLockType(val)}
            className={clsx(
              'flex items-start gap-3 p-4 rounded-xl border text-left transition-all',
              lockType === val ? 'border-gold bg-gold/10' : 'border-field-600 bg-field-800 hover:border-field-400',
            )}>
            <Icon size={20} className={lockType === val ? 'text-gold shrink-0 mt-0.5' : 'text-field-400 shrink-0 mt-0.5'} />
            <div>
              <p className={clsx('text-sm font-bold', lockType === val ? 'text-gold' : 'text-white')}>{title}</p>
              <p className="text-xs text-field-400 mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Deadline config */}
      {lockType === 'deadline' && (
        <div className="bg-field-800 border border-field-600 rounded-xl p-4 space-y-4">
          <p className="text-xs text-field-400 uppercase tracking-wider font-bold">Deadline Settings</p>

          {/* Day picker */}
          <div className="space-y-1.5">
            <label className="text-sm text-field-300">Day of week</label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => (
                <button key={i} onClick={() => setDeadlineDay(i)}
                  className={clsx('py-2 rounded-lg text-xs font-bold transition-all',
                    deadlineDay === i ? 'bg-gold text-field-950' : 'bg-field-700 text-field-300 hover:bg-field-600'
                  )}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
          </div>

          {/* Time picker */}
          <div className="space-y-1.5">
            <label className="text-sm text-field-300">Time</label>
            <div className="flex items-center gap-3">
              <input type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)}
                className="bg-field-700 border border-field-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors" />
              <span className="text-sm text-field-400">{DAYS[deadlineDay]}s at {fmt(deadlineTime)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-field-700 rounded-lg px-3 py-2">
            <Lock size={14} className="text-gold shrink-0" />
            <p className="text-xs text-field-300">
              Picks lock every <span className="text-white font-bold">{DAYS[deadlineDay]}</span> at <span className="text-white font-bold">{fmt(deadlineTime)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Kickoff info */}
      {lockType === 'kickoff' && (
        <div className="bg-field-800 border border-field-600 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlarmClock size={15} className="text-gold" />
            <p className="text-sm font-bold text-white">How kickoff locking works</p>
          </div>
          <ul className="space-y-1.5 text-sm text-field-400">
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Each game locks <span className="text-white mx-1">5 minutes before kickoff</span></li>
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Members can still pick unlocked games after early games start</li>
            <li className="flex items-start gap-2"><span className="text-gold mt-0.5">•</span>Kickoff times sync automatically from the ESPN schedule</li>
          </ul>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || saving}
          className={clsx('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all',
            dirty && !saving ? 'bg-gold text-field-950 hover:bg-gold/90' : 'bg-field-700 text-field-500 cursor-not-allowed'
          )}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {status === 'saved' && (
          <div className="flex items-center gap-1.5 text-sm text-nfl"><CheckCircle2 size={15} />Saved</div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-1.5 text-sm text-red-400"><AlertCircle size={15} />Failed — try again</div>
        )}
      </div>
    </div>
  )
}
`

const PICKSETTINGS_PATH = path.join(SRC, 'components/commissioner/PickDeadlineSettings.tsx')
if (!fs.existsSync(PICKSETTINGS_PATH)) {
  fs.writeFileSync(PICKSETTINGS_PATH, PICKSETTINGS_CONTENT.replace(/\n/g, '\r\n'), 'utf8')
  console.log('  ✓ PickDeadlineSettings.tsx created')
  totalPatches++
} else {
  fs.writeFileSync(PICKSETTINGS_PATH, PICKSETTINGS_CONTENT.replace(/\n/g, '\r\n'), 'utf8')
  console.log('  ✓ PickDeadlineSettings.tsx updated')
  totalPatches++
}

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n■ 9. Build check')
// ══════════════════════════════════════════════════════════════════════════════

if (failedPatches.length > 0) {
  console.error('\n✗ Some patches failed — fix above before building:')
  failedPatches.forEach(p => console.error(`  ${p.file} → ${p.label}`))
  process.exit(1)
}

console.log(`\n✓ All ${totalPatches} patches applied. Building...\n`)
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
  console.log('\n✓ Build passed. Run deploy:')
  console.log('  npx vercel --prod --yes')
} catch (e) {
  console.error('\n✗ Build failed — see errors above')
  process.exit(1)
}
