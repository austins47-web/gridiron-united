import { useId } from 'react'
import { MEDAL_INFO, type MedalKind } from '../../../supabase/functions/_shared/conquest.ts'

/**
 * A war medal on its ribbon: the Medal of Honor (a gold star on light
 * blue), the Purple Heart (a purple heart on purple and white) or the
 * Distinguished Service Cross (a bronze cross on blue, edged red).
 */
export function MedalBadge({ kind, className, title = MEDAL_INFO[kind].name }: { kind: MedalKind; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '')
  const metal = `${uid}metal`
  return (
    <svg viewBox="0 0 60 100" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          {kind === 'service_cross'
            ? <><stop offset="0" stopColor="#e2b07a" /><stop offset=".5" stopColor="#a8693a" /><stop offset="1" stopColor="#6d3f1f" /></>
            : <><stop offset="0" stopColor="#fff1b3" /><stop offset=".5" stopColor="#e2b23a" /><stop offset="1" stopColor="#9c6f12" /></>}
        </linearGradient>
      </defs>
      {/* The ribbon */}
      {kind === 'honor' && (
        <>
          <path d="M14 0h32v34l-16 10-16-10z" fill="#6ba7dc" />
          {[[22, 10], [38, 10], [30, 18], [22, 26], [38, 26]].map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x} ${y - 3}l1 2.6h2.8l-2.2 1.7.9 2.7-2.5-1.6-2.5 1.6.9-2.7-2.2-1.7h2.8z`} fill="#fff" />
          ))}
        </>
      )}
      {kind === 'purple_heart' && (
        <>
          <path d="M14 0h32v34l-16 10-16-10z" fill="#5b2a86" />
          <path d="M14 0h4v36.5l-4-2.5zM42 0h4v34l-4 2.5z" fill="#f4f1ea" />
        </>
      )}
      {kind === 'service_cross' && (
        <>
          <path d="M14 0h32v34l-16 10-16-10z" fill="#1f3f8f" />
          <path d="M14 0h3v35.9l-3-1.9zM43 0h3v34l-3 1.9z" fill="#b3202a" />
          <path d="M17 0h2v37.2l-2-1.3zM41 0h2v36l-2 1.2z" fill="#f4f1ea" />
        </>
      )}
      {/* The medal */}
      {kind === 'honor' && (
        <path
          d="M30 50l5.3 11.6 12.7 1.3-9.5 8.5 2.7 12.5L30 77.6l-11.2 6.3 2.7-12.5-9.5-8.5 12.7-1.3z"
          fill={`url(#${metal})`} stroke="#6b4a08" strokeWidth="1.2" strokeLinejoin="round"
        />
      )}
      {kind === 'purple_heart' && (
        <>
          <path d="M30 92C16 82 9 74 9 64.5 9 57 14.5 52 21 52c4 0 7 2 9 5 2-3 5-5 9-5 6.5 0 12 5 12 12.5C51 74 44 82 30 92z" fill={`url(#${metal})`} stroke="#6b4a08" strokeWidth="1.2" />
          <path d="M30 86C19.5 78.5 14 72.5 14 65.5 14 60.5 17.5 57 22 57c3.5 0 6 2 8 5.2 2-3.2 4.5-5.2 8-5.2 4.5 0 8 3.5 8 8.5 0 7-5.5 13-16 20.5z" fill="#6b2f9a" />
        </>
      )}
      {kind === 'service_cross' && (
        <path
          d="M25 50h10v12h12v10H35v20H25V72H13V62h12z"
          fill={`url(#${metal})`} stroke="#4a2810" strokeWidth="1.2" strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
