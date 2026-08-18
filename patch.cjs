const fs = require('fs')
const dest = 'src/components/scores/LiveScoresView.tsx'

// Read and normalize to LF for matching
let src = fs.readFileSync(dest, 'utf8').replace(/\r\n/g, '\n')

if (src.includes('onTeamClick')) {
  console.error('Already patched — aborting'); process.exit(1)
}

function patch(from, to, label) {
  if (!src.includes(from)) { console.error('NO MATCH:', label); process.exit(1) }
  src = src.replace(from, to)
  console.log('✓', label)
}

patch(
  "import { GameDetailModal } from './GameDetailModal'",
  "import { GameDetailModal } from './GameDetailModal'\nimport { TeamPage } from '@/components/teams/TeamPage'\nimport { getTeamId } from '@/components/teams/teamIds'",
  'imports'
)

patch(
  "interface GameTeam {\n  abbr: string\n  name: string\n  score: string",
  "interface GameTeam {\n  abbr: string\n  name: string\n  id?: string\n  score: string",
  'GameTeam.id'
)

patch(
  "      abbr: c.team?.abbreviation ?? '??',\n      name: c.team?.shortDisplayName ?? c.team?.displayName ?? '??',\n      score: c.score ?? '0',",
  "      abbr: c.team?.abbreviation ?? '??',\n      name: c.team?.shortDisplayName ?? c.team?.displayName ?? '??',\n      id: c.team?.id,\n      score: c.score ?? '0',",
  'mapTeam id'
)

patch(
  "function GridCard({ game, favTeams, onToggleFav, odds, onSelect }: {\n  game: LiveGame\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  odds?: GameOdds | null\n  onSelect: (game: LiveGame) => void\n})",
  "function GridCard({ game, favTeams, onToggleFav, odds, onSelect, onTeamClick }: {\n  game: LiveGame\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  odds?: GameOdds | null\n  onSelect: (game: LiveGame) => void\n  onTeamClick: (team: GameTeam, league: 'NFL' | 'CFB') => void\n})",
  'GridCard props'
)

patch(
  "            <span className={clsx(\n              'font-cond font-bold text-sm flex-1 truncate',\n              isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n            )}>\n              {team.abbr}\n              <span className=\"text-field-300 font-normal text-xs ml-1 hidden sm:inline\">\n                {team.name !== team.abbr ? team.name : ''}\n              </span>\n            </span>",
  "            <button\n              className={clsx(\n                'font-cond font-bold text-sm flex-1 truncate text-left hover:text-gold transition-colors',\n                isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n              )}\n              onClick={e => { e.stopPropagation(); onTeamClick(team, game.league) }}\n            >\n              {team.abbr}\n              <span className=\"text-field-300 font-normal text-xs ml-1 hidden sm:inline\">\n                {team.name !== team.abbr ? team.name : ''}\n              </span>\n            </button>",
  'GridCard team button'
)

patch(
  "function ListRow({ game, favTeams, onToggleFav, odds, onSelect }: {\n  game: LiveGame\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  odds?: GameOdds | null\n  onSelect: (game: LiveGame) => void\n})",
  "function ListRow({ game, favTeams, onToggleFav, odds, onSelect, onTeamClick }: {\n  game: LiveGame\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  odds?: GameOdds | null\n  onSelect: (game: LiveGame) => void\n  onTeamClick: (team: GameTeam, league: 'NFL' | 'CFB') => void\n})",
  'ListRow props'
)

patch(
  "        <span className={clsx('font-cond font-black text-base shrink-0 w-10',\n          isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n        )}>{team.abbr}</span>\n        <span className=\"text-field-300 text-sm truncate\">{team.name !== team.abbr ? team.name : ''}</span>",
  "        <button\n          className={clsx('font-cond font-black text-base shrink-0 w-10 text-left hover:text-gold transition-colors',\n            isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n          )}\n          onClick={e => { e.stopPropagation(); onTeamClick(team, game.league) }}\n        >{team.abbr}</button>\n        <button\n          className=\"text-field-300 text-sm truncate text-left hover:text-gold transition-colors\"\n          onClick={e => { e.stopPropagation(); onTeamClick(team, game.league) }}\n        >{team.name !== team.abbr ? team.name : ''}</button>",
  'ListRow normal abbr'
)

patch(
  "          <span className={clsx('font-cond font-black text-base shrink-0 w-10 text-right',\n            isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n          )}>{team.abbr}</span>\n          <span className=\"text-field-300 text-sm truncate text-right\">{team.name !== team.abbr ? team.name : ''}</span>",
  "          <button\n            className={clsx('font-cond font-black text-base shrink-0 w-10 text-right hover:text-gold transition-colors',\n              isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',\n            )}\n            onClick={e => { e.stopPropagation(); onTeamClick(team, game.league) }}\n          >{team.abbr}</button>\n          <button\n            className=\"text-field-300 text-sm truncate text-right hover:text-gold transition-colors\"\n            onClick={e => { e.stopPropagation(); onTeamClick(team, game.league) }}\n          >{team.name !== team.abbr ? team.name : ''}</button>",
  'ListRow reverse abbr'
)

patch(
  "function GameGroup({ games, viewMode, cols, favTeams, onToggleFav, oddsMap, onSelect }: {\n  games: LiveGame[]\n  viewMode: ViewMode\n  cols: ColCount\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  oddsMap?: Map<string, GameOdds>\n  onSelect: (game: LiveGame) => void\n})",
  "function GameGroup({ games, viewMode, cols, favTeams, onToggleFav, oddsMap, onSelect, onTeamClick }: {\n  games: LiveGame[]\n  viewMode: ViewMode\n  cols: ColCount\n  favTeams: Set<string>\n  onToggleFav: (abbr: string) => void\n  oddsMap?: Map<string, GameOdds>\n  onSelect: (game: LiveGame) => void\n  onTeamClick: (team: GameTeam, league: 'NFL' | 'CFB') => void\n})",
  'GameGroup props'
)

patch(
  "      {games.map(g => <ListRow key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} onSelect={onSelect} />)}",
  "      {games.map(g => <ListRow key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} onSelect={onSelect} onTeamClick={onTeamClick} />)}",
  'GameGroup ListRow thread'
)

patch(
  "      {games.map(g => <GridCard key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} onSelect={onSelect} />)}",
  "      {games.map(g => <GridCard key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} onSelect={onSelect} onTeamClick={onTeamClick} />)}",
  'GameGroup GridCard thread'
)

patch(
  "  const [selectedGame, setSelectedGame] = useState<LiveGame | null>(null)",
  "  const [selectedGame, setSelectedGame] = useState<LiveGame | null>(null)\n  const [teamPage, setTeamPage] = useState<{ id: string; league: 'NFL' | 'CFB' } | null>(null)\n\n  const handleTeamClick = (team: GameTeam, league: 'NFL' | 'CFB') => {\n    const tid = team.id ?? getTeamId(team.name, league) ?? getTeamId(team.abbr, league)\n    if (tid) setTeamPage({ id: tid, league })\n  }",
  'teamPage state + handler'
)

patch(
  "  const sharedProps = { viewMode, cols, favTeams, onToggleFav: toggleFav, oddsMap, onSelect: setSelectedGame }",
  "  const sharedProps = { viewMode, cols, favTeams, onToggleFav: toggleFav, oddsMap, onSelect: setSelectedGame }\n\n  if (teamPage) {\n    return <TeamPage teamId={teamPage.id} league={teamPage.league} onBack={() => setTeamPage(null)} />\n  }",
  'TeamPage guard'
)

patch(
  "<GameGroup games={favGames} {...sharedProps} />",
  "<GameGroup games={favGames} {...sharedProps} onTeamClick={handleTeamClick} />",
  'favGames onTeamClick'
)

patch(
  "<GameGroup games={otherGames} {...sharedProps} />",
  "<GameGroup games={otherGames} {...sharedProps} onTeamClick={handleTeamClick} />",
  'otherGames onTeamClick'
)

// Write back with CRLF to match project style
fs.writeFileSync(dest, src.replace(/\n/g, '\r\n'), 'utf8')
console.log('\nAll patches applied — written with CRLF')
