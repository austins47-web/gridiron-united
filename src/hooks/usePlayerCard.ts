import { create } from 'zustand'

/**
 * Which player's Pick'Em card is open. Any name in a Pick'Em league —
 * chat, the Board, Standings — calls openPlayerCard; PlayerCardHost
 * (mounted once in AppShell) shows it.
 */
export const usePlayerCard = create<{ userId: string | null }>(() => ({ userId: null }))

export const openPlayerCard = (userId: string) => usePlayerCard.setState({ userId })
export const closePlayerCard = () => usePlayerCard.setState({ userId: null })
