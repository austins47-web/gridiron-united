// NFL team colors, for the Shop TV's game tiles: each team's two main
// colors, and a `glow` that reads on the TV's near-black (the primary,
// unless it's a navy, brown or black that would vanish: then the brighter
// of its colors, or a lifted version of it).

export interface TeamColors { primary: string; secondary: string; glow: string }

export const TEAM_COLORS: Record<string, TeamColors> = {
  ARI: { primary: '#97233F', secondary: '#FFB612', glow: '#C8304F' },
  ATL: { primary: '#A71930', secondary: '#000000', glow: '#D02A42' },
  BAL: { primary: '#241773', secondary: '#9E7C0C', glow: '#6A4FC8' },
  BUF: { primary: '#00338D', secondary: '#C60C30', glow: '#2E6BE6' },
  CAR: { primary: '#0085CA', secondary: '#101820', glow: '#1A9FE0' },
  CHI: { primary: '#0B162A', secondary: '#C83803', glow: '#E0560F' },
  CIN: { primary: '#FB4F14', secondary: '#000000', glow: '#FB4F14' },
  CLE: { primary: '#311D00', secondary: '#FF3C00', glow: '#FF3C00' },
  DAL: { primary: '#003594', secondary: '#869397', glow: '#2F6FD6' },
  DEN: { primary: '#FB4F14', secondary: '#002244', glow: '#FB4F14' },
  DET: { primary: '#0076B6', secondary: '#B0B7BC', glow: '#1A91D6' },
  GB: { primary: '#203731', secondary: '#FFB612', glow: '#FFB612' },
  HOU: { primary: '#03202F', secondary: '#A71930', glow: '#D02A42' },
  IND: { primary: '#002C5F', secondary: '#A2AAAD', glow: '#2A6CC4' },
  JAX: { primary: '#006778', secondary: '#D7A22A', glow: '#00A3B5' },
  KC: { primary: '#E31837', secondary: '#FFB81C', glow: '#E31837' },
  LV: { primary: '#000000', secondary: '#A5ACAF', glow: '#A5ACAF' },
  LAC: { primary: '#0080C6', secondary: '#FFC20E', glow: '#1A9BE0' },
  LAR: { primary: '#003594', secondary: '#FFA300', glow: '#3D74E8' },
  MIA: { primary: '#008E97', secondary: '#FC4C02', glow: '#00A8B2' },
  MIN: { primary: '#4F2683', secondary: '#FFC62F', glow: '#7A45C2' },
  NE: { primary: '#002244', secondary: '#C60C30', glow: '#D61A3F' },
  NO: { primary: '#D3BC8D', secondary: '#101820', glow: '#D3BC8D' },
  NYG: { primary: '#0B2265', secondary: '#A71930', glow: '#2A55D0' },
  NYJ: { primary: '#125740', secondary: '#FFFFFF', glow: '#1F8A5F' },
  PHI: { primary: '#004C54', secondary: '#A5ACAF', glow: '#00838F' },
  PIT: { primary: '#FFB612', secondary: '#101820', glow: '#FFB612' },
  SF: { primary: '#AA0000', secondary: '#B3995D', glow: '#D11A1A' },
  SEA: { primary: '#002244', secondary: '#69BE28', glow: '#69BE28' },
  TB: { primary: '#D50A0A', secondary: '#34302B', glow: '#E8231F' },
  TEN: { primary: '#0C2340', secondary: '#4B92DB', glow: '#4B92DB' },
  WAS: { primary: '#5A1414', secondary: '#FFB612', glow: '#9E2A2B' },
}

/** A team's TV glow color; the league's accent for anyone unknown. */
export function teamGlow(abbr: string, fallback = '#CE7B45'): string {
  return TEAM_COLORS[abbr]?.glow ?? fallback
}
