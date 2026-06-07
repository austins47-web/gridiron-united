// ── Preset avatar SVGs — clean, modern, colorful ─────────────
// Each is a self-contained 80×80 SVG with a circular clip

export const AVATAR_PRESETS = [
  {
    id: 'helmet',
    label: 'Helmet',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a2a4a"/>
      <stop offset="100%" stop-color="#0d1826"/>
    </linearGradient>
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7c948"/>
      <stop offset="100%" stop-color="#d4920a"/>
    </linearGradient>
    <clipPath id="c1"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg1)"/>
  <g clip-path="url(#c1)">
    <ellipse cx="40" cy="50" rx="26" ry="22" fill="url(#hg)"/>
    <rect x="14" y="44" width="52" height="9" rx="4.5" fill="#b8790a"/>
    <path d="M40 24 C24 24 16 36 16 48 L64 48 C64 36 56 24 40 24Z" fill="url(#hg)"/>
    <path d="M40 24 C40 24 44 28 44 34 L36 34 C36 28 40 24 40 24Z" fill="#f7c948"/>
    <rect x="28" y="53" width="24" height="10" rx="3" fill="#b8790a"/>
    <line x1="35" y1="53" x2="35" y2="63" stroke="#f7c948" stroke-width="2"/>
    <line x1="40" y1="53" x2="40" y2="63" stroke="#f7c948" stroke-width="2"/>
    <line x1="45" y1="53" x2="45" y2="63" stroke="#f7c948" stroke-width="2"/>
    <rect x="30" y="63" width="20" height="4" rx="2" fill="#8a5c08"/>
  </g>
</svg>`,
  },
  {
    id: 'football',
    label: 'Football',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a3320"/>
      <stop offset="100%" stop-color="#0a1a10"/>
    </linearGradient>
    <linearGradient id="ball" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c97a2f"/>
      <stop offset="100%" stop-color="#8b4c10"/>
    </linearGradient>
    <clipPath id="c2"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg2)"/>
  <g clip-path="url(#c2)" transform="rotate(-20 40 40)">
    <ellipse cx="40" cy="40" rx="22" ry="14" fill="url(#ball)"/>
    <line x1="18" y1="40" x2="62" y2="40" stroke="white" stroke-width="1.8"/>
    <line x1="33" y1="27" x2="31" y2="53" stroke="white" stroke-width="1.4"/>
    <line x1="40" y1="26" x2="40" y2="54" stroke="white" stroke-width="1.4"/>
    <line x1="47" y1="27" x2="49" y2="53" stroke="white" stroke-width="1.4"/>
    <ellipse cx="40" cy="40" rx="22" ry="14" fill="none" stroke="#7a3c08" stroke-width="1.5"/>
  </g>
</svg>`,
  },
  {
    id: 'trophy',
    label: 'Trophy',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg3" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1a00"/>
      <stop offset="100%" stop-color="#1a0e00"/>
    </linearGradient>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#d4920a"/>
    </linearGradient>
    <clipPath id="c3"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg3)"/>
  <g clip-path="url(#c3)">
    <path d="M27 17 h26 v22 q0 16-13 20 q-13-4-13-20 Z" fill="url(#tg)"/>
    <path d="M27 22 q-12 0-10 14 q2 9 12 10" fill="none" stroke="#b8790a" stroke-width="3" stroke-linecap="round"/>
    <path d="M53 22 q12 0 10 14 q-2 9-12 10" fill="none" stroke="#b8790a" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 59 h12" stroke="url(#tg)" stroke-width="5" stroke-linecap="round"/>
    <rect x="37" y="55" width="6" height="6" fill="#d4920a"/>
    <rect x="28" y="63" width="24" height="5" rx="2.5" fill="url(#tg)"/>
    <text x="40" y="46" font-family="Arial,sans-serif" font-size="14" font-weight="900" fill="#8a5c00" text-anchor="middle">1</text>
  </g>
</svg>`,
  },
  {
    id: 'lightning',
    label: 'Lightning',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg4" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0f0f20"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe566"/>
      <stop offset="100%" stop-color="#f5a623"/>
    </linearGradient>
    <clipPath id="c4"><circle cx="40" cy="40" r="40"/></clipPath>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg4)"/>
  <g clip-path="url(#c4)">
    <polygon points="44,12 24,44 41,44 36,68 56,36 39,36" fill="url(#bolt)" filter="url(#glow)"/>
    <polygon points="44,12 24,44 41,44 36,68 56,36 39,36" fill="url(#bolt)" opacity="0.4"/>
  </g>
</svg>`,
  },
  {
    id: 'star',
    label: 'Star',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg5" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1a00"/>
      <stop offset="100%" stop-color="#1a0e00"/>
    </linearGradient>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe566"/>
      <stop offset="100%" stop-color="#f5a623"/>
    </linearGradient>
    <clipPath id="c5"><circle cx="40" cy="40" r="40"/></clipPath>
    <filter id="glow5"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg5)"/>
  <g clip-path="url(#c5)" filter="url(#glow5)">
    <polygon points="40,14 46,32 66,32 50,44 56,62 40,50 24,62 30,44 14,32 34,32"
      fill="url(#sg)"/>
  </g>
</svg>`,
  },
  {
    id: 'shield',
    label: 'Shield',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg6" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1f3c"/>
      <stop offset="100%" stop-color="#071426"/>
    </linearGradient>
    <linearGradient id="shield-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7c948"/>
      <stop offset="100%" stop-color="#c4840a"/>
    </linearGradient>
    <clipPath id="c6"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg6)"/>
  <g clip-path="url(#c6)">
    <path d="M40 14 L58 22 L58 40 Q58 58 40 66 Q22 58 22 40 L22 22 Z" fill="url(#shield-g)"/>
    <path d="M40 20 L54 27 L54 40 Q54 54 40 61 Q26 54 26 40 L26 27 Z" fill="#1a3a6e"/>
    <path d="M40 20 L54 27 L54 40 Q54 54 40 61 Q26 54 26 40 L26 27 Z" fill="none" stroke="#f7c948" stroke-width="1.5"/>
    <text x="40" y="48" font-family="Arial Black,sans-serif" font-size="20" font-weight="900" fill="#f7c948" text-anchor="middle">G</text>
  </g>
</svg>`,
  },
  {
    id: 'rocket',
    label: 'Rocket',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg7" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1628"/>
      <stop offset="100%" stop-color="#040c18"/>
    </linearGradient>
    <linearGradient id="rocket-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8f4ff"/>
      <stop offset="100%" stop-color="#8ab4e8"/>
    </linearGradient>
    <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe566"/>
      <stop offset="100%" stop-color="#ff6622"/>
    </linearGradient>
    <clipPath id="c7"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg7)"/>
  <g clip-path="url(#c7)">
    <circle cx="14" cy="20" r="1.5" fill="white" opacity="0.6"/>
    <circle cx="64" cy="14" r="1" fill="white" opacity="0.5"/>
    <circle cx="70" cy="35" r="1.2" fill="white" opacity="0.4"/>
    <circle cx="8" cy="50" r="1" fill="white" opacity="0.5"/>
    <path d="M40 14 Q52 20 52 38 L52 52 L40 60 L28 52 L28 38 Q28 20 40 14Z" fill="url(#rocket-g)"/>
    <circle cx="40" cy="36" r="7" fill="#1a3a6e" stroke="#8ab4e8" stroke-width="1.5"/>
    <path d="M28 50 L18 62 L33 57 Z" fill="#e8a020"/>
    <path d="M52 50 L62 62 L47 57 Z" fill="#e8a020"/>
    <path d="M34 60 Q40 68 46 60 L44 72 Q40 76 36 72 Z" fill="url(#flame)" opacity="0.9"/>
  </g>
</svg>`,
  },
  {
    id: 'crown',
    label: 'Crown',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg8" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1200"/>
      <stop offset="100%" stop-color="#0d0a00"/>
    </linearGradient>
    <linearGradient id="crown-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe566"/>
      <stop offset="100%" stop-color="#c4840a"/>
    </linearGradient>
    <clipPath id="c8"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg8)"/>
  <g clip-path="url(#c8)">
    <polygon points="14,54 14,34 28,46 40,22 52,46 66,34 66,54" fill="url(#crown-g)"/>
    <rect x="14" y="54" width="52" height="10" rx="3" fill="#c4840a"/>
    <circle cx="14" cy="34" r="5" fill="#ffe566"/>
    <circle cx="40" cy="22" r="5" fill="#ffe566"/>
    <circle cx="66" cy="34" r="5" fill="#ffe566"/>
    <circle cx="14" cy="34" r="3" fill="#ff4444"/>
    <circle cx="40" cy="22" r="3" fill="#4488ff"/>
    <circle cx="66" cy="34" r="3" fill="#44cc44"/>
  </g>
</svg>`,
  },
  {
    id: 'bear',
    label: 'Bear',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg9" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1000"/>
      <stop offset="100%" stop-color="#0d0800"/>
    </linearGradient>
    <clipPath id="c9"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg9)"/>
  <g clip-path="url(#c9)">
    <circle cx="24" cy="30" r="12" fill="#8B6010"/>
    <circle cx="56" cy="30" r="12" fill="#8B6010"/>
    <circle cx="24" cy="28" r="7" fill="#6b4a0c"/>
    <circle cx="56" cy="28" r="7" fill="#6b4a0c"/>
    <ellipse cx="40" cy="50" rx="22" ry="20" fill="#a07018"/>
    <ellipse cx="40" cy="54" rx="14" ry="10" fill="#d4a050"/>
    <circle cx="33" cy="44" r="4.5" fill="#1a0a00"/>
    <circle cx="47" cy="44" r="4.5" fill="#1a0a00"/>
    <circle cx="34.5" cy="42.5" r="1.5" fill="white"/>
    <circle cx="48.5" cy="42.5" r="1.5" fill="white"/>
    <ellipse cx="40" cy="52" rx="5" ry="3.5" fill="#1a0a00"/>
    <path d="M36 56 Q40 60 44 56" stroke="#1a0a00" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="38" cy="52" r="1" fill="#c4840a"/>
    <circle cx="42" cy="52" r="1" fill="#c4840a"/>
  </g>
</svg>`,
  },
  {
    id: 'wolf',
    label: 'Wolf',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg10" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1520"/>
      <stop offset="100%" stop-color="#080c14"/>
    </linearGradient>
    <clipPath id="c10"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg10)"/>
  <g clip-path="url(#c10)">
    <polygon points="22,34 30,16 38,32" fill="#6a7a9a"/>
    <polygon points="58,34 50,16 42,32" fill="#6a7a9a"/>
    <polygon points="24,32 30,20 36,32" fill="#3a4a6a"/>
    <polygon points="56,32 50,20 44,32" fill="#3a4a6a"/>
    <ellipse cx="40" cy="50" rx="20" ry="18" fill="#7a8aaa"/>
    <ellipse cx="40" cy="54" rx="13" ry="10" fill="#c8d4e8"/>
    <circle cx="32" cy="44" r="4.5" fill="#1a2030"/>
    <circle cx="48" cy="44" r="4.5" fill="#1a2030"/>
    <circle cx="33.5" cy="42.5" r="1.8" fill="white"/>
    <circle cx="49.5" cy="42.5" r="1.8" fill="white"/>
    <circle cx="34.2" cy="43.2" r="0.8" fill="#4488ff"/>
    <circle cx="50.2" cy="43.2" r="0.8" fill="#4488ff"/>
    <ellipse cx="40" cy="52" rx="5" ry="3" fill="#8a9aaa"/>
    <path d="M36 56 Q40 60 44 56" stroke="#5a6a7a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <line x1="28" y1="50" x2="22" y2="48" stroke="#6a7a9a" stroke-width="1"/>
    <line x1="28" y1="52" x2="21" y2="51" stroke="#6a7a9a" stroke-width="1"/>
    <line x1="52" y1="50" x2="58" y2="48" stroke="#6a7a9a" stroke-width="1"/>
    <line x1="52" y1="52" x2="59" y2="51" stroke="#6a7a9a" stroke-width="1"/>
  </g>
</svg>`,
  },
  {
    id: 'eagle',
    label: 'Eagle',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg11" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1828"/>
      <stop offset="100%" stop-color="#050e18"/>
    </linearGradient>
    <clipPath id="c11"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg11)"/>
  <g clip-path="url(#c11)">
    <path d="M18 46 Q12 30 22 22 L34 40Z" fill="#8B6010"/>
    <path d="M62 46 Q68 30 58 22 L46 40Z" fill="#8B6010"/>
    <ellipse cx="40" cy="46" rx="18" ry="20" fill="#8B6010"/>
    <circle cx="40" cy="32" r="14" fill="white"/>
    <circle cx="34" cy="30" r="4.5" fill="#1a0a00"/>
    <circle cx="46" cy="30" r="4.5" fill="#1a0a00"/>
    <circle cx="35.5" cy="28.5" r="1.8" fill="white"/>
    <circle cx="47.5" cy="28.5" r="1.8" fill="white"/>
    <circle cx="36" cy="29" r="0.8" fill="#4488ff"/>
    <circle cx="48" cy="29" r="0.8" fill="#4488ff"/>
    <path d="M34 37 Q37 41 40 40 Q43 41 46 37 Q43 34 40 36 Q37 34 34 37Z" fill="#f5a623"/>
    <path d="M40 40 L38 47 L40 45 L42 47 Z" fill="#f5a623"/>
  </g>
</svg>`,
  },
  {
    id: 'bull',
    label: 'Bull',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg12" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0800"/>
      <stop offset="100%" stop-color="#0d0400"/>
    </linearGradient>
    <clipPath id="c12"><circle cx="40" cy="40" r="40"/></clipPath>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg12)"/>
  <g clip-path="url(#c12)">
    <path d="M20 36 Q12 22 18 14 Q22 28 30 34Z" fill="#7a5010"/>
    <path d="M60 36 Q68 22 62 14 Q58 28 50 34Z" fill="#7a5010"/>
    <ellipse cx="40" cy="50" rx="22" ry="20" fill="#8B5c14"/>
    <circle cx="40" cy="38" r="14" fill="#a07028"/>
    <circle cx="33" cy="35" r="4.5" fill="#1a0800"/>
    <circle cx="47" cy="35" r="4.5" fill="#1a0800"/>
    <circle cx="34.5" cy="33.5" r="1.8" fill="white"/>
    <circle cx="48.5" cy="33.5" r="1.8" fill="white"/>
    <ellipse cx="40" cy="43" rx="8" ry="6" fill="#c48030"/>
    <circle cx="37" cy="43" r="1.8" fill="#1a0800"/>
    <circle cx="43" cy="43" r="1.8" fill="#1a0800"/>
    <ellipse cx="40" cy="48" rx="4" ry="2.5" fill="#e8a040"/>
    <path d="M36 51 Q40 55 44 51" stroke="#8a5010" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M20 36 Q16 44 22 46" fill="none" stroke="#7a5010" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 36 Q64 44 58 46" fill="none" stroke="#7a5010" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`,
  },
] as const

export type AvatarPresetId = typeof AVATAR_PRESETS[number]['id']

// Convert SVG string to a data URL safe for use in <img src>
export function presetToDataUrl(svgString: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
}

// Store preset as data URL directly on profile (avoids Supabase storage CORS/SVG issues)
export function presetSvgToStorageData(svgString: string): string {
  return presetToDataUrl(svgString)
}
