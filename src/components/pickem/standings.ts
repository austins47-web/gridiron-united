// ══════════════════════════════════════════════════════════════
// Pick'Em standings + weekly results
//
// Everything here is DERIVED from picks joined to game results
// rather than read from a maintained standings table. That means:
//   - a member who just joined shows up immediately at 0-0
//   - standings can never drift out of sync with actual results
//   - no trigger or background job to keep alive
//
// The rules themselves (winnerOf, computeWeek, computeWeekStats,
// computeStandings, computeWhoCanWin …) live in
// supabase/functions/_shared/pickemCore.ts so the edge functions run
// the same code; this module re-exports them for the app.
// ══════════════════════════════════════════════════════════════

export * from '../../../supabase/functions/_shared/pickemCore.ts'
