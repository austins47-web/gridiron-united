// ── Preset avatar definitions ────────────────────────────────
// SVG avatars rendered inline — no external dependencies needed

export const AVATAR_PRESETS = [
  {
    id: 'helmet-gold',
    label: 'Gold Helmet',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <ellipse cx="40" cy="48" rx="22" ry="18" fill="#F5A623"/>
      <rect x="18" y="42" width="44" height="7" rx="3.5" fill="#c4841c"/>
      <path d="M22 48 Q40 28 58 48" stroke="#c4841c" stroke-width="2" fill="none"/>
      <rect x="30" y="52" width="20" height="8" rx="2" fill="#c4841c"/>
      <line x1="36" y1="52" x2="36" y2="60" stroke="#F5A623" stroke-width="1.5"/>
      <line x1="44" y1="52" x2="44" y2="60" stroke="#F5A623" stroke-width="1.5"/>
      <circle cx="40" cy="32" r="6" fill="#F5A623"/>
    </svg>`,
  },
  {
    id: 'football',
    label: 'Football',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#161b27"/>
      <ellipse cx="40" cy="40" rx="24" ry="16" fill="#8B4513" transform="rotate(-30 40 40)"/>
      <line x1="28" y1="34" x2="52" y2="46" stroke="white" stroke-width="2"/>
      <line x1="34" y1="30" x2="35" y2="50" stroke="white" stroke-width="1.5"/>
      <line x1="40" y1="28" x2="40" y2="52" stroke="white" stroke-width="1.5"/>
      <line x1="46" y1="30" x2="45" y2="50" stroke="white" stroke-width="1.5"/>
    </svg>`,
  },
  {
    id: 'trophy',
    label: 'Trophy',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <path d="M28 20 h24 v18 q0 14-12 17 q-12-3-12-17 Z" fill="#F5A623"/>
      <path d="M28 25 q-10 0-8 12 q2 8 10 8" fill="none" stroke="#c4841c" stroke-width="3"/>
      <path d="M52 25 q10 0 8 12 q-2 8-10 8" fill="none" stroke="#c4841c" stroke-width="3"/>
      <rect x="36" y="55" width="8" height="6" fill="#F5A623"/>
      <rect x="28" y="61" width="24" height="4" rx="2" fill="#c4841c"/>
    </svg>`,
  },
  {
    id: 'lightning',
    label: 'Lightning',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <polygon points="44,14 26,44 40,44 36,66 54,36 40,36" fill="#F5A623"/>
      <polygon points="44,14 26,44 40,44 36,66 54,36 40,36" fill="none" stroke="#c4841c" stroke-width="1.5"/>
    </svg>`,
  },
  {
    id: 'star-player',
    label: 'Star',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <polygon points="40,16 46,34 65,34 50,45 56,63 40,52 24,63 30,45 15,34 34,34"
        fill="#F5A623" stroke="#c4841c" stroke-width="1.5"/>
    </svg>`,
  },
  {
    id: 'shield',
    label: 'Shield',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#161b27"/>
      <path d="M40 16 L58 24 L58 42 Q58 58 40 66 Q22 58 22 42 L22 24 Z" fill="#F5A623"/>
      <path d="M40 22 L54 29 L54 42 Q54 55 40 62 Q26 55 26 42 L26 29 Z" fill="#c4841c"/>
      <text x="40" y="48" font-family="serif" font-size="20" font-weight="bold" fill="#F5A623" text-anchor="middle">G</text>
    </svg>`,
  },
  {
    id: 'rocket',
    label: 'Rocket',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <path d="M40 14 Q52 20 52 38 L52 50 L40 58 L28 50 L28 38 Q28 20 40 14Z" fill="#4a9fe8"/>
      <circle cx="40" cy="36" r="6" fill="white" stroke="#4a9fe8" stroke-width="2"/>
      <path d="M28 50 L20 60 L32 56 Z" fill="#e8a020"/>
      <path d="M52 50 L60 60 L48 56 Z" fill="#e8a020"/>
      <path d="M34 58 Q40 64 46 58 L44 68 Q40 72 36 68 Z" fill="#d04888"/>
    </svg>`,
  },
  {
    id: 'crown',
    label: 'Crown',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <polygon points="16,52 16,34 28,44 40,22 52,44 64,34 64,52" fill="#F5A623"/>
      <rect x="16" y="52" width="48" height="8" rx="2" fill="#c4841c"/>
      <circle cx="16" cy="34" r="4" fill="#F5A623"/>
      <circle cx="40" cy="22" r="4" fill="#F5A623"/>
      <circle cx="64" cy="34" r="4" fill="#F5A623"/>
    </svg>`,
  },
  {
    id: 'bear',
    label: 'Bear',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <circle cx="40" cy="44" r="18" fill="#8B6914"/>
      <circle cx="26" cy="28" r="9" fill="#8B6914"/>
      <circle cx="54" cy="28" r="9" fill="#8B6914"/>
      <circle cx="26" cy="26" r="5" fill="#6b5010"/>
      <circle cx="54" cy="26" r="5" fill="#6b5010"/>
      <ellipse cx="40" cy="50" rx="10" ry="7" fill="#b8892a"/>
      <circle cx="34" cy="42" r="3" fill="#3a2800"/>
      <circle cx="46" cy="42" r="3" fill="#3a2800"/>
      <ellipse cx="40" cy="50" rx="4" ry="3" fill="#3a2800"/>
    </svg>`,
  },
  {
    id: 'wolf',
    label: 'Wolf',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <polygon points="24,28 32,18 36,30" fill="#8a9ab8"/>
      <polygon points="56,28 48,18 44,30" fill="#8a9ab8"/>
      <ellipse cx="40" cy="46" rx="18" ry="16" fill="#8a9ab8"/>
      <ellipse cx="40" cy="48" rx="12" ry="10" fill="#c8d0e0"/>
      <circle cx="33" cy="42" r="3.5" fill="#1e2535"/>
      <circle cx="47" cy="42" r="3.5" fill="#1e2535"/>
      <circle cx="34" cy="41" r="1.2" fill="white"/>
      <circle cx="48" cy="41" r="1.2" fill="white"/>
      <ellipse cx="40" cy="50" rx="5" ry="3" fill="#8a9ab8"/>
      <path d="M36 53 Q40 57 44 53" stroke="#666" stroke-width="1.5" fill="none"/>
    </svg>`,
  },
  {
    id: 'eagle',
    label: 'Eagle',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <ellipse cx="40" cy="42" rx="16" ry="18" fill="#8B6914"/>
      <circle cx="40" cy="30" r="12" fill="white"/>
      <circle cx="35" cy="28" r="3.5" fill="#1e2535"/>
      <circle cx="45" cy="28" r="3.5" fill="#1e2535"/>
      <circle cx="36" cy="27" r="1.2" fill="white"/>
      <circle cx="46" cy="27" r="1.2" fill="white"/>
      <path d="M34 35 Q40 40 46 35 Q44 32 40 33 Q36 32 34 35Z" fill="#F5A623"/>
      <path d="M22 38 Q18 28 26 24 L32 36Z" fill="#8B6914"/>
      <path d="M58 38 Q62 28 54 24 L48 36Z" fill="#8B6914"/>
    </svg>`,
  },
  {
    id: 'bull',
    label: 'Bull',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#1e2535"/>
      <ellipse cx="40" cy="46" rx="18" ry="16" fill="#6b4c11"/>
      <path d="M22 32 Q16 24 20 18 Q24 28 28 32Z" fill="#6b4c11"/>
      <path d="M58 32 Q64 24 60 18 Q56 28 52 32Z" fill="#6b4c11"/>
      <circle cx="40" cy="36" r="12" fill="#8B6914"/>
      <circle cx="34" cy="33" r="3.5" fill="#1e2535"/>
      <circle cx="46" cy="33" r="3.5" fill="#1e2535"/>
      <circle cx="35" cy="32" r="1.2" fill="white"/>
      <circle cx="47" cy="32" r="1.2" fill="white"/>
      <ellipse cx="40" cy="40" rx="7" ry="5" fill="#b8892a"/>
      <circle cx="37" cy="40" r="1.5" fill="#1e2535"/>
      <circle cx="43" cy="40" r="1.5" fill="#1e2535"/>
    </svg>`,
  },
] as const

export type AvatarPresetId = typeof AVATAR_PRESETS[number]['id']

// ── Renders a preset as an img-like component ─────────────────
export function PresetAvatar({ id, size = 40 }: { id: string; size?: number }) {
  const preset = AVATAR_PRESETS.find(p => p.id === id)
  if (!preset) return null
  const blob = new Blob([preset.svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  return (
    <img src={url} alt={preset.label} width={size} height={size}
      className="rounded-full object-cover" />
  )
}

// Inline SVG string as data URL (no Blob needed — works in img tags directly)
export function presetToDataUrl(svgString: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
}
