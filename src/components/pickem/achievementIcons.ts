import {
  Trophy, Shield, Crown, Star, Crosshair, Eye, Dices, Dog, Wand2, HeartCrack, Dumbbell, type LucideIcon,
} from 'lucide-react'
import type { AchievementKey } from './standings'

/** Each badge's icon — the season card, Wrapped and the week-final chat card use these. */
export const ACHIEVEMENT_ICONS: Record<AchievementKey, LucideIcon> = {
  champ: Trophy, defender: Shield, dynasty: Crown, perfect: Star, sniper: Crosshair, calledIt: Eye,
  beatVegas: Dices, upsetArtist: Dog, miracle: Wand2, scarTissue: HeartCrack, ironMan: Dumbbell,
}
