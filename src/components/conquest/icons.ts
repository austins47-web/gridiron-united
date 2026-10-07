// Conquest's symbols, one set for the map, the app and the TV (emoji look
// different on every screen, the Fire TV's especially). Drawn in a 24-unit
// box: `fill` ones are solid shapes, `stroke` ones are lines.

export const ICON = {
  /** A capital: a star */
  capital: { fill: 'M12 2.6l2.85 6 6.55.8-4.85 4.55 1.25 6.5L12 17.2l-5.8 3.25 1.25-6.5L2.6 9.4l6.55-.8z' },
  /** Under siege: a flame */
  siege: { fill: 'M12.2 2.2c1.2 3.4-.5 5.4-2 7.1-1.5 1.6-3 3.4-3 6 0 3.4 2.3 6.3 5 6.3s5-2.6 5-6.1c0-2.3-1-4.1-2.3-5.4.1 1.7-.5 3-1.7 3.6.5-2.8-.1-7-1-11.5z' },
  /** A chosen attack: crosshairs */
  target: { stroke: 'M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M12 6.8a5.2 5.2 0 1 1 0 10.4a5.2 5.2 0 1 1 0-10.4z', dot: true },
  /** A chosen flag */
  flag: { stroke: 'M6 21V3.5M6 4.5h11.5l-2.6 4 2.6 4H6' },
} as const

export type IconName = keyof typeof ICON
