// Round-robin regular-season schedule generation, run once when a
// league's draft completes (see useDraft.ts). Standard "circle
// method": fix one team, rotate the rest each round so every team
// plays every other team exactly once per full cycle. An odd number
// of teams gets a placeholder "bye" seat that whoever lands on it
// simply doesn't play that round.
//
// Regular season length is fixed at 14 weeks — the common fantasy
// default (weeks 15-17 reserved for playoffs). This app doesn't
// generate a playoff bracket yet (that needs real standings to seed
// from, which don't exist until real weeks have been played), so
// only the 14 regular-season weeks are scheduled here.
export const REGULAR_SEASON_WEEKS = 14

const BYE = '__BYE__'

function circleMethodRounds(userIds: string[]): Array<Array<[string, string]>> {
  const list = [...userIds]
  if (list.length % 2 !== 0) list.push(BYE)
  const n = list.length
  if (n < 2) return []

  const fixed = list[0]
  let rotating = list.slice(1)
  const rounds: Array<Array<[string, string]>> = []

  for (let r = 0; r < n - 1; r++) {
    const current = [fixed, ...rotating]
    const round: Array<[string, string]> = []
    for (let i = 0; i < n / 2; i++) {
      const home = current[i]
      const away = current[n - 1 - i]
      if (home !== BYE && away !== BYE) round.push([home, away])
    }
    rounds.push(round)
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)]
  }
  return rounds
}

export interface GeneratedMatchup {
  week: number
  home_user_id: string
  away_user_id: string
}

// Cycles the round-robin back to the start for leagues where
// REGULAR_SEASON_WEEKS exceeds one full cycle (e.g. an 8-team league
// only needs 7 weeks for everyone to play everyone once) — flipping
// home/away on each repeat so the same team isn't always "home"
// against the same opponent every cycle.
export function generateRegularSeasonSchedule(userIds: string[], weeks: number = REGULAR_SEASON_WEEKS): GeneratedMatchup[] {
  const rounds = circleMethodRounds(userIds)
  if (rounds.length === 0) return []

  const matchups: GeneratedMatchup[] = []
  for (let week = 1; week <= weeks; week++) {
    const cycle = Math.floor((week - 1) / rounds.length)
    const round = rounds[(week - 1) % rounds.length]
    const flip = cycle % 2 === 1
    for (const [a, b] of round) {
      matchups.push({
        week,
        home_user_id: flip ? b : a,
        away_user_id: flip ? a : b,
      })
    }
  }
  return matchups
}
