import { useState, useCallback, useRef, useEffect } from 'react'
import { usePlayers, useTeamList, DEFAULT_FILTERS, type PlayerFilters } from '@/hooks/usePlayers'
import { useRosteredPlayerIds, useAddPlayer, useMyRoster } from '@/hooks/useRoster'
import { useAppStore } from '@/store/appStore'
import { buildSlotDefs } from '@/types/database'
import type { Player } from '@/types/database'
import { Search, ChevronLeft, ChevronRight, Plus, Check, X, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

const POS_OPTS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const
const LEAGUE_OPTS = ['ALL', 'NFL', 'CFB'] as const
const STATUS_OPTS = ['ALL', 'active', 'questionable', 'out'] as const
const NFL_CONFS = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West']
const CFB_CONFS = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Ind', 'AAC', 'Mountain West', 'CUSA']

export function PlayersView() {
  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_FILTERS)
  const [showSlotPicker, setShowSlotPicker] = useState<Player | null>(null)
  const [teamSearch, setTeamSearch] = useState('')
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false)
  const teamDropdownRef = useRef<HTMLDivElement>(null)

  const { activeLeagueId, activeLeague } = useAppStore()
  const { data, isFetching } = usePlayers(filters)
  const { data: teamList = [] } = useTeamList(filters.league)
  const { data: rosteredIds } = useRosteredPlayerIds(activeLeagueId)
  const { data: myRoster = [] } = useMyRoster(activeLeagueId)
  const addPlayer = useAddPlayer(activeLeagueId)

  const players = data?.players ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / filters.pageSize)

  const setFilter = useCallback(<K extends keyof PlayerFilters>(key: K, val: PlayerFilters[K]) => {
    setFilters(f => ({ ...f, [key]: val, page: key === 'page' ? (val as number) : 0 }))
  }, [])

  // Reset team when league changes (teams are league-specific)
  const setLeagueFilter = useCallback((league: PlayerFilters['league']) => {
    setFilters(f => ({ ...f, league, team: 'ALL', conference: 'ALL', page: 0 }))
    setTeamSearch('')
  }, [])

  // Close team dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(e.target as Node)) {
        setTeamDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const slots = activeLeague ? buildSlotDefs(activeLeague) : []

  // Filtered team list based on team search input
  const filteredTeams = teamList.filter(t =>
    t.team.toLowerCase().includes(teamSearch.toLowerCase())
  )

  const selectedTeamLabel = filters.team === 'ALL' ? 'All Teams' : filters.team
  const hasActiveFilters = filters.pos !== 'ALL' || filters.league !== 'ALL' ||
    filters.status !== 'ALL' || filters.conference !== 'ALL' ||
    filters.team !== 'ALL' || filters.search !== '' || filters.rookiesOnly

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setTeamSearch('')
  }

  // Get conference options based on current league filter
  const confOptions = filters.league === 'NFL'
    ? NFL_CONFS
    : filters.league === 'CFB'
    ? CFB_CONFS
    : [...NFL_CONFS, ...CFB_CONFS]

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      {/* Header + search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <h1 className="section-title self-center shrink-0">Players</h1>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-field-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Search by name or team..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
          {filters.search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-field-400 hover:text-white transition-colors"
              onClick={() => setFilter('search', '')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-field-400 text-sm">{total.toLocaleString()} players</span>
          {hasActiveFilters && (
            <button
              className="text-xs text-gold hover:text-gold/80 underline transition-colors"
              onClick={clearAllFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Filter row 1: Position + League type */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Position pills */}
        <div className="flex gap-1 flex-wrap">
          {POS_OPTS.map(p => (
            <button
              key={p}
              onClick={() => setFilter('pos', p)}
              className={clsx('filter-chip', filters.pos === p && 'active')}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-field-700 mx-1 hidden sm:block" />

        {/* NFL/CFB toggle */}
        <div className="flex gap-1">
          {LEAGUE_OPTS.map(l => (
            <button
              key={l}
              onClick={() => setLeagueFilter(l)}
              className={clsx(
                'filter-chip',
                filters.league === l && 'active',
                filters.league === l && l === 'NFL' && '!bg-nfl/20 !border-nfl !text-nfl',
                filters.league === l && l === 'CFB' && '!bg-cfb/20 !border-cfb !text-cfb',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {/* Rookies only toggle */}
        <button
          onClick={() => setFilters(f => ({ ...f, rookiesOnly: !f.rookiesOnly, team: 'ALL', page: 0 }))}
          className={clsx('filter-chip', filters.rookiesOnly && 'active !bg-gold/20 !border-gold !text-gold')}
        >
          🏈 Rookies
        </button>
      </div>

      {/* Filter row 2: Team, Conference, Status, Sort */}
      <div className="flex flex-wrap gap-2 items-center">

        {/* Team searchable dropdown */}
        <div className="relative" ref={teamDropdownRef}>
          <button
            className={clsx(
              'input !py-1 !px-3 text-sm flex items-center gap-1.5 min-w-[140px] justify-between',
              filters.team !== 'ALL' && 'border-gold/50 text-gold',
            )}
            onClick={() => setTeamDropdownOpen(v => !v)}
          >
            <span className="truncate max-w-[120px]">{selectedTeamLabel}</span>
            <ChevronDown className={clsx('w-3.5 h-3.5 shrink-0 transition-transform', teamDropdownOpen && 'rotate-180')} />
          </button>

          {teamDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-field-900 border border-field-700 rounded-lg shadow-xl overflow-hidden">
              {/* Search inside dropdown */}
              <div className="p-2 border-b border-field-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-400" />
                  <input
                    className="input !py-1.5 !pl-8 !pr-2 text-sm w-full"
                    placeholder="Search teams..."
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                  {teamSearch && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-field-400"
                      onClick={e => { e.stopPropagation(); setTeamSearch('') }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Team list */}
              <div className="max-h-56 overflow-y-auto">
                {/* All teams option */}
                <button
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm hover:bg-field-800 transition-colors flex items-center gap-2',
                    filters.team === 'ALL' ? 'text-gold font-bold' : 'text-white',
                  )}
                  onClick={() => { setFilter('team', 'ALL'); setTeamDropdownOpen(false); setTeamSearch('') }}
                >
                  <span className="w-2 h-2 rounded-full bg-field-600 shrink-0" />
                  All Teams
                </button>

                {filteredTeams.length === 0 && (
                  <div className="px-3 py-4 text-field-400 text-sm text-center">No teams found</div>
                )}

                {filteredTeams.map(({ team, league }) => (
                  <button
                    key={team}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-field-800 transition-colors flex items-center gap-2',
                      filters.team === team ? 'text-gold font-bold bg-field-800/60' : 'text-white',
                    )}
                    onClick={() => { setFilter('team', team); setTeamDropdownOpen(false); setTeamSearch('') }}
                  >
                    <span className={clsx(
                      'text-xs font-bold px-1 py-0.5 rounded shrink-0',
                      league === 'NFL' ? 'league-nfl' : 'league-cfb',
                    )}>
                      {league}
                    </span>
                    <span className="truncate">{team}</span>
                    {filters.team === team && <Check className="w-3 h-3 ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conference */}
        <select
          className={clsx('input !py-1 !px-2 text-sm w-auto', filters.conference !== 'ALL' && 'border-gold/50 text-gold')}
          value={filters.conference}
          onChange={e => setFilter('conference', e.target.value)}
        >
          <option value="ALL">All Conferences</option>
          {confOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select
          className={clsx('input !py-1 !px-2 text-sm w-auto', filters.status !== 'ALL' && 'border-gold/50 text-gold')}
          value={filters.status}
          onChange={e => setFilter('status', e.target.value as any)}
        >
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {/* Sort — pushed to the right */}
        <div className="flex items-center gap-1 ml-auto">
          <select
            className="input !py-1 !px-2 text-sm w-auto"
            value={filters.sortBy}
            onChange={e => setFilter('sortBy', e.target.value as any)}
          >
            <option value="adp">ADP</option>
            <option value="avg_pts">Avg Pts</option>
            <option value="proj_pts">Projected</option>
            <option value="name">Name</option>
          </select>
          <button
            className="input !py-1 !px-2 text-sm font-bold"
            title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => setFilter('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')}
          >
            {filters.sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {(filters.team !== 'ALL' || filters.conference !== 'ALL' || filters.status !== 'ALL') && (
        <div className="flex flex-wrap gap-1.5">
          {filters.team !== 'ALL' && (
            <ActiveFilterChip
              label={filters.team}
              onRemove={() => setFilter('team', 'ALL')}
            />
          )}
          {filters.conference !== 'ALL' && (
            <ActiveFilterChip
              label={filters.conference}
              onRemove={() => setFilter('conference', 'ALL')}
            />
          )}
          {filters.status !== 'ALL' && (
            <ActiveFilterChip
              label={filters.status}
              onRemove={() => setFilter('status', 'ALL')}
            />
          )}
          {filters.rookiesOnly && (
            <ActiveFilterChip
              label="🏈 Rookies Only"
              onRemove={() => setFilter('rookiesOnly', false)}
            />
          )}
        </div>
      )}

      {/* Table */}
      <div className="panel !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Player</th>
                <th className="text-center">Pos</th>
                <th className="text-left hidden sm:table-cell">Team</th>
                <th className="text-left hidden md:table-cell">Type</th>
                <th className="text-center">ADP</th>
                <th className="text-center">Avg</th>
                <th className="text-center">Proj</th>
                <th className="text-center">Status</th>
                {activeLeagueId && <th className="text-center">Add</th>}
              </tr>
            </thead>
            <tbody>
              {isFetching && players.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-field-400">Loading…</td></tr>
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-field-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-30" />
                      <span>No players match your filters</span>
                      <button className="text-gold text-sm underline" onClick={clearAllFilters}>
                        Clear all filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : players.map(p => {
                const isTaken = rosteredIds?.has(p.id)
                return (
                  <tr key={p.id} className={clsx(isTaken && 'opacity-50')}>
                    <td>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-1.5 flex-wrap">
                          {p.name}
                          {/* NFL rookie badge */}
                          {p.is_rookie && p.league === 'NFL' && (
                            <span className="text-[10px] font-black bg-gold text-field-950 px-1 py-0.5 rounded leading-none shrink-0" title="2026 NFL Rookie">
                              R
                            </span>
                          )}
                          {/* CFB class badge */}
                          {p.league === 'CFB' && p.depth_pos && (() => {
                            const cls = p.depth_pos
                            const short: Record<string, string> = {
                              Freshman: 'FR', Sophomore: 'SO', Junior: 'JR',
                              Senior: 'SR', Graduate: 'GR',
                            }
                            const colors: Record<string, string> = {
                              Freshman:  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
                              Sophomore: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
                              Junior:    'bg-purple-500/20 text-purple-300 border border-purple-500/30',
                              Senior:    'bg-orange-500/20 text-orange-300 border border-orange-500/30',
                              Graduate:  'bg-field-500/30 text-field-200 border border-field-500/30',
                            }
                            const label = short[cls]
                            if (!label) return null
                            return (
                              <span className={`text-[10px] font-black px-1 py-0.5 rounded leading-none shrink-0 ${colors[cls]}`} title={cls}>
                                {label}
                              </span>
                            )
                          })()}
                        </div>
                        {p.league === 'NFL' && p.depth_pos && (
                          <div className="text-field-400 text-xs">{p.depth_pos}</div>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`pos-badge pos-${p.pos}`}>{p.pos}</span>
                    </td>
                    <td className="hidden sm:table-cell">
                      <button
                        className="text-field-300 text-sm hover:text-gold transition-colors text-left"
                        onClick={() => { setFilter('team', p.team); setTeamSearch('') }}
                        title={`Filter by ${p.team}`}
                      >
                        {p.team}
                      </button>
                    </td>
                    <td className="hidden md:table-cell">
                      <button
                        className={clsx('text-xs font-bold px-1.5 py-0.5 rounded', p.league === 'NFL' ? 'league-nfl' : 'league-cfb')}
                        onClick={() => setLeagueFilter(p.league as any)}
                        title={`Filter by ${p.league}`}
                      >
                        {p.league}
                      </button>
                    </td>
                    <td className="text-center text-field-300 text-sm">{p.adp?.toFixed(1) ?? '—'}</td>
                    <td className="text-center text-white font-bold text-sm">{p.avg_pts?.toFixed(1) ?? '—'}</td>
                    <td className="text-center text-field-300 text-sm">{p.proj_pts?.toFixed(1) ?? '—'}</td>
                    <td className="text-center">
                      <StatusBadge status={p.status} note={p.injury_note} />
                    </td>
                    {activeLeagueId && (
                      <td className="text-center">
                        {isTaken ? (
                          <span title="On a roster" className="text-field-500">
                            <Check className="w-4 h-4 mx-auto" />
                          </span>
                        ) : (
                          <button
                            className="btn-ghost !py-1 !px-2"
                            onClick={() => setShowSlotPicker(p)}
                            title="Add to roster"
                          >
                            <Plus className="w-4 h-4 text-gold" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-field-400 text-sm">
          {total > 0
            ? `${(filters.page * filters.pageSize + 1).toLocaleString()}–${Math.min((filters.page + 1) * filters.pageSize, total).toLocaleString()} of ${total.toLocaleString()} players`
            : 'No players found'}
        </span>
        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5 text-sm text-field-400">
            <span>Show</span>
            <select
              className="input !py-1 !px-2 text-xs w-20"
              value={filters.pageSize}
              onChange={e => setFilters(f => ({ ...f, pageSize: Number(e.target.value), page: 0 }))}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
          {/* Page controls */}
          <div className="flex gap-1 items-center">
            <button
              className="btn-ghost !py-1 !px-2"
              disabled={filters.page === 0}
              onClick={() => setFilter('page', 0)}
            >
              «
            </button>
            <button
              className="btn-ghost !py-1 !px-2"
              disabled={filters.page === 0}
              onClick={() => setFilter('page', filters.page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-white px-2">
              {filters.page + 1} / {Math.max(totalPages, 1)}
            </span>
            <button
              className="btn-ghost !py-1 !px-2"
              disabled={filters.page >= totalPages - 1}
              onClick={() => setFilter('page', filters.page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              className="btn-ghost !py-1 !px-2"
              disabled={filters.page >= totalPages - 1}
              onClick={() => setFilter('page', totalPages - 1)}
            >
              »
            </button>
          </div>
        </div>
      </div>

      {/* Slot picker modal */}
      {showSlotPicker && (
        <SlotPickerModal
          player={showSlotPicker}
          slots={slots}
          filledSlots={new Set(myRoster.map(r => r.slot))}
          onPick={async (slot) => {
            await addPlayer.mutateAsync({
              playerId: showSlotPicker.id,
              slot,
              playerName: showSlotPicker.name,
            })
            setShowSlotPicker(null)
          }}
          onClose={() => setShowSlotPicker(null)}
        />
      )}
    </div>
  )
}

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gold/10 border border-gold/30 text-gold text-xs font-bold px-2 py-1 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

function StatusBadge({ status, note }: { status: string; note?: string | null }) {
  if (status === 'active') return null
  const cls = {
    questionable: 'text-yellow-400 bg-yellow-400/10',
    out: 'text-red-400 bg-red-400/10',
    ir: 'text-ir bg-ir/10',
  }[status] ?? 'text-field-400'
  return (
    <span
      className={clsx('text-xs font-bold px-1.5 py-0.5 rounded uppercase', cls)}
      title={note ?? undefined}
    >
      {status === 'questionable' ? 'Q' : status.toUpperCase()}
    </span>
  )
}

function SlotPickerModal({ player, slots, filledSlots, onPick, onClose }: {
  player: Player
  slots: { key: string; label: string; pos: string[]; type?: string }[]
  filledSlots: Set<string>
  onPick: (slot: string) => void
  onClose: () => void
}) {
  // Build eligible slots:
  // 1. Must be positionally valid for this player
  // 2. Must not be already filled
  // 3. CFB_OS slots only shown if league has them (they appear in slots array)
  //    and only if player is CFB
  const eligible = slots.filter(s => {
    // Skip filled slots entirely
    if (filledSlots.has(s.key)) return false

    // CFB Offseason slots: only CFB players allowed
    if (s.type === 'cfb_os' || s.key.startsWith('CFB_OS')) {
      return player.league === 'CFB'
    }

    // IR slots: skip in add flow (can't add directly to IR)
    if (s.type === 'ir' || s.key.startsWith('IR')) return false

    // Bench always eligible
    if (s.type === 'bench' || s.key.startsWith('BN')) return true

    // Flex eligible for RB/WR/TE
    if ((s.type === 'flex' || s.key.startsWith('FLEX')) && ['RB', 'WR', 'TE'].includes(player.pos)) return true

    // Starter slot: position must match
    return s.pos.includes(player.pos)
  })

  const hasNoCfbOs = !slots.some(s => s.type === 'cfb_os' || s.key.startsWith('CFB_OS'))
  const isNflBlockedFromCfbOs = player.league === 'NFL' && slots.some(s => s.type === 'cfb_os')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <h3 className="section-title mb-1">Add {player.name}</h3>
        <p className="text-field-400 text-sm mb-4">Choose an open roster slot</p>

        <div className="space-y-1">
          {eligible.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-field-400 text-sm">No open eligible slots</p>
              <p className="text-field-500 text-xs">Drop a player first to free up space</p>
            </div>
          ) : (
            eligible.map(s => (
              <button
                key={s.key}
                className="w-full text-left btn-ghost flex items-center justify-between"
                onClick={() => onPick(s.key)}
              >
                <span className="font-bold text-white">{s.label}</span>
                <span className="text-field-400 text-xs">
                  {s.type === 'bench' || s.key.startsWith('BN') ? 'Bench' :
                   s.type === 'cfb_os' || s.key.startsWith('CFB_OS') ? 'CFB Offseason' :
                   s.pos.join(', ')}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Info message if NFL player can't use CFB_OS */}
        {isNflBlockedFromCfbOs && (
          <p className="text-yellow-400/80 text-xs mt-3 text-center">
            NFL players cannot be placed in CFB Offseason slots
          </p>
        )}

        <button className="btn-ghost w-full mt-3" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
