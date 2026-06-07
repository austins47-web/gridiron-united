import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMyRoster, useDropPlayer, useMovePlayer, useRosterRealtime } from '@/hooks/useRoster'
import { useAppStore } from '@/store/appStore'
import { buildSlotDefs, canFillSlot } from '@/types/database'
import type { RosterEntryWithPlayer } from '@/hooks/useRoster'
import type { SlotDef } from '@/types/database'
import { Zap, Trash2, TrendingUp, AlertCircle, AlertTriangle, ArrowLeftRight, X } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

export function RosterView() {
  const { activeLeagueId, activeLeague, myMembership } = useAppStore()
  const { data: roster = [], isLoading } = useMyRoster(activeLeagueId)
  const dropPlayer = useDropPlayer(activeLeagueId)
  const movePlayer = useMovePlayer(activeLeagueId)

  const [confirmDrop, setConfirmDrop] = useState<RosterEntryWithPlayer | null>(null)
  const [moving, setMoving] = useState<RosterEntryWithPlayer | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  useRosterRealtime(activeLeagueId)

  if (!activeLeagueId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select or create a league to manage your roster.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="ai-dot" /></div>
  }

  const slots = activeLeague ? buildSlotDefs(activeLeague) : []
  const rosterBySlot = new Map(roster.map(r => [r.slot, r]))

  const totalProj = roster
    .filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR'))
    .reduce((sum, r) => sum + (r.player?.proj_pts ?? 0), 0)
  const totalAvg = roster
    .filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR'))
    .reduce((sum, r) => sum + (r.player?.avg_pts ?? 0), 0)

  const handleGetAI = async () => {
    if (!roster.length) return
    setLoadingAI(true)
    setAiAnalysis(null)
    try {
      // Call via Supabase Edge Function — keeps the API key server-side and avoids CORS
      const { data, error } = await supabase.functions.invoke('ai-roster-analysis', {
        body: {
          roster,
          scoringType: activeLeague?.scoring_type ?? 'ppr',
          totalProj,
        },
      })
      if (error) throw error
      setAiAnalysis(data?.analysis ?? 'No analysis available.')
    } catch (err: any) {
      setAiAnalysis('Unable to load AI analysis right now. ' + (err?.message ?? ''))
    } finally {
      setLoadingAI(false)
    }
  }

  // Move handler: swap slots between two players, or move to empty slot
  const handleMoveToSlot = async (targetSlot: SlotDef) => {
    if (!moving) return
    const movingEntry = moving
    setMoving(null)

    const pos = movingEntry.player?.pos
    const league = movingEntry.player?.league
    if (!pos || !canFillSlot(targetSlot, pos as any, league as any)) {
      toast.error(
        targetSlot.type === 'cfb_os'
          ? 'Only CFB players can go in the Offseason slot'
          : `${pos} can't play in ${targetSlot.label} slot`
      )
      return
    }

    const existingInTarget = rosterBySlot.get(targetSlot.key)

    if (existingInTarget && existingInTarget.id !== movingEntry.id) {
      // Swap: use a temp slot so we never have two rows with the same slot simultaneously.
      // A→temp, B→A's old slot, A→B's old slot (now freed).
      const tempSlot = `__SWAP_${Date.now()}`
      const fromSlot = movingEntry.slot
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: tempSlot })
      await movePlayer.mutateAsync({ rosterId: existingInTarget.id, newSlot: fromSlot })
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: targetSlot.key })
    } else {
      // Simple move to empty slot
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: targetSlot.key })
    }
    toast.success('Roster updated')
  }

  // Sections
  const starterSlots = slots.filter(s => s.type === 'starter' || s.type === 'flex')
  const benchSlots   = slots.filter(s => s.type === 'bench')
  const irSlots      = slots.filter(s => s.type === 'ir')
  const cfbOsSlots   = slots.filter(s => s.type === 'cfb_os')

  // ── Roster limit logic (Sleeper-style) ───────────────────────────────
  // IR and CFB_OS slots do NOT count against roster limit
  const rosterLimit = starterSlots.length + benchSlots.length
  const activePlayers = roster.filter(r =>
    !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS')
  )
  const isOverRosterLimit = activePlayers.length > rosterLimit
  const overBy = activePlayers.length - rosterLimit
  // While over limit: moves are locked (must drop first)
  const rosterLocked = isOverRosterLimit && !moving

  // ── IR / CFB_OS health warning logic ─────────────────────────────────
  // IR warning: player in IR slot who is now healthy (status === 'active')
  const healthyOnIR = roster.filter(r =>
    r.slot.startsWith('IR') && r.player?.status === 'active'
  )
  // CFB_OS warning: player in CFB_OS slot whose team's season has started
  // (proj_pts > 0 means they are in-season — simple heuristic)
  const activeOnCfbOs = roster.filter(r =>
    r.slot.startsWith('CFB_OS') && (r.player?.proj_pts ?? 0) > 0
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="section-title">{myMembership?.team_name ?? 'My Roster'}</h1>
          <p className="text-field-400 text-sm mt-1">{activeLeague?.name}</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-field-800 border border-field-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-field-400">Projected</div>
            <div className="text-gold font-black text-xl">{totalProj.toFixed(1)}</div>
          </div>
          <div className="bg-field-800 border border-field-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-field-400">Avg/Wk</div>
            <div className="text-white font-black text-xl">{totalAvg.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Move mode banner */}
      {moving && (
        <div className="bg-gold/10 border border-gold/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-gold" />
            <span className="text-gold font-bold text-sm">
              Moving <span className="text-white">{moving.player?.name}</span>
              {' '}— click a highlighted slot to place, or cancel
            </span>
          </div>
          <button className="btn-ghost !py-1 !px-2 text-field-400" onClick={() => setMoving(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Over roster limit banner */}
      {isOverRosterLimit && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-300 font-bold text-sm">
              You are {overBy} player{overBy > 1 ? 's' : ''} over the roster limit ({rosterLimit} active spots)
            </span>
          </div>
          <p className="text-red-400/80 text-xs pl-6">
            Moving players is locked until you drop {overBy} player{overBy > 1 ? 's' : ''}.
            IR and CFB Offseason slots do not count toward the limit — you can move players there without dropping.
          </p>
          <div className="pl-6 flex flex-wrap gap-2 mt-1">
            {activePlayers.slice(0, overBy + 2).map(r => (
              <span key={r.id} className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-0.5 rounded-full font-bold">
                {r.player?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Healthy player on IR banner */}
      {healthyOnIR.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="text-yellow-300 font-bold text-sm">
              {healthyOnIR.length} player{healthyOnIR.length > 1 ? 's' : ''} in IR {healthyOnIR.length > 1 ? 'are' : 'is'} healthy
            </span>
          </div>
          <p className="text-yellow-400/80 text-xs pl-6">
            Move {healthyOnIR.length > 1 ? 'these players' : 'this player'} back to your active roster or bench — IR is only for injured players.
          </p>
          <div className="pl-6 flex flex-wrap gap-2">
            {healthyOnIR.map(r => (
              <span key={r.id} className="text-xs bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full font-bold">
                {r.player?.name} ({r.player?.team})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Active player stuck in CFB Offseason banner */}
      {activeOnCfbOs.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-blue-300 font-bold text-sm">
              {activeOnCfbOs.length} player{activeOnCfbOs.length > 1 ? 's' : ''} in CFB Offseason {activeOnCfbOs.length > 1 ? 'have' : 'has'} started their season
            </span>
          </div>
          <p className="text-blue-400/80 text-xs pl-6">
            {activeOnCfbOs.length > 1 ? 'These players are' : 'This player is'} earning points but stuck in your CFB Offseason slot — move {activeOnCfbOs.length > 1 ? 'them' : 'them'} to an active slot to count their score.
          </p>
          <div className="pl-6 flex flex-wrap gap-2">
            {activeOnCfbOs.map(r => (
              <span key={r.id} className="text-xs bg-blue-500/20 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                {r.player?.name} ({r.player?.team})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="panel">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold" />
            <span className="font-bold text-white">AI Roster Analysis</span>
          </div>
          <button className="btn-gold text-sm" onClick={handleGetAI} disabled={loadingAI || roster.length === 0}>
            {loadingAI ? <span className="flex items-center gap-2"><span className="ai-dot" /> Analyzing…</span> : 'Get Analysis'}
          </button>
        </div>
        {aiAnalysis
          ? <div className="text-field-200 text-sm leading-relaxed whitespace-pre-wrap mt-3 border-t border-field-700 pt-3">{aiAnalysis}</div>
          : <p className="text-field-400 text-sm">{roster.length === 0 ? 'Add players to get AI analysis.' : 'Get personalized advice on your starters, bench, and waiver targets.'}</p>
        }
      </div>

      {/* Starters */}
      {starterSlots.length > 0 && (
        <div>
          <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Starters</div>
          <div className="grid gap-1">
            {starterSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bench */}
      {benchSlots.length > 0 && (
        <div>
          <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Bench</div>
          <div className="grid gap-1">
            {benchSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* IR */}
      {irSlots.length > 0 && (
        <div>
          <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Injured Reserve</div>
          <div className="grid gap-1">
            {irSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* CFB Offseason — only show if league has these slots configured */}
      {cfbOsSlots.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-cfb uppercase tracking-wider">🎓 CFB Offseason</span>
            <span className="text-xs text-field-500">— players held here don't score but don't count vs active roster</span>
          </div>
          <div className="grid gap-1">
            {cfbOsSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {roster.length === 0 && (
        <div className="panel text-center py-8">
          <TrendingUp className="w-10 h-10 text-gold/30 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">Roster is empty</p>
          <p className="text-field-400 text-sm">Head to the Players tab to add players, or wait for the draft.</p>
        </div>
      )}

      {/* Drop confirmation */}
      {confirmDrop && (
        <div className="modal-overlay" onClick={() => setConfirmDrop(null)}>
          <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-2">Drop Player?</h3>
            <p className="text-field-300 mb-1">
              <span className="text-white font-bold">{confirmDrop.player.name}</span> will be released
              to the free agent pool. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDrop(null)}>Cancel</button>
              <button
                className="btn-danger flex-1"
                onClick={async () => {
                  await dropPlayer.mutateAsync({ rosterId: confirmDrop.id, playerName: confirmDrop.player.name })
                  setConfirmDrop(null)
                }}
              >
                Drop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RosterSlotRow({
  slot, entry, moving, locked, onMove, onDropToSlot, onDrop,
}: {
  slot: SlotDef
  entry: RosterEntryWithPlayer | undefined
  moving: RosterEntryWithPlayer | null
  locked: boolean
  onMove: (e: RosterEntryWithPlayer) => void
  onDropToSlot: (slot: SlotDef) => void
  onDrop: (e: RosterEntryWithPlayer) => void
}) {
  const player = entry?.player

  // Is this a valid target for the player being moved?
  const isValidTarget = moving && canFillSlot(slot, moving.player?.pos as any, moving.player?.league as any)
  // Is this the slot the moving player is currently in? (source)
  const isSource = moving && entry?.id === moving.id
  // Is this an occupied slot we could swap with?
  const isSwapTarget = isValidTarget && entry && !isSource

  // IR and CFB_OS slots are always moveable even when over roster limit
  const isExemptSlot = slot.type === 'ir' || slot.type === 'cfb_os'
  const effectiveLocked = locked && !isExemptSlot && !moving

  const handleClick = () => {
    if (effectiveLocked) return
    if (moving) {
      if (isSource) { return }
      if (isValidTarget) onDropToSlot(slot)
      return
    }
    if (entry) onMove(entry)
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'roster-slot group transition-all',
        // Locked state (over roster limit, non-exempt slot)
        effectiveLocked && entry && 'opacity-50 cursor-not-allowed',
        effectiveLocked && !entry && 'opacity-30',
        // Move mode visual states (only when not locked)
        !effectiveLocked && moving && isSource && 'ring-2 ring-gold/60 bg-gold/5 opacity-70',
        !effectiveLocked && moving && isValidTarget && !isSource && 'ring-2 ring-green-400/50 bg-green-400/5 cursor-pointer hover:bg-green-400/10',
        !effectiveLocked && moving && !isValidTarget && !isSource && 'opacity-40 cursor-not-allowed',
        !effectiveLocked && !moving && entry && 'cursor-pointer hover:bg-field-800/60',
        !player && !effectiveLocked && 'opacity-60',
      )}
    >
      {/* Slot label */}
      <div className="w-12 shrink-0">
        <span className={clsx(
          'pos-badge text-xs',
          slot.key.startsWith('BN') ? 'pos-BN' : slot.key.startsWith('IR') ? 'pos-IR' : `pos-${slot.pos[0]}`,
        )}>
          {slot.label}
        </span>
      </div>

      {/* Player info or move hint */}
      <div className="flex-1 min-w-0">
        {player ? (
          <div className="flex items-center gap-2">
            <span className={clsx('pos-badge text-xs', `pos-${player.pos}`)}>{player.pos}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{player.name}</div>
              <div className="text-xs text-field-400">
                {player.team}
                {' · '}
                <span className={player.league === 'NFL' ? 'text-nfl' : 'text-cfb'}>{player.league}</span>
                {player.status !== 'active' && (
                  <span className={clsx('ml-1 font-bold uppercase',
                    player.status === 'questionable' ? 'text-yellow-400' : 'text-red-400')}>
                    {player.status === 'questionable' ? ' Q' : ` ${player.status.toUpperCase()}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <span className={clsx('text-sm italic',
            moving && isValidTarget ? 'text-green-400 font-bold' : 'text-field-500')}>
            {moving && isValidTarget ? '↓ Place here' : 'Empty'}
          </span>
        )}
      </div>

      {/* Swap indicator */}
      {isSwapTarget && (
        <div className="shrink-0 text-green-400 text-xs font-bold px-1">↕ Swap</div>
      )}

      {/* Locked indicator */}
      {effectiveLocked && entry && (
        <div className="shrink-0 text-red-400/60 text-xs font-bold px-1" title="Drop a player to unlock moves">
          🔒
        </div>
      )}

      {/* Points */}
      {player && !moving && (
        <div className="text-right shrink-0 hidden sm:block">
          <div className="text-sm font-bold text-white">{player.proj_pts?.toFixed(1) ?? '—'}</div>
          <div className="text-xs text-field-400">proj</div>
        </div>
      )}

      {/* Actions — only shown when NOT in move mode */}
      {entry && !moving && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!effectiveLocked && (
            <button
              className="btn-ghost !py-1 !px-2 text-field-400 hover:text-white"
              onClick={e => { e.stopPropagation(); onMove(entry) }}
              title="Move player"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            className="btn-ghost !py-1 !px-2 text-red-400 hover:text-red-300"
            onClick={e => { e.stopPropagation(); onDrop(entry) }}
            title="Drop player"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
