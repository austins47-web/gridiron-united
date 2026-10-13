/**
 * A 1940s battleship side on, bow to the right, its waterline through
 * (0, 0) and 2 units long (scale it to size): a raked bow, two gun
 * turrets, the bridge tower and mast, a funnel trailing smoke, and its
 * wake. `flip` points it left.
 */
export function Warship({ size, fill, outline, wake = '#ffffff', flip = false }: {
  /** its length, bow to stern */
  size: number
  fill: string
  outline: string
  wake?: string
  flip?: boolean
}) {
  const k = size / 2
  return (
    <g transform={`scale(${flip ? -k : k} ${k})`}>
      {/* The wake, off the stern */}
      <path d="M-1.05 .06 Q-1.35 .02 -1.6 .1 M-1.02 .13 Q-1.3 .14 -1.48 .22" fill="none" stroke={wake} strokeOpacity={0.75} strokeWidth={0.05} strokeLinecap="round" />
      {/* Smoke from the funnel */}
      <circle cx={-0.42} cy={-0.62} r={0.07} fill={wake} fillOpacity={0.45} />
      <circle cx={-0.58} cy={-0.7} r={0.09} fill={wake} fillOpacity={0.35} />
      <circle cx={-0.78} cy={-0.74} r={0.11} fill={wake} fillOpacity={0.25} />
      <g fill={fill} stroke={outline} strokeWidth={0.05} strokeLinejoin="round">
        {/* Guns: fore turret's barrels forward, aft turret's back */}
        <path d="M.36 -.2 L.74 -.27 M.36 -.15 L.74 -.2 M-.52 -.2 L-.86 -.27 M-.52 -.15 L-.86 -.2" fill="none" strokeWidth={0.045} />
        <path d="M.38 -.12 L.38 -.19 Q.38 -.26 .3 -.26 L.14 -.26 Q.08 -.26 .08 -.19 L.08 -.12 Z" />
        <path d="M-.54 -.12 L-.54 -.19 Q-.54 -.26 -.46 -.26 L-.3 -.26 Q-.24 -.26 -.24 -.19 L-.24 -.12 Z" />
        {/* The bridge tower, its mast, and the funnel */}
        <path d="M.04 -.12 L.04 -.36 L-.02 -.36 L-.02 -.5 L-.1 -.5 L-.1 -.36 L-.14 -.36 L-.14 -.12 Z" />
        <path d="M-.06 -.5 L-.06 -.74" fill="none" strokeWidth={0.04} />
        <path d="M-.2 -.12 L-.24 -.46 L-.4 -.46 L-.38 -.12 Z" />
        {/* The hull: a raked bow, the deck, a rounded stern */}
        <path d="M1 -.14 L.86 .12 L-.86 .12 Q-1 .1 -1 -.04 L-1 -.12 Z" />
      </g>
    </g>
  )
}
